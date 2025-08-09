# backend/app/services/mailchimp_service.py

import os
import requests
import hashlib
from typing import List, Optional

class MailchimpService:
    """
    Clase para encapsular toda la comunicación con la API de Mailchimp.
    """
    def __init__(self):
        self.api_key = os.getenv("MAILCHIMP_API_KEY")
        self.list_id = os.getenv("MAILCHIMP_LIST_ID")
        self.dc = os.getenv("MAILCHIMP_DC")

        if not all([self.api_key, self.list_id, self.dc]):
            raise ValueError("Error: Faltan variables de entorno de Mailchimp.")

        self.api_url = f"https://{self.dc}.api.mailchimp.com/3.0"

    def get_contact_tags(self, email: str) -> Optional[List[str]]:
        """
        Obtiene las etiquetas de un contacto específico por su email.

        Args:
            email (str): El email del contacto a buscar.

        Returns:
            Optional[List[str]]: Una lista de nombres de etiquetas si se encuentra
                                 el contacto, None si no se encuentra o hay un error.
        """
        # Limpiamos y hasheamos el email, como en tu script original.
        email_normalized = email.strip().lower()
        email_hash = hashlib.md5(email_normalized.encode('utf-8')).hexdigest()
        
        member_url = f"{self.api_url}/lists/{self.list_id}/members/{email_hash}/tags"
        
        # Usamos la lógica de reintentos de tu script, ¡es una gran idea!
        for attempt in range(3):
            try:
                response = requests.get(
                    member_url, 
                    auth=('anystring', self.api_key), 
                    timeout=15
                )

                if response.status_code == 200:
                    data = response.json()
                    # Devolvemos una lista limpia con solo los nombres de las etiquetas
                    tags = [tag['name'] for tag in data.get('tags', [])]
                    return tags
                elif response.status_code == 404:
                    # El contacto no existe, devolvemos None para indicarlo.
                    return None
                
                # Si el código de estado es otro, se considera un error y se reintenta.
                response.raise_for_status()

            except requests.exceptions.RequestException as e:
                print(f"Error de red en el intento {attempt+1} para {email}: {e}")
                if attempt == 2: # Si es el último intento
                    return None
        
        return None
    
mailchimp_service_instance = MailchimpService()
def get_mailchimp_service():
    return mailchimp_service_instance