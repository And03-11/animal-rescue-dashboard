# --- Archivo: backend/tests/test_dashboard.py ---
import sys, os
# Asegurar que 'app' se resuelva
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user  # ✅ para override

# 🔐 Override para simular autenticación en todos los tests
app.dependency_overrides[get_current_user] = lambda: "test@example.com"

client = TestClient(app)

def test_get_dashboard_metrics_success():
    response = client.get(
        "/api/v1/dashboard/metrics",
        headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:5173'

    data = response.json()
    assert 'glance' in data and 'filtered' in data
    glance = data['glance']
    assert 'amountToday' in glance
    assert 'amountThisMonth' in glance
    assert isinstance(glance.get('glanceTrend'), list)

@pytest.mark.parametrize('origin', ['http://localhost:3000', 'http://localhost:5173'])
def test_cors_header_present(origin):
    response = client.get(
        "/api/v1/dashboard/metrics",
        headers={"Origin": origin}
    )
    assert response.headers.get('access-control-allow-origin') == origin
