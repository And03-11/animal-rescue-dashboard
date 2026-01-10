"""
Script para listar todas las cuentas de Gmail configuradas y detectar duplicados.
Usa la misma lógica que el sistema de envío de emails.
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from backend.app.services.credentials_manager import credentials_manager_instance

def main():
    with open("gmail_accounts_report.txt", "w", encoding="utf-8") as f:
        f.write("="*60 + "\n")
        f.write("CUENTAS DE GMAIL CONFIGURADAS\n")
        f.write("="*60 + "\n")
        
        # Get all services
        services = credentials_manager_instance.get_gmail_services("all")
        
        email_to_files = {}
        
        for svc in services:
            try:
                profile = svc.service.users().getProfile(userId='me').execute()
                email = profile.get('emailAddress', 'Unknown')
            except Exception as e:
                email = f"Error: {str(e)[:50]}..."
            
            cred_file = os.path.basename(svc.credentials_path)
            f.write(f"  {cred_file} -> {email}\n")
            
            if email not in email_to_files:
                email_to_files[email] = []
            email_to_files[email].append(cred_file)
        
        f.write("\n" + "="*60 + "\n")
        f.write("DETECCION DE DUPLICADOS\n")
        f.write("="*60 + "\n")
        
        found = False
        for email, files in email_to_files.items():
            if len(files) > 1 and not email.startswith("Error"):
                found = True
                f.write(f"\n[DUPLICADO] {email}\n")
                for file in files:
                    f.write(f"   - {file}\n")
        
        if not found:
            f.write("No se encontraron cuentas duplicadas.\n")
        
        f.write(f"\nTotal de cuentas: {len(services)}\n")
    
    print("Reporte generado: gmail_accounts_report.txt")

if __name__ == "__main__":
    main()
