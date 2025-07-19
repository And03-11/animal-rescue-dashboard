# app/api/v1/endpoints/websockets.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Header, HTTPException, status
from typing import Optional
import os
from backend.app.websockets.connection_manager import manager


# Creamos un nuevo router, igual que en los otros endpoints
router = APIRouter()

@router.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket):
    """
    Endpoint WebSocket para la comunicación en tiempo real.

    1. Acepta la conexión del cliente.
    2. Lo mantiene en un bucle hasta que el cliente se desconecte.
    3. Asegura la desconexión limpia del gestor.
    """
    # Usa nuestro gestor para aceptar y registrar la nueva conexión.
    await manager.connect(websocket)
    try:
        # Este bucle mantiene la conexión viva.
        # Espera a recibir cualquier mensaje del cliente, aunque en este
        # caso no haremos nada con ellos. El bucle se romperá si el
        # cliente se desconecta.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        # Si el cliente se desconecta (cierra la pestaña, etc.),
        # se lanza esta excepción.
        manager.disconnect(websocket)
        print("Client disconnected.") # Opcional: para logging en el servidor


@router.post("/webhooks/new-donation-notification")
async def new_donation_webhook(x_webhook_secret: Optional[str] = Header(None)):
    """
    Webhook para recibir notificaciones de nuevas donaciones desde Airtable.

    Valida la llamada usando una clave secreta y, si es válida,
    emite una notificación a todos los clientes conectados.
    """
    # 1. Cargar la clave secreta desde las variables de entorno.
    webhook_secret = os.getenv("WEBHOOK_SECRET_KEY")

    # 2. Validar que la clave secreta exista y que la recibida sea correcta.
    if not webhook_secret or x_webhook_secret != webhook_secret:
        # Si la clave no es válida, denegar el acceso.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret key."
        )

    # 3. Si la clave es válida, notificar a todos los clientes.
    await manager.broadcast({"type": "new_donation"})

    # 4. Devolver una respuesta exitosa.
    return {"status": "notification_sent"}