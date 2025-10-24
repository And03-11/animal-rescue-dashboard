# --- File: backend/app/services/credentials_manager.py ---
import os
from typing import List, Dict, Optional, Union
# Ajusta la ruta si es necesario para importar GmailService correctamente
from backend.app.services.gmail_service import GmailService

CREDENTIALS_BASE_DIR = "gmail_credentials" # Relativo a la raíz del backend

class CredentialsManager:
    """Gestiona el descubrimiento y carga de múltiples credenciales de Gmail."""

    def __init__(self, base_dir: str = CREDENTIALS_BASE_DIR):
        # Construye la ruta absoluta basada en la ubicación de este archivo
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_dir = os.path.abspath(os.path.join(self.script_dir, '..', '..', base_dir)) # Sube dos niveles para salir de app/services
        self.credentials_map: Dict[str, Dict[str, str]] = self._discover_credentials()
        print(f"CredentialsManager inicializado. Buscando en: {self.base_dir}")
        if not self.credentials_map:
             print("Advertencia: No se encontraron credenciales.")


    def _discover_credentials(self) -> Dict[str, Dict[str, str]]:
        """
        Explora el directorio base y organiza las credenciales por grupo.

        Returns:
            Un diccionario donde las claves son nombres de grupo
            y los valores son diccionarios de {identificador_cuenta: ruta_completa_json}.
        """
        mapping: Dict[str, Dict[str, str]] = {}
        if not os.path.exists(self.base_dir):
            print(f"Error: El directorio de credenciales '{self.base_dir}' no existe.")
            return mapping

        print(f"Explorando directorio: {self.base_dir}")
        try:
            for group_name in os.listdir(self.base_dir):
                group_path = os.path.join(self.base_dir, group_name)
                if os.path.isdir(group_path):
                    print(f"  Encontrado grupo: {group_name}")
                    mapping[group_name] = {}
                    for filename in os.listdir(group_path):
                        # Buscamos solo el archivo .json principal, no el token_*.json
                        if filename.endswith(".json") and not filename.startswith("token_"):
                            account_id = os.path.splitext(filename)[0] # ID = nombre sin extensión
                            full_path = os.path.abspath(os.path.join(group_path, filename))
                            mapping[group_name][account_id] = full_path
                            print(f"    - Descubierta credencial: ID='{account_id}', Ruta='{full_path}'")
        except Exception as e:
             print(f"Error durante el descubrimiento de credenciales: {e}")

        return mapping

    def list_groups(self) -> List[str]:
        """Devuelve la lista de nombres de grupos descubiertos."""
        return list(self.credentials_map.keys())

    def list_accounts(self, group: Optional[str] = None) -> List[Dict[str, str]]:
        """
        Devuelve una lista de diccionarios {id, group, path} para cuentas,
        opcionalmente filtradas por grupo. El ID es el nombre del archivo .json sin extensión.
        """
        accounts = []
        groups_to_scan = [group] if group and group in self.credentials_map else self.credentials_map.keys()

        for g in groups_to_scan:
            for account_id, path in self.credentials_map.get(g, {}).items():
                accounts.append({"id": account_id, "group": g, "path": path})
        return accounts

    def get_gmail_services(self, selection: Union[str, List[str]]) -> List[GmailService]:
        """
        Crea instancias de GmailService basadas en la selección.
        CORREGIDO: Maneja correctamente la sensibilidad a mayúsculas/minúsculas en nombres de grupo.

        Args:
            selection: Nombre de grupo ('all', 'normal', 'risky', etc.) o
                       lista de IDs de cuenta (nombres de archivo sin extensión).

        Returns:
            Una lista de instancias de GmailService. Vacía si hay errores.
        """
        services: List[GmailService] = []
        paths_to_load: List[str] = []

        print(f"Intentando obtener servicios para selección: {selection}")

        # --- INICIO CORRECCIÓN ---
        # Crear un mapa temporal con claves en minúsculas para búsqueda insensible a mayúsculas
        lower_case_group_map: Dict[str, Dict[str, str]] = {
            k.lower(): v for k, v in self.credentials_map.items()
        }
        # --- FIN CORRECCIÓN ---

        if isinstance(selection, str): # Selección por grupo
            group_selection_lower = selection.lower() # Convertir selección a minúsculas

            if group_selection_lower == 'all':
                # Si es 'all', usamos todas las credenciales originales
                groups_to_use_original_case = self.credentials_map.keys()
                print(f"  Selección 'all', usando grupos originales: {list(groups_to_use_original_case)}")
                for group in groups_to_use_original_case:
                    paths_to_load.extend(self.credentials_map[group].values())

            # --- CORRECCIÓN ---
            # Buscar el grupo en minúsculas en el mapa temporal
            elif group_selection_lower in lower_case_group_map:
                # Obtener el nombre ORIGINAL del grupo (con mayúsculas/minúsculas correctas)
                original_group_name = next(
                    (k for k in self.credentials_map if k.lower() == group_selection_lower),
                    None # Fallback por si acaso, aunque no debería pasar si está en lower_case_group_map
                )
                if original_group_name:
                    print(f"  Selección por grupo: '{selection}' encontrado como '{original_group_name}'")
                    # Usar el nombre original para obtener las rutas del mapa principal
                    paths_to_load.extend(self.credentials_map[original_group_name].values())
                else:
                    # Esto no debería ocurrir si group_selection_lower está en lower_case_group_map
                    print(f"  Advertencia interna: Inconsistencia al buscar el nombre original para el grupo '{selection}'")
                    return []
            # --- FIN CORRECCIÓN ---
            else:
                print(f"  Advertencia: Grupo de credenciales '{selection}' (buscado como '{group_selection_lower}') no encontrado.")
                return []

        elif isinstance(selection, list): # Selección manual por ID (sin cambios necesarios aquí)
            print(f"  Selección manual por IDs: {selection}")
            account_map = {acc["id"]: acc["path"] for acc in self.list_accounts()}
            for account_id in selection:
                if account_id in account_map:
                    paths_to_load.append(account_map[account_id])
                else:
                    print(f"  Advertencia: ID de credencial '{account_id}' no encontrado.")
        else:
            print(f"  Advertencia: Tipo de selección inválido: {type(selection)}")
            return []

        if not paths_to_load:
            print("  Advertencia: No se encontraron rutas de credenciales para cargar.")
            return []

        print(f"  Rutas de credenciales a cargar: {paths_to_load}")

        # Crear instancias del servicio (sin cambios)
        for path in paths_to_load:
            try:
                service = GmailService(credentials_path=path)
                services.append(service)
                print(f"    - Servicio Gmail inicializado OK para: {os.path.basename(path)}")
            except Exception as e:
                print(f"    - Error al inicializar GmailService para {os.path.basename(path)}: {e}")

        print(f"  Total servicios Gmail creados: {len(services)}")
        return services

# --- Instancia Singleton y Getter para Inyección de Dependencias ---
try:
    credentials_manager_instance = CredentialsManager()
except Exception as e:
    print(f"Error CRÍTICO al inicializar CredentialsManager: {e}")
    # Decide cómo manejar esto. Podrías hacer que el getter devuelva None o lanzar una excepción.
    credentials_manager_instance = None # Opcional: manejar el fallo

def get_credentials_manager():
    # Podrías añadir lógica aquí para reintentar la inicialización si falló antes
    if credentials_manager_instance is None:
         raise RuntimeError("CredentialsManager no pudo ser inicializado.") # O devuelve None
    return credentials_manager_instance