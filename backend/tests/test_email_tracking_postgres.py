from backend.app.services import email_tracking


def test_postgres_repository_registers_uuid_adapter_on_each_connection(
    monkeypatch,
):
    connection = object()
    registrations = []

    monkeypatch.setattr(
        email_tracking.psycopg2,
        "connect",
        lambda *args, **kwargs: connection,
    )
    monkeypatch.setattr(
        email_tracking,
        "register_uuid",
        lambda *, conn_or_curs: registrations.append(conn_or_curs),
        raising=False,
    )

    repository = email_tracking.PostgresEmailTrackingRepository(
        "postgresql://tracking:test@localhost/tracking"
    )

    assert repository._connect() is connection
    assert registrations == [connection]
