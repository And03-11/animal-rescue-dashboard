import json

from backend.app.scripts import create_email_sender_table
from backend.app.services.email_sender_service import EmailSenderService


class FakeCursor:
    def __init__(self, row=None, table_exists=False):
        self.row = row
        self.table_exists = table_exists
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))

    def fetchone(self):
        if self.calls and "information_schema.tables" in self.calls[-1][0]:
            return (self.table_exists,)
        return self.row

    def fetchall(self):
        return []

    def close(self):
        pass


class FakeConnection:
    def __init__(self, cursor):
        self.cursor_instance = cursor

    def cursor(self, **_kwargs):
        return self.cursor_instance

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def test_create_campaign_serializes_audiences_once_and_persists_segment(monkeypatch):
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://test")
    cursor = FakeCursor(row={"id": "Campaign_audience"})
    service = EmailSenderService()
    monkeypatch.setattr(service, "_get_connection", lambda: FakeConnection(cursor))
    audiences = [
        {"region": "USA", "is_bounced": False},
        {"region": "EUR", "is_bounced": True},
    ]

    service.create_campaign(
        {
            "id": "Campaign_audience",
            "campaign_name": "Audience campaign",
            "source_type": "airtable",
            "audiences": audiences,
            "segment": "dnr",
        }
    )

    query, params = cursor.calls[-1]
    audiences_json = json.dumps(audiences)
    assert "audiences" in query
    assert "segment" in query
    assert params.count(audiences_json) == 1
    assert params[params.index(audiences_json) + 1] == "dnr"


def test_update_campaign_persists_all_editable_fields_and_serializes_audiences_once(
    monkeypatch,
):
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://test")
    cursor = FakeCursor(row={"id": "Campaign_audience"})
    service = EmailSenderService()
    monkeypatch.setattr(service, "_get_connection", lambda: FakeConnection(cursor))
    audiences = [{"region": "USA", "is_bounced": False}]

    service.update_campaign(
        "Campaign_audience",
        {
            "campaign_name": "Renamed",
            "subject": "Subject",
            "html_body": "<p>Body</p>",
            "sender_config": ["sender@example.com"],
            "region": "USA",
            "is_bounced": False,
            "audiences": audiences,
            "segment": "dnr",
        },
    )

    query, params = cursor.calls[-1]
    audiences_json = json.dumps(audiences)
    for field in (
        "campaign_name",
        "subject",
        "html_body",
        "sender_config",
        "region",
        "is_bounced",
        "audiences",
        "segment",
    ):
        assert f"{field} = %s" in query
    assert params.count(audiences_json) == 1
    assert params[-2:] == ("dnr", "Campaign_audience")


def test_schema_adds_audience_columns_idempotently_for_existing_table(monkeypatch):
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://test")
    cursor = FakeCursor(table_exists=True)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(create_email_sender_table.psycopg2, "connect", lambda _url: connection)

    assert create_email_sender_table.create_email_sender_table() is True

    statements = "\n".join(query for query, _params in cursor.calls)
    assert "ADD COLUMN IF NOT EXISTS audiences JSONB NOT NULL DEFAULT '[]'::jsonb" in statements
    assert "ADD COLUMN IF NOT EXISTS segment VARCHAR(20) NOT NULL DEFAULT 'standard'" in statements


def test_schema_defines_audience_columns_for_new_table(monkeypatch):
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://test")
    cursor = FakeCursor(table_exists=False)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(create_email_sender_table.psycopg2, "connect", lambda _url: connection)

    assert create_email_sender_table.create_email_sender_table() is True

    create_statement = next(
        query for query, _params in cursor.calls if "CREATE TABLE" in query
    )
    assert "audiences JSONB NOT NULL DEFAULT '[]'::jsonb" in create_statement
    assert "segment VARCHAR(20) NOT NULL DEFAULT 'standard'" in create_statement
