"""
Script para extraer TODA la info de los tokens y mostrarla.
"""
import os
import glob
import json

pattern = "token_credentials_account*.json.json"
files = sorted(glob.glob(pattern))

with open("all_token_info.txt", "w", encoding="utf-8") as out:
    for path in files:
        name = os.path.basename(path)
        out.write(f"\n{'='*60}\n")
        out.write(f"ARCHIVO: {name}\n")
        out.write(f"{'='*60}\n")
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for key, value in data.items():
                if key in ['token', 'refresh_token']:
                    out.write(f"  {key}: {str(value)[:50]}...\n")
                else:
                    out.write(f"  {key}: {value}\n")
        except Exception as e:
            out.write(f"  ERROR: {e}\n")

print("Guardado en all_token_info.txt")
