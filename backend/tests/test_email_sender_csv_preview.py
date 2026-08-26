import json

import pytest
from fastapi.testclient import TestClient

from backend.app.core.security import get_current_user
from backend.app.main import app
from backend.app.api.v1.endpoints import email_sender
from backend.app.services.campaign_csv import read_csv_preview_rows, read_mapped_contacts


client = TestClient(app)


@pytest.fixture(autouse=True)
def authenticated_admin():
    previous_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: "admin@example.com"
    yield
    if previous_override is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous_override


def test_read_csv_preview_rows_detects_semicolon_header(tmp_path):
    csv_path = tmp_path / "contacts.csv"
    csv_path.write_text(
        "Email;Name\nana@example.com;Ana\n",
        encoding="utf-8-sig",
    )

    first_row, second_row, delimiter = read_csv_preview_rows(csv_path)

    assert first_row == ["Email", "Name"]
    assert second_row == ["ana@example.com", "Ana"]
    assert delimiter == ";"


def test_read_csv_preview_rows_falls_back_to_latin_1(tmp_path):
    csv_path = tmp_path / "contacts-latin1.csv"
    csv_path.write_bytes("Email;Name\nana@example.com;Peña\n".encode("latin-1"))

    first_row, second_row, delimiter = read_csv_preview_rows(csv_path)

    assert first_row == ["Email", "Name"]
    assert second_row == ["ana@example.com", "Peña"]
    assert delimiter == ";"


def test_read_mapped_contacts_preserves_header_mapping_and_validation(tmp_path):
    csv_path = tmp_path / "mapped-contacts.csv"
    csv_path.write_text(
        "Email;Name\nana@example.com;Ana\ninvalid-address;Ignored\nleo@example.com;\n",
        encoding="utf-8-sig",
    )

    contacts = read_mapped_contacts(
        csv_path,
        {"email": "Email", "name": "Name", "has_header": True},
        "Campaign_test",
    )

    assert contacts == [
        {"Email": "ana@example.com", "Name": "Ana"},
        {"Email": "leo@example.com", "Name": "Valued Supporter"},
    ]


def test_read_mapped_contacts_preserves_headerless_column_mapping(tmp_path):
    csv_path = tmp_path / "headerless-contacts.csv"
    csv_path.write_text(
        "ana@example.com,Ana\nleo@example.com,Leo\n",
        encoding="utf-8-sig",
    )

    contacts = read_mapped_contacts(
        csv_path,
        {"email": "Columna 1", "name": "Columna 2", "has_header": False},
        "Campaign_test",
    )

    assert contacts == [
        {"Email": "ana@example.com", "Name": "Ana"},
        {"Email": "leo@example.com", "Name": "Leo"},
    ]


def test_csv_preview_endpoint_keeps_existing_response_shape(tmp_path, monkeypatch):
    campaign_data = tmp_path / "campaign_data"
    campaign_targets = tmp_path / "campaign_targets"
    campaign_data.mkdir()
    campaign_targets.mkdir()

    campaign_id = "Campaign_preview"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps({"id": campaign_id, "source_type": "csv", "status": "Draft"}),
        encoding="utf-8",
    )
    (campaign_targets / f"target_{campaign_id}.csv").write_text(
        "Email;Name\nana@example.com;Ana\n",
        encoding="utf-8-sig",
    )

    monkeypatch.setattr(email_sender, "CAMPAIGN_DATA_DIR", str(campaign_data))
    monkeypatch.setattr(email_sender, "TARGETS_DIR", str(campaign_targets))

    response = client.get(f"/api/v1/sender/campaigns/{campaign_id}/csv-preview")

    assert response.status_code == 200
    assert response.json() == {
        "columns": ["Email", "Name"],
        "has_header": True,

        "preview_row": ["ana@example.com", "Ana"],
        "delimiter_detected": ";",
    }

def test_read_mapped_contacts_deduplicates_normalized_valid_recipients(tmp_path):
    csv_path = tmp_path / "deduped-contacts.csv"
    csv_path.write_text(
        "Email,Name\n ANA@example.com ,Ana\nana@EXAMPLE.com,Duplicate\n"
        "invalid,Ignored\nleo@example.com,Leo\n",
        encoding="utf-8-sig",
    )

    contacts = read_mapped_contacts(
        csv_path,
        {"email": "Email", "name": "Name", "has_header": True},
        "Campaign_test",
    )

    assert contacts == [
        {"Email": "ANA@example.com", "Name": "Ana"},
        {"Email": "leo@example.com", "Name": "Leo"},
    ]


@pytest.mark.parametrize("delimiter", [",", ";", "\t", "|"])
@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "latin-1"])
def test_upload_preview_and_worker_share_dialect_and_encoding(
    tmp_path,
    delimiter,
    encoding,
):
    text = (
        f"Email{delimiter}Name\n"
        f" ANA@example.com {delimiter}Peña\n"
        f"ana@EXAMPLE.com{delimiter}Duplicate\n"
        f"leo@example.com{delimiter}Leo\n"
    )
    content = text.encode(encoding)

    email_sender._validate_csv_upload("contacts.csv", "text/csv", content)
    csv_path = tmp_path / f"contacts-{encoding}.csv"
    csv_path.write_bytes(content)

    first, second, detected = read_csv_preview_rows(csv_path)
    contacts = read_mapped_contacts(
        csv_path,
        {"email": "Email", "name": "Name", "has_header": True},
        "Campaign_dialect",
    )

    assert first == ["Email", "Name"]
    assert second == [" ANA@example.com ", "Peña"]
    assert detected == delimiter
    assert contacts == [
        {"Email": "ANA@example.com", "Name": "Peña"},
        {"Email": "leo@example.com", "Name": "Leo"},
    ]
