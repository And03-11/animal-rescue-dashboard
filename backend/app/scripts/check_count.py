import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from backend.app.services.airtable_service import AirtableService

def check_count():
    load_dotenv()
    service = AirtableService()
    
    # Parámetros visibles en el screenshot de la campaña
    region = "USA" 
    is_bounced = False # "Bounced: No" en el screenshot
    segment = "standard" # Asumido por "Exclude From... is empty"
    
    print(f"--- Checking Count for Region={region}, Bounced={is_bounced}, Segment={segment} ---")
    
    contacts = service.get_campaign_contacts(region, is_bounced, segment)
    
    print(f"Total contacts found with CURRENT LOGIC: {len(contacts)}")
    
    # Opcional: Mostrar algunos tags para ver si coinciden con Tag #1 / Tag #4
    # Esto requeriría modificar get_campaign_contacts para devolver tags, o hacer otra consulta.
    # Por ahora solo el conteo es suficiente.

if __name__ == "__main__":
    check_count()
