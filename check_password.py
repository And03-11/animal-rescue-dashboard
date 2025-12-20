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
    
    # Get Ronald's hash
    result = session.execute(text("SELECT hashed_password FROM users WHERE username = 'Ronald'"))
    row = result.fetchone()
    
    if row:
        db_hash = row[0]
        print(f"✅ DB Hash found: {db_hash[:10]}...")
        
        # Test password
        test_pass = "Androc1020@"
        is_valid = pwd_context.verify(test_pass, db_hash)
        
        if is_valid:
            print(f"✅ Password '{test_pass}' is VALID against DB hash.")
        else:
            print(f"❌ Password '{test_pass}' is INVALID against DB hash.")
            
            # Generate new hash for comparison
            new_hash = pwd_context.hash(test_pass)
            print(f"ℹ️ Expected hash format: {new_hash[:10]}...")
    else:
        print("❌ User not found")
        
    session.close()

except Exception as e:
    print(f"❌ Error: {e}")
