# app/websockets/connection_manager.py

from typing import List
from fastapi import WebSocket

class ConnectionManager:
    """
    Gestiona las conexiones WebSocket activas.

    Esta clase es un 'Singleton' de facto, lo que significa que crearemos una
    única instancia de ella y la usaremos en toda la aplicación para asegurarnos
    de que todos los endpoints y servicios compartan la misma lista de clientes
    conectados.
    """
    def __init__(self):
        """
        Inicializa el gestor con una lista vacía de conexiones activas.
        """
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """
        Acepta una nueva conexión WebSocket y la añade a la lista de conexiones activas.

        Args:
            websocket (WebSocket): El objeto WebSocket de la nueva conexión.
        """
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        """
        Elimina una conexión WebSocket de la lista de conexiones activas.

        Args:
            websocket (WebSocket): El objeto WebSocket de la conexión a cerrar.
        """
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """
        Envía un mensaje JSON a todas las conexiones activas.

        Este es el método clave que usaremos para notificar a todos los
        clientes conectados sobre un nuevo evento (ej. una nueva donación).

        Args:
            message (dict): El mensaje a enviar, que será convertido a JSON.
        """
        for connection in self.active_connections:
            await connection.send_json(message)

# --- Instancia Única ---
# Creamos una única instancia del gestor que importaremos en otros
# lugares de nuestra aplicación. Esto asegura que todos usen la misma lista.
manager = ConnectionManager()