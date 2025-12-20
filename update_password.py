import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from passlib.context import CryptContext

# Load env vars
load_dotenv(dotenv_path="backend/.env")

db_url = os.getenv("SUPABASE_DATABASE_URL")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    username = "Ronald"
    new_pass = "Androc1020@"
    new_hash = pwd_context.hash(new_pass)
    
    print(f"🔄 Updating password for '{username}'...")
    print(f"🔑 New Hash: {new_hash[:10]}...")
    
    # Update password
    session.execute(
        text("UPDATE users SET hashed_password = :h WHERE username = :u"),
        {"h": new_hash, "u": username}
    )
    session.commit()
    
    print("✅ Password updated successfully!")
    session.close()

except Exception as e:
    print(f"❌ Error: {e}")
