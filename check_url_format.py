import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="backend/.env")
url = os.getenv("SUPABASE_DATABASE_URL", "")

if url.startswith("postgres://"):
    print("⚠️ URL starts with 'postgres://'. SQLAlchemy 1.4+ requires 'postgresql://'")
elif url.startswith("postgresql://"):
    print("✅ URL starts with 'postgresql://'")
else:
    print(f"ℹ️ URL starts with: {url.split(':')[0]}")
