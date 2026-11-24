import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.security import get_current_user
from backend.app.db.database import Base, get_db
from backend.app.main import app
from backend.app.api.v1.endpoints import templates


@pytest.fixture
def template_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    def db():
        with factory() as session:
            yield session
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: "tester"
    client = TestClient(app)  # No app lifespan or scheduler during these tests.
    yield client
    client.close()
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    engine.dispose()


def test_template_phrases_round_trip_and_preserve_html(template_client):
    html = '<!DOCTYPE html>\n<table style="width:600px"><tr><td>{{Day}}</td></tr></table>'
    created = template_client.post('/api/v1/templates', json={"name": "Donor thanks", "content": html,
        "donor_singular_phrase": "gift you gave {{when}}", "donor_plural_phrase": "{{count}} gifts this campaign"})
    assert created.status_code == 201
    data = created.json()
    assert data['content'] == html
    assert data['donor_singular_phrase'] == 'gift you gave {{when}}'
    response = template_client.put(f"/api/v1/templates/{data['id']}", json={
        "donor_plural_phrase": "{{count}} donations you’ve made over the past week"})
    assert response.status_code == 200
    fetched = template_client.get(f"/api/v1/templates/{data['id']}").json()
    assert fetched['donor_plural_phrase'] == '{{count}} donations you’ve made over the past week'
    assert fetched['donor_singular_phrase'] == 'gift you gave {{when}}'
    assert fetched['content'] == html
    summary = template_client.get('/api/v1/templates').json()[0]
    assert 'content' not in summary


def test_legacy_template_creation_gets_defaults_and_bad_phrase_is_rejected(template_client):
    created = template_client.post('/api/v1/templates', json={"name": "Legacy", "content": "<p>Hi</p>"}).json()
    assert created['donor_singular_phrase'] == 'donation you made {{when}}'
    bad = template_client.put(f"/api/v1/templates/{created['id']}", json={"donor_plural_phrase": "{{Day}}"})
    assert bad.status_code == 422
    assert template_client.get(f"/api/v1/templates/{created['id']}").json()['donor_plural_phrase'] == created['donor_plural_phrase']


def test_template_test_email_uses_selected_donor_example_without_airtable(template_client, monkeypatch):
    sent = []
    class FakeGmail:
        def __init__(self, _path):
            pass
        def send_email(self, **kwargs):
            sent.append(kwargs)
            return True
    monkeypatch.setattr(templates, 'GmailService', FakeGmail)
    monkeypatch.setattr(templates.credentials_manager_instance, 'list_accounts', lambda: [{'id': 'fake', 'path': 'fake.json'}])
    created = template_client.post('/api/v1/templates', json={"name": "Test", "content": "<p>{{name}}: {{day}}</p>"}).json()
    response = template_client.post(f"/api/v1/templates/{created['id']}/send-test", json={
        "emails": ["test@example.org"], "donor_preview_count": 3})
    assert response.status_code == 200
    assert sent[0]['html_body'] == '<p>Test User: three donations you’ve made over the past week</p>'


def test_donor_detection_does_not_create_or_modify_a_template(template_client):
    html = '<p>Thank you for your donation three days ago.</p>'
    response = template_client.post('/api/v1/templates/detect-donor-phrase', json={'content': html})
    assert response.status_code == 200
    assert response.json()['content'] == '<p>Thank you for your {{Day}}.</p>'
    assert response.json()['donor_singular_phrase'] == 'donation {{when}}'
    assert template_client.get('/api/v1/templates').json() == []


def test_donor_detection_limits_input_size(template_client):
    assert template_client.post('/api/v1/templates/detect-donor-phrase', json={'content': ''}).status_code == 422
    assert template_client.post('/api/v1/templates/detect-donor-phrase', json={'content': 'x' * 1_000_001}).status_code == 422


def test_donor_detection_requires_authentication(template_client):
    override = app.dependency_overrides.pop(get_current_user)
    try:
        response = template_client.post('/api/v1/templates/detect-donor-phrase', json={'content': '<p>Hello</p>'})
        assert response.status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = override
