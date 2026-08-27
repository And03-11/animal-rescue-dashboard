import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.security import get_current_user
from backend.app.db.database import Base, get_db
from backend.app.main import app


@pytest.fixture()
def studio_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    previous_db = app.dependency_overrides.get(get_db)
    previous_user = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: {"username": "designer"}

    with TestClient(app) as client:
        yield client

    if previous_db is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_db
    if previous_user is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous_user
    engine.dispose()


def test_email_studio_project_state_round_trips(studio_client: TestClient):
    project = '{"pages":[{"id":"page-1"}]}'
    create_response = studio_client.post(
        "/api/v1/templates",
        json={
            "name": "Studio welcome",
            "content": "<html><body><h1>Hello</h1></body></html>",
            "design_json": project,
        },
    )

    assert create_response.status_code == 201
    template = create_response.json()
    assert template["design_json"] == project

    read_response = studio_client.get(f"/api/v1/templates/{template['id']}")
    assert read_response.status_code == 200
    assert read_response.json()["design_json"] == project


def test_legacy_template_can_gain_editable_project_state(studio_client: TestClient):
    create_response = studio_client.post(
        "/api/v1/templates",
        json={"name": "Legacy HTML", "content": "<p>Imported message</p>"},
    )
    template = create_response.json()
    assert template["design_json"] is None

    update_response = studio_client.put(
        f"/api/v1/templates/{template['id']}",
        json={
            "content": "<html><body><p style=\"color:#087a70\">Edited</p></body></html>",
            "design_json": '{"assets":[],"styles":[]}',
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["design_json"] == '{"assets":[],"styles":[]}'
    assert "#087a70" in update_response.json()["content"]
