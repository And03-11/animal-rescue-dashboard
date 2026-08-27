"""Authentication configuration and error-handling regression tests."""

from fastapi.testclient import TestClient

from backend.app.core.security import _require_secure_secret_key
from backend.app.db.database import get_db
from backend.app.main import app


client = TestClient(app)


def test_placeholder_jwt_secrets_are_rejected():
    for value in (None, "short", "super-secret-key", "your-super-secret-jwt-key-change-in-production"):
        try:
            _require_secure_secret_key(value)
        except RuntimeError:
            continue
        raise AssertionError(f"Insecure secret was accepted: {value!r}")


def test_login_does_not_expose_internal_database_errors():
    class BrokenSession:
        def query(self, model):
            raise RuntimeError("sensitive database connection detail")

    def broken_db():
        yield BrokenSession()

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.post(
            "/api/v1/login",
            data={"username": "person@example.org", "password": "not-a-password"},
        )
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous

    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to complete login"}
    assert "sensitive" not in response.text
