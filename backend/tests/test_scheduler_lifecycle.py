from fastapi.testclient import TestClient

from backend.app import main as main_module
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


def test_application_lifespan_can_disable_scheduler_for_isolated_instances(
    monkeypatch,
):
    lifecycle_calls = []
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setattr(
        main_module.email_sender,
        "recover_interrupted_campaigns",
        lambda: lifecycle_calls.append("recover"),
    )
    monkeypatch.setattr(
        main_module,
        "start_scheduler",
        lambda: lifecycle_calls.append("start"),
    )
    monkeypatch.setattr(
        main_module,
        "stop_scheduler",
        lambda: lifecycle_calls.append("stop"),
    )

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

    assert lifecycle_calls == []
