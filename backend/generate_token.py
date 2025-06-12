# generate_token.py
import os
from app.services.gmail_service import GmailService
from dotenv import load_dotenv

load_dotenv()
print("Iniciando proceso para generar token de Gmail...")
credentials_path = os.getenv("GMAIL_CREDENTIALS_PATH")
if not credentials_path:
    print("Asegúrate de configurar GMAIL_CREDENTIALS_PATH en tu archivo .env")
else:
    GmailService(credentials_path=credentials_path)
    print("¡Token generado y guardado exitosamente!")