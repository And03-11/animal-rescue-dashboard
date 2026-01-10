"""
Verificar el orden exacto de carga de servicios Gmail.
"""
from backend.app.services.credentials_manager import credentials_manager_instance

services = credentials_manager_instance.get_gmail_services("all")

print("\n" + "="*60)
print("ORDEN DE ROTACIÓN DE CUENTAS")
print("="*60)

for i, svc in enumerate(services):
    import os
    print(f"  {i+1:2d}. {os.path.basename(svc.credentials_path)}")

print(f"\nTotal: {len(services)} cuentas")
print("\nNOTA: Los correos se envían rotando en este orden (1, 2, 3, ... 18, 1, 2, ...)")
