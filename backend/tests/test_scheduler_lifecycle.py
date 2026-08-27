from fastapi.testclient import TestClient

from backend.app.main import app


def test_application_lifespan_can_restart_scheduler_after_shutdown():
    with TestClient(app) as first_client:
        assert first_client.get('/health').status_code == 200

    restart_error = None
    try:
        with TestClient(app) as second_client:
            assert second_client.get('/health').status_code == 200
    except RuntimeError as error:
        restart_error = error

    assert restart_error is None
