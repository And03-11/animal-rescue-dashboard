"""
Script de prueba para verificar get_campaign_contacts (Solo First Name)
"""
import sys
import os

# Agregar el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.services.airtable_service import AirtableService

def test_get_campaign_contacts():
    print("=" * 60)
    print("PRUEBA: get_campaign_contacts (First Name Only)")
    print("=" * 60)
    
    try:
        service = AirtableService()
        
        # Probar con USA, no rebotados, segmento standard
        print("\n📧 Obteniendo contactos de USA (no rebotados, standard)...")
        contacts = service.get_campaign_contacts(
            region="USA",
            is_bounced=False,
            segment="standard"
        )
        
        print(f"\n✅ Total contactos encontrados: {len(contacts)}")
        
        if contacts:
            print("\n📋 Primeros 10 contactos (Verificar que NO tengan apellido):")
            print("-" * 50)
            for i, contact in enumerate(contacts[:10]):
                email = contact.get('Email', 'N/A')
                name = contact.get('Name', 'N/A')
                print(f"  {i+1}. {name} <{email}>")
            
            # Verificar visualmente si hay apellidos (espacios en el nombre)
            names_with_space = [c for c in contacts if ' ' in c.get('Name', '').strip()]
            if names_with_space:
                print(f"\n⚠️ NOTA: {len(names_with_space)} nombres contienen espacios. Verificar si son apellidos o nombres compuestos.")
                print(f"   Ejemplo: {names_with_space[0]['Name']}")
            else:
                print("\n✅ Ningún nombre contiene espacios (parece ser solo First Name).")

        else:
            print("\n⚠️ No se encontraron contactos con esos criterios.")
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_get_campaign_contacts()
