"""
Script para extraer el email de los tokens OAuth2.
Decodifica el ID token o access token para obtener la información.
"""
import os
import glob
import json
import base64

def decode_jwt_payload(token):
    """Decodifica el payload de un JWT (sin verificar firma)"""
    try:
        # JWT tiene 3 partes: header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        # Decodificar el payload (segunda parte)
        payload = parts[1]
        # Agregar padding si es necesario
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += '=' * padding
        
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return None

def get_email_from_token_file(path):
    """Extrae el email del archivo de token"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Opción 1: Si hay id_token, decodificarlo
        if 'id_token' in data and data['id_token']:
            payload = decode_jwt_payload(data['id_token'])
            if payload and 'email' in payload:
                return payload['email']
        
        # Opción 2: Decodificar access_token (a veces es JWT)
        if 'token' in data and data['token']:
            payload = decode_jwt_payload(data['token'])
            if payload and 'email' in payload:
                return payload['email']
        
        # Opción 3: Revisar si hay email directo
        if 'email' in data:
            return data['email']
            
        # Opción 4: Revisar scopes para info
        scopes = data.get('scopes', [])
        
        return None
    except Exception as e:
        return None

def main():
    pattern = "token_credentials_account*.json.json"
    files = glob.glob(pattern)
    
    print("\n" + "="*70)
    print("IDENTIFICACION DE CUENTAS DE GMAIL")
    print("="*70 + "\n")
    
    results = []
    for path in sorted(files):
        name = os.path.basename(path)
        email = get_email_from_token_file(path)
        results.append((name, email))
        
        if email:
            print(f"  {name}  ->  {email}")
        else:
            print(f"  {name}  ->  (no se pudo extraer)")
    
    # Detectar duplicados
    email_to_files = {}
    for name, email in results:
        if email:
            if email not in email_to_files:
                email_to_files[email] = []
            email_to_files[email].append(name)
    
    print("\n" + "="*70)
    print("DUPLICADOS")
    print("="*70)
    
    found = False
    for email, files in email_to_files.items():
        if len(files) > 1:
            found = True
            print(f"\n  [DUPLICADO] {email}")
            for f in files:
                print(f"     - {f}")
    
    if not found:
        print("\n  No se encontraron duplicados.")
    
    print()

if __name__ == "__main__":
    main()
