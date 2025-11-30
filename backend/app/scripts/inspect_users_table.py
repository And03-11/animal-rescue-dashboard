from backend.app.db.database import engine
from sqlalchemy import inspect

def inspect_users_table():
    inspector = inspect(engine)
    if inspector.has_table("users"):
        columns = inspector.get_columns("users")
        print("📋 Columns in 'users' table:")
        for column in columns:
            print(f"- {column['name']} ({column['type']})")
    else:
        print("❌ Table 'users' does not exist.")

if __name__ == "__main__":
    inspect_users_table()
