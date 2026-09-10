from backend.app.services.email_sender_service import EmailSenderService


class TransactionalCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rows = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        if "UPDATE email_sender_campaigns" not in query:
            raise AssertionError("Unexpected query")
        campaign_id = params[0]
        if (
            campaign_id == self.connection.state["id"]
            and self.connection.state["status"] == "Scheduled"
        ):
            self.connection.pending_status = "Launching"
            self.rows = [{**self.connection.state, "status": "Launching"}]
            self.rowcount = 1
        else:
            self.rows = []
            self.rowcount = 0

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class TransactionalConnection:
    def __init__(self, state):
        self.state = state
        self.pending_status = None
        self.committed = False
        self.rolled_back = False

    def cursor(self, **_kwargs):
        return TransactionalCursor(self)

    def commit(self):
        if self.pending_status is not None:
            self.state["status"] = self.pending_status
        self.committed = True

    def rollback(self):
        self.pending_status = None
        self.rolled_back = True

    def close(self):
        self.pending_status = None


def test_mark_campaign_launching_durably_claims_scheduled_campaign(monkeypatch):
    """Omitting the transaction commit must leave this regression test red."""

    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://test")
    state = {"id": "Campaign_scheduled", "status": "Scheduled"}
    connection = TransactionalConnection(state)
    service = EmailSenderService()
    monkeypatch.setattr(service, "_get_connection", lambda: connection)

    claimed = service.mark_campaign_launching("Campaign_scheduled")

    assert claimed["status"] == "Launching"
    assert state["status"] == "Launching"
    assert connection.committed is True
