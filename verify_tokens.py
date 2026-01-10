import os
import glob
import json

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# 1) Cambia el directorio si tus JSON están en otra carpeta:
DIRECTORIO_CREDENCIALES = "./"  # Por defecto, el directorio actual
# 2) Nuevo patrón para tus archivos:
PATRON_ARCHIVOS = "token_credentials_account*.json.json"


def mostrar_scopes_de_credencial(path_json):
    """
    Abre el JSON (por ejemplo, credentials_account5.json) y devuelve
    la lista de scopes que contiene. Si hay algún error al leer, regresa [].
    """
    try:
        with open(path_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get("scopes", [])
    except Exception:
        return []


def obtener_email_sin_forzar_scopes(path_cred_json):
    """
    Reconstruye el objeto Credentials A PARTIR del JSON existente:
      - NO le pasamos explícitamente ningún parámetro "scopes" a from_authorized_user_file,
        para evitar invalid_scope si el JSON trae scopes distintos a los que le pidiéramos.
      - Con esas credenciales, trataremos primero de llamar a Gmail API (si el scope gmail.readonly está presente).
      - Si no existe gmail.readonly, probamos con la API OAuth2 userinfo (si existe userinfo.email).
      - Si no podemos ninguno, devolvemos None.
    """
    scopes = mostrar_scopes_de_credencial(path_cred_json)
    try:
        # 1) Reconstrucción de Credentials SIN pasar scopes explícitos
        creds = Credentials.from_authorized_user_file(path_cred_json)
    except Exception as e:
        print(f"⚠️  ERROR al reconstruir Credentials con `{path_cred_json}`: {e}")
        return None

    # Si tenemos gmail.readonly, hacemos la llamada a Gmail API
    if "https://www.googleapis.com/auth/gmail.readonly" in scopes:
        try:
            service = build("gmail", "v1", credentials=creds)
            perfil = service.users().getProfile(userId="me").execute()
            return perfil.get("emailAddress")
        except HttpError as e:
            # Si falla Gmail API (token expirado o sin permisos), lo capturamos y luego probamos fallback
            print(f"   ✖ Gmail API falló con `{os.path.basename(path_cred_json)}`: {e}")
        except Exception as e:
            print(f"   ✖ Error inesperado en Gmail API con `{os.path.basename(path_cred_json)}`: {e}")

    # Si no tuvimos gmail.readonly o falló, probamos con OAuth2 userinfo
    if "https://www.googleapis.com/auth/userinfo.email" in scopes or "openid" in scopes:
        try:
            oauth2_svc = build("oauth2", "v2", credentials=creds)
            info = oauth2_svc.userinfo().get().execute()
            return info.get("email")
        except HttpError as e:
            print(f"   ✖ OAuth2 userinfo falló con `{os.path.basename(path_cred_json)}`: {e}")
        except Exception as e:
            print(f"   ✖ Error inesperado en OAuth2 userinfo con `{os.path.basename(path_cred_json)}`: {e}")

    # Si llegamos acá, no había ningún scope compatible para leer email
    return None


def main():
    # 1) Listamos todos los JSON que empiecen por "credentials_account"
    rutas = glob.glob(os.path.join(DIRECTORIO_CREDENCIALES, PATRON_ARCHIVOS))
    
    with open("token_emails_report.txt", "w", encoding="utf-8") as out:
        if not rutas:
            out.write(f"No halle ningun archivo que coincida con `{PATRON_ARCHIVOS}` en {DIRECTORIO_CREDENCIALES}\n")
            return

        # 2) Recorremos cada archivo y extraemos scopes + email
        out.write("\nScopes y email asociado para cada archivo:\n\n")
        out.write(f"{'Archivo':45s} {'Email':35s}\n")
        out.write("-" * 90 + "\n")
        
        duplicates = {}
        
        for ruta in sorted(rutas):
            nombre = os.path.basename(ruta)
            scopes = mostrar_scopes_de_credencial(ruta)
            email = obtener_email_sin_forzar_scopes(ruta)

            if email:
                out.write(f"{nombre:45s} {email:35s}\n")
                if email not in duplicates:
                    duplicates[email] = []
                duplicates[email].append(nombre)
            else:
                estado = "<no disponible>"
                out.write(f"{nombre:45s} {estado:35s}\n")
        
        out.write("\n" + "="*60 + "\n")
        out.write("DUPLICADOS DETECTADOS\n")
        out.write("="*60 + "\n")
        
        found = False
        for email, files in duplicates.items():
            if len(files) > 1:
                found = True
                out.write(f"\n[DUPLICADO] {email}\n")
                for f in files:
                    out.write(f"   - {f}\n")
        
        if not found:
            out.write("No se encontraron duplicados.\n")
        
        out.write("\n")
    
    print("Reporte generado: token_emails_report.txt")


if __name__ == "__main__":
    main()
