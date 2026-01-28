from backend.app.db.database import engine
from sqlalchemy import text

def add_columns():
    with engine.connect() as conn:
        print("Connected to DB")
        # Check if columns exist
        try:
            # Postgres specific check
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='scheduled_sends'"))
            columns = [row[0] for row in result]
            print(f"Existing columns: {columns}")
            
            if 'is_dnr' not in columns:
                print("Adding is_dnr...")
                conn.execute(text("ALTER TABLE scheduled_sends ADD COLUMN is_dnr BOOLEAN DEFAULT FALSE"))
                conn.commit()
                print("Added is_dnr column")
            else:
                print("is_dnr already exists")

            if 'dnr_date' not in columns:
                print("Adding dnr_date...")
                conn.execute(text("ALTER TABLE scheduled_sends ADD COLUMN dnr_date TIMESTAMP"))
                conn.commit()
                print("Added dnr_date column")
            else:
                print("dnr_date already exists")
                
        except Exception as e:
            print(f"Error: {e}")
            # Fallback for SQLite if information_schema fails
            try:
                if 'no such table' in str(e) or 'information_schema' in str(e):
                    print("Fallback to SQLite check...")
                    # SQLite add column (simple try/except)
                    try:
                        conn.execute(text("ALTER TABLE scheduled_sends ADD COLUMN is_dnr BOOLEAN DEFAULT 0"))
                        print("Added is_dnr (SQLite)")
                    except Exception as e2:
                        print(f"SQLite is_dnr error: {e2}")
                        
                    try:
                        conn.execute(text("ALTER TABLE scheduled_sends ADD COLUMN dnr_date DATETIME"))
                        print("Added dnr_date (SQLite)")
                    except Exception as e2:
                        print(f"SQLite dnr_date error: {e2}")
            except Exception as e3:
                print(f"Fallback error: {e3}")

if __name__ == "__main__":
    add_columns()
