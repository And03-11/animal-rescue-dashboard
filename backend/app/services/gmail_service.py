# backend/app/services/gmail_service.py
import os
import base64
import re
from dataclasses import dataclass
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Mapping
from html.parser import HTMLParser

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.send']
_HEADER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)


class _EmailHtmlToTextParser(HTMLParser):
    _BLOCK_TAGS = frozenset(
        {
            "address", "article", "blockquote", "div", "footer", "h1", "h2",
            "h3", "h4", "h5", "h6", "header", "li", "main", "ol", "p",
            "section", "table", "tr", "ul",
        }
    )
    _IGNORED_TAGS = frozenset({"script", "style"})
    _TABLE_CELL_TAGS = frozenset({"td", "th"})

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._ignored_depth = 0
        self._links: list[str | None] = []
        self._pending_links: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag == "br" or tag in self._BLOCK_TAGS:
            self._newline()
        if tag == "a":
            self._links.append(dict(attrs).get("href"))

    def handle_startendtag(self, tag: str, attrs):
        if tag.casefold() == "br" and not self._ignored_depth:
            self._newline()

    def handle_endtag(self, tag: str):
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS:
            if self._ignored_depth:
                self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
        if tag == "a" and self._links:
            href = self._links.pop()
            if href:
                self._pending_links.append(href)
        if tag in self._TABLE_CELL_TAGS:
            self._separator()
        if tag in self._BLOCK_TAGS:
            self._flush_pending_links()
            self._newline()

    def handle_data(self, data: str):
        if self._ignored_depth:
            return
        collapsed = re.sub(r"\s+", " ", data)
        if not collapsed.strip():
            if self._chunks and not self._chunks[-1].endswith((" ", "\n")):
                self._chunks.append(" ")
            return
        if collapsed.startswith(" ") and self._chunks and not self._chunks[-1].endswith((" ", "\n")):
            self._chunks.append(" ")
        self._chunks.append(collapsed.strip())
        if collapsed.endswith(" "):
            self._chunks.append(" ")

    def text(self) -> str:
        self._flush_pending_links()
        value = "".join(self._chunks)
        value = re.sub(r"[ \t]+\n", "\n", value)
        value = re.sub(r"\n[ \t]+", "\n", value)
        value = re.sub(r" {2,}", " ", value)
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()

    def _flush_pending_links(self):
        while self._pending_links:
            self._chunks.append(f" ({self._pending_links.pop(0)})")

    def _newline(self):
        if self._chunks and not self._chunks[-1].endswith("\n"):
            self._chunks.append("\n")

    def _separator(self):
        if self._chunks and not self._chunks[-1].endswith((" ", "\n")):
            self._chunks.append(" ")


def _html_to_plain_text(html_body: str) -> str:
    parser = _EmailHtmlToTextParser()
    parser.feed(html_body)
    parser.close()
    return parser.text()


def resolve_gmail_token_path(
    credentials_path: str, *, project_root: str | None = None
) -> str:
    """Return an existing compatible token path, or the canonical new path."""
    credentials_file = Path(credentials_path).resolve()
    credential_filename = credentials_file.name
    credentials_dir = credentials_file.parent
    canonical_path = credentials_dir / f"token_{credential_filename}"
    legacy_filename = f"token_{credential_filename}.json"

    if project_root is None:
        resolved_project_root = None
        for parent in credentials_file.parents:
            if parent.name.casefold() == "gmail_credentials":
                resolved_project_root = parent.parent.parent
                break
        if resolved_project_root is None:
            resolved_project_root = Path(PROJECT_ROOT).resolve()
    else:
        resolved_project_root = Path(project_root).resolve()

    candidates = (
        canonical_path,
        resolved_project_root / legacy_filename,
        credentials_dir / legacy_filename,
    )

    for token_path in candidates:
        if token_path.exists():
            return str(token_path)

    return str(canonical_path)


@dataclass(frozen=True)
class GmailSendResult:
    success: bool
    message_id: str | None = None
    thread_id: str | None = None
    error: str | None = None

    def __bool__(self) -> bool:
        return self.success

class GmailService:
    def __init__(self, credentials_path: str):
        self.credentials_path = credentials_path
        self.token_path = resolve_gmail_token_path(credentials_path)
        self.service = self._authenticate()

    def _authenticate(self):
        creds = None
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                # Esta parte requiere interacción la primera vez.
                # Debemos ejecutarla una vez por separado para generar el token.
                print("Por favor, autoriza el acceso a tu cuenta de Gmail.")
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, SCOPES)
                creds = flow.run_local_server(port=0)

            with open(self.token_path, 'w') as token:
                token.write(creds.to_json())

        return build('gmail', 'v1', credentials=creds)

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        *,
        extra_headers: Mapping[str, str] | None = None,
    ) -> GmailSendResult:
        validated_headers: dict[str, str] = {}
        for name, value in (extra_headers or {}).items():
            if not isinstance(name, str) or not _HEADER_NAME_PATTERN.fullmatch(name):
                raise ValueError("Email header names may contain only letters, numbers, and hyphens")
            if not isinstance(value, str):
                raise ValueError("Email header values must be strings")
            if "\r" in value or "\n" in value:
                raise ValueError("Email header values cannot contain newlines")
            validated_headers[name] = value

        try:
            message = MIMEMultipart("alternative")
            message['To'] = to_email
            message['Subject'] = subject
            message['From'] = "me" # Se enviará desde la cuenta autenticada
            for name, value in validated_headers.items():
                message[name] = value

            message.attach(MIMEText(_html_to_plain_text(html_body), 'plain', 'utf-8'))
            message.attach(MIMEText(html_body, 'html', 'utf-8'))

            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
            body = {'raw': raw_message}

            response = self.service.users().messages().send(
                userId='me', body=body
            ).execute()
            print(f"Correo enviado exitosamente a {to_email}")
            return GmailSendResult(
                success=True,
                message_id=response.get("id") if isinstance(response, dict) else None,
                thread_id=(
                    response.get("threadId") if isinstance(response, dict) else None
                ),
            )
        except Exception as e:
            print(f"Error al enviar correo a {to_email}: {e}")
            return GmailSendResult(success=False, error=str(e)[:512])
