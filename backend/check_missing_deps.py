import os
import ast
import sys
import importlib.util
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REQUIREMENTS_FILE = BASE_DIR / "requirements.txt"
PROJECT_DIR = BASE_DIR / "app"

def read_requirements():
    # requirements.txt is UTF-16 in this legacy project. Resolve it relative to
    # this script so the check behaves identically locally and in CI.
    with open(REQUIREMENTS_FILE, "r", encoding="utf-16") as f:
        lines = f.read().splitlines()
    packages = set()
    for line in lines:
        requirement = line.strip()
        if not requirement or requirement.startswith(("#", "-r")):
            continue
        name = re.split(r"[<>=!~;\s]", requirement, maxsplit=1)[0]
        name = name.split("[")[0]
        packages.add(name.lower().replace("_", "-"))
    return packages

def find_imports(directory):
    imports = set()
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                filepath = os.path.join(root, file)
                with open(filepath, "r", encoding="utf-8") as f:
                    try:
                        node = ast.parse(f.read(), filename=filepath)
                        for n in ast.walk(node):
                            if isinstance(n, ast.Import):
                                for name in n.names:
                                    imports.add(name.name.split('.')[0])
                            elif isinstance(n, ast.ImportFrom):
                                if n.module:
                                    imports.add(n.module.split('.')[0])
                    except SyntaxError:
                        continue
    return imports

def is_builtin_or_std(pkg):
    try:
        spec = importlib.util.find_spec(pkg)
        if spec is None:
            return False
        return "site-packages" not in (spec.origin or "")
    except Exception:
        return False

def main():
    declared = read_requirements()
    used = find_imports(PROJECT_DIR)

    local_or_optional = {"app", "backend", "database", "truststore"}
    import_to_distribution = {
        "dotenv": "python-dotenv",
        "fastapi_cache": "fastapi-cache2",
        "google_auth_oauthlib": "google-auth-oauthlib",
        "googleapiclient": "google-api-python-client",
        "jose": "python-jose",
        "psycopg2": "psycopg2-binary",
    }
    third_party = {
        pkg for pkg in used
        if not is_builtin_or_std(pkg) and pkg not in local_or_optional
    }
    missing = sorted([
        pkg for pkg in third_party
        if import_to_distribution.get(pkg, pkg).lower().replace("_", "-")
        not in declared
    ])

    if missing:
        print("❌ Missing dependencies in requirements.txt:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(1)
    else:
        print("✅ All imports are satisfied in requirements.txt")

if __name__ == "__main__":
    main()
