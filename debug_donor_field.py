"""
Script para verificar qué devuelve exactamente el campo 'Donor' en la tabla Emails.
"""
import sys
import os
from dotenv import load_dotenv
from pyairtable import Api

# Cargar variables de entorno
dotenv_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
load_dotenv(dotenv_path)
api_key = os.getenv("AIRTABLE_API_KEY")
base_id = os.getenv("AIRTABLE_BASE_ID")
emails_table_name = os.getenv("AIRTABLE_EMAILS_TABLE_NAME", "Emails")

def check_donor_field():
    print("=" * 60)
    print("VERIFICANDO CAMPO 'Donor' EN TABLA EMAILS")
    print("=" * 60)
    
    if not api_key or not base_id:
        print("❌ Error: Faltan credenciales en .env")
        return

    try:
        api = Api(api_key)
        table = api.base(base_id).table(emails_table_name)
        
        # Obtener 3 registros probando cell_format="string"
        print("Consultando Airtable con cell_format='string'...")
        records = table.all(max_records=5, fields=["Email", "Donor"], cell_format="string")
        
        for i, rec in enumerate(records):
            fields = rec.get('fields', {})
            email = fields.get('Email', 'No Email')
            donor_val = fields.get('Donor', 'Empty')
            
            print(f"\nRegistro {i+1}:")
            print(f"  Email: {email}")
            print(f"  Valor Raw de 'Donor': {repr(donor_val)}")
            print(f"  Tipo de dato: {type(donor_val)}")
            
            if isinstance(donor_val, list) and len(donor_val) > 0:
                val = donor_val[0]
                if isinstance(val, str) and val.startswith('rec'):
                    print("  ⚠️ PARECE UN ID DE REGISTRO (Linked Record)")
                else:
                    print("  ✅ PARECE UN NOMBRE O TEXTO")
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

if __name__ == "__main__":
    check_donor_field()
