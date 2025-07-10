# --- Archivo: backend/tests/test_dashboard.py ---
import sys, os
# Asegurar que 'app' se resuelva
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_get_dashboard_metrics_success():
    """
    GET /api/v1/dashboard/metrics devuelve 200 con claves 'glance' y 'filtered'.
    """
    response = client.get(
        "/api/v1/dashboard/metrics",
        headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    # Validar CORS
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:5173'

    data = response.json()
    # Estructura esperada
    assert 'glance' in data and 'filtered' in data
    glance = data['glance']
    # Validar campos mínimos en 'glance'
    assert 'amountToday' in glance
    assert 'amountThisMonth' in glance
    assert isinstance(glance.get('glanceTrend'), list)

@pytest.mark.parametrize('origin', ['http://localhost:3000', 'http://localhost:5173'])
def test_cors_header_present(origin):
    """
    Verifica que el header CORS se incluye en todas las peticiones.
    """
    response = client.get(
        "/api/v1/dashboard/metrics",
        headers={"Origin": origin}
    )
    assert response.headers.get('access-control-allow-origin') == origin

# Nota: test de manejo de errores no implementado, ya que la lógica actual del endpoint no expone casos 500 directamente.
