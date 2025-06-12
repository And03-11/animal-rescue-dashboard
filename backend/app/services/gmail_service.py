# backend/app/services/gmail_service.py
import os
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.send']

class GmailService:
    def __init__(self, credentials_path: str):
        self.credentials_path = credentials_path
        self.token_path = f"token_{os.path.basename(credentials_path)}.json"
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

    def send_email(self, to_email: str, subject: str, html_body: str):
        try:
            message = MIMEMultipart("alternative")
            message['To'] = to_email
            message['Subject'] = subject
            message['From'] = "me" # Se enviará desde la cuenta autenticada

            message.attach(MIMEText(html_body, 'html', 'utf-8'))

            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
            body = {'raw': raw_message}

            self.service.users().messages().send(userId='me', body=body).execute()
            print(f"Correo enviado exitosamente a {to_email}")
            return True
        except Exception as e:
            print(f"Error al enviar correo a {to_email}: {e}")
            return False