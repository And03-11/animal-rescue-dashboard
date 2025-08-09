# backend/app/services/brevo_service.py
import os
import requests
from typing import Dict, Any, Optional, List, Tuple

class BrevoService:
    def __init__(self):
        self.api_key = os.getenv("BREVO_API_KEY")
        if not self.api_key:
            raise ValueError("Error: Falta la variable de entorno BREVO_API_KEY.")
        
        self.base_url = "https://api.brevo.com/v3"
        self.headers = {"accept": "application/json", "api-key": self.api_key}
        
        # Al iniciar, cargamos todas las listas para tener un mapa de ID a Nombre
        self.list_map = self._get_all_lists_map()

    def _get_all_lists_map(self) -> Dict[int, str]:
        """ Obtiene todas las listas de contactos y devuelve un mapa de ID a Nombre. """
        url = f"{self.base_url}/contacts/lists?limit=50"
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            lists = response.json().get('lists', [])
            return {lst['id']: lst['name'] for lst in lists}
        except Exception as e:
            print(f"Error al obtener listas de Brevo: {e}")
            return {}

    def get_contact_details(self, email: str) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/contacts/{email}"
        try:
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                contact_data = response.json()
                # ¡Mejora! Reemplazamos los IDs de las listas por sus nombres
                list_ids = contact_data.get("listIds", [])
                list_names = [self.list_map.get(list_id, f"ID: {list_id}") for list_id in list_ids]
                contact_data["listNames"] = list_names
                return contact_data
            elif response.status_code == 404:
                return None
            else:
                response.raise_for_status()
                return None
        except requests.exceptions.RequestException as e:
            print(f"Error de red al contactar Brevo: {e}")
            return None
        
brevo_service_instance = BrevoService()
def get_brevo_service():
    return brevo_service_instance