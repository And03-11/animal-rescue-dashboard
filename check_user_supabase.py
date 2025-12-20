import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load env vars
load_dotenv(dotenv_path="backend/.env")

db_url = os.getenv("SUPABASE_DATABASE_URL")
if not db_url:
    print("❌ SUPABASE_DATABASE_URL not found")
    sys.exit(1)

try:
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    print(f"✅ Connected to: {db_url.split('@')[1]}")
    
    # Check if users table exists
    try:
        result = session.execute(text("SELECT count(*) FROM users"))
        count = result.scalar()
        print(f"✅ Users table exists. Total users: {count}")
    except Exception as e:
        print(f"❌ Users table query failed: {e}")
        sys.exit(1)

    # Check for Ronald
    result = session.execute(text("SELECT username, is_admin FROM users WHERE username = 'Ronald'"))
    user = result.fetchone()
    
    if user:
        print(f"✅ User 'Ronald' found! (Admin: {user[1]})")
    else:
        print("❌ User 'Ronald' NOT found in Supabase database.")
        
    session.close()

except Exception as e:
    print(f"❌ Connection failed: {e}")
