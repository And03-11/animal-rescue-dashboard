import os
import ast
import sys
import importlib.util

REQUIREMENTS_FILE = "requirements.txt"
PROJECT_DIR = "app"

def read_requirements():
    with open(REQUIREMENTS_FILE, "r") as f:
        lines = f.read().splitlines()
    pkgs = [line.strip().split("[")[0].split("==")[0].lower() for line in lines if line.strip() and not line.startswith("#")]
    return set(pkgs)

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

    known_safe = {
    "app",
    "dotenv",
    "google_auth_oauthlib",
    "googleapiclient",
    "jose"
}
    third_party = {pkg for pkg in used if not is_builtin_or_std(pkg) and pkg not in known_safe}
    missing = sorted([pkg for pkg in third_party if pkg.lower() not in declared])

    if missing:
        print("❌ Missing dependencies in requirements.txt:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(1)
    else:
        print("✅ All imports are satisfied in requirements.txt")

if __name__ == "__main__":
    main()
