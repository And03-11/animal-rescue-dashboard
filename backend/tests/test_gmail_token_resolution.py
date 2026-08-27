from pathlib import Path

import pytest

from backend.app.scripts import reauthorize_credentials
from backend.app.services import gmail_service


class _ValidCredentials:
    valid = True
    expired = False
    refresh_token = None

    def to_json(self):
        return "{}"


@pytest.mark.parametrize(
    "token_location",
    [
        "same-directory-canonical",
        "same-directory-legacy",
        "project-root-legacy",
    ],
)
def test_gmail_service_reuses_supported_existing_token_without_oauth(
    tmp_path, monkeypatch, token_location
):
    project_root = tmp_path / "project"
    credentials_dir = project_root / "backend" / "gmail_credentials" / "BigPond"
    credentials_dir.mkdir(parents=True)
    credentials_path = credentials_dir / "credentials_account_BP.json"
    credentials_path.write_text("{}", encoding="utf-8")

    locations = {
        "same-directory-canonical": (
            credentials_dir / "token_credentials_account_BP.json"
        ),
        "same-directory-legacy": (
            credentials_dir / "token_credentials_account_BP.json.json"
        ),
        "project-root-legacy": (
            project_root / "token_credentials_account_BP.json.json"
        ),
    }
    expected_token_path = locations[token_location]
    expected_token_path.write_text("{}", encoding="utf-8")

    def load_existing_credentials(path, scopes):
        assert Path(path) == expected_token_path
        assert scopes == gmail_service.SCOPES
        return _ValidCredentials()

    class OAuthMustNotOpen:
        @classmethod
        def from_client_secrets_file(cls, *args, **kwargs):
            raise AssertionError("OAuth must not open when a supported token exists")

    built_service = object()
    monkeypatch.setattr(
        gmail_service, "PROJECT_ROOT", str(project_root), raising=False
    )
    monkeypatch.setattr(
        gmail_service.Credentials,
        "from_authorized_user_file",
        load_existing_credentials,
    )
    monkeypatch.setattr(gmail_service, "InstalledAppFlow", OAuthMustNotOpen)
    monkeypatch.setattr(gmail_service, "build", lambda *args, **kwargs: built_service)

    service = gmail_service.GmailService(str(credentials_path))

    assert Path(service.token_path) == expected_token_path
    assert service.service is built_service


def test_gmail_service_uses_same_directory_canonical_path_for_a_new_token(
    tmp_path, monkeypatch
):
    project_root = tmp_path / "project"
    credentials_dir = project_root / "backend" / "gmail_credentials" / "Normal"
    credentials_dir.mkdir(parents=True)
    credentials_path = credentials_dir / "credentials_account1.json"
    credentials_path.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(
        gmail_service, "PROJECT_ROOT", str(project_root), raising=False
    )

    token_path = gmail_service.resolve_gmail_token_path(str(credentials_path))

    assert Path(token_path) == credentials_dir / "token_credentials_account1.json"


def test_resolver_derives_project_root_from_credentials_location(
    tmp_path, monkeypatch
):
    project_root = tmp_path / "project"
    credentials_dir = project_root / "backend" / "gmail_credentials" / "Normal"
    credentials_dir.mkdir(parents=True)
    credentials_path = credentials_dir / "credentials_account1.json"
    credentials_path.write_text("{}", encoding="utf-8")
    project_token = project_root / "token_credentials_account1.json.json"
    project_token.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(
        gmail_service,
        "PROJECT_ROOT",
        str(tmp_path / "unrelated-worktree-root"),
        raising=False,
    )

    token_path = gmail_service.resolve_gmail_token_path(str(credentials_path))

    assert Path(token_path) == project_token


def test_project_root_token_precedes_same_directory_legacy_token(tmp_path):
    project_root = tmp_path / "project"
    credentials_dir = project_root / "backend" / "gmail_credentials" / "BigPond"
    credentials_dir.mkdir(parents=True)
    credentials_path = credentials_dir / "credentials_account_BP.json"
    credentials_path.write_text("{}", encoding="utf-8")
    same_directory_legacy = (
        credentials_dir / "token_credentials_account_BP.json.json"
    )
    same_directory_legacy.write_text("{}", encoding="utf-8")
    project_token = project_root / "token_credentials_account_BP.json.json"
    project_token.write_text("{}", encoding="utf-8")

    token_path = gmail_service.resolve_gmail_token_path(str(credentials_path))

    assert Path(token_path) == project_token


def test_reauthorize_script_reuses_same_directory_token(tmp_path, monkeypatch):
    project_root = tmp_path / "project"
    credentials_dir = project_root / "backend" / "gmail_credentials" / "Normal"
    credentials_dir.mkdir(parents=True)
    credential_filename = "credentials_account4.json"
    (credentials_dir / credential_filename).write_text("{}", encoding="utf-8")
    existing_token = credentials_dir / "token_credentials_account4.json.json"
    existing_token.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(
        reauthorize_credentials, "CREDENTIALS_NORMAL_DIR", str(credentials_dir)
    )
    monkeypatch.setattr(reauthorize_credentials, "PROJECT_ROOT", str(project_root))

    token_path = reauthorize_credentials.get_token_path(credential_filename)

    assert Path(token_path) == existing_token
