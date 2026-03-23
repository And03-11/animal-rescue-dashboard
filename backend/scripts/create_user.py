import os
import argparse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from pathlib import Path
from dotenv import load_dotenv

import sys

# Set up paths relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir) # /app/backend
sys.path.append(backend_dir)

print(f"DEBUG: Script dir: {script_dir}", flush=True)
print(f"DEBUG: Backend dir added to sys.path: {backend_dir}", flush=True)

try:
    from app.db.database import SessionLocal
    from app.db.models import User
    from app.core.security import get_password_hash
except ImportError as e:
    print(f"CRITICAL: Could not import app modules. {e}", flush=True)
    print(f"Current sys.path: {sys.path}", flush=True)
    sys.exit(1)

def create_user(username, password, is_admin=False):
    db = SessionLocal()
    try:
        # Check if user exists
        user = db.query(User).filter(User.username == username).first()
        if user:
            print(f"User '{username}' already exists. Updating password...")
            user.hashed_password = get_password_hash(password)
            user.is_admin = is_admin
        else:
            print(f"Creating new user: {username}")
            user = User(
                username=username,
                hashed_password=get_password_hash(password),
                is_admin=is_admin
            )
            db.add(user)
        
        db.commit()
        print(f"Success! User {username} created/updated.")
    except Exception as e:
        db.rollback()
        print(f"Error creating user: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Create or update a dashboard user (Email-based)")
    parser.add_argument("email", help="User email")
    parser.add_argument("password", help="User password")
    parser.add_argument("--admin", action="store_true", help="Set as admin")
    
    args = parser.parse_args()
    create_user(args.email, args.password, args.admin)
