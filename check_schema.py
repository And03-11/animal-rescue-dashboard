import sys
import os
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load env vars
load_dotenv(dotenv_path="backend/.env")

db_url = os.getenv("SUPABASE_DATABASE_URL")

try:
    engine = create_engine(db_url)
    inspector = inspect(engine)
    
    columns = inspector.get_columns('users')
    print("✅ Columns in 'users' table:")
    for col in columns:
        print(f" - {col['name']} ({col['type']})")
        
except Exception as e:
    print(f"❌ Error: {e}")
