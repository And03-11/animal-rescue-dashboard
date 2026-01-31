import sys
import os
from dotenv import load_dotenv
import psycopg2

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv()

SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

def check_unknowns():
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        cursor = conn.cursor()
        
        print("Checking for donors with 'Unknown' Funnel Stage...")
        query = """
            SELECT name, emails FROM donors 
            WHERE stage = 'Funnel' 
            AND (funnel_stage IS NULL OR funnel_stage = '')
            AND (status IS NULL OR status != 'Unsubscribed')
            LIMIT 10
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            print("No donors found with Unknown funnel stage.")
        else:
            print(f"Found {len(rows)} examples (showing top 10):")
            for row in rows:
                print(f" - Name: {row[0]}")
                
        # Count total
        cursor.execute("""
            SELECT COUNT(*) FROM donors 
            WHERE stage = 'Funnel' 
            AND (funnel_stage IS NULL OR funnel_stage = '')
            AND (status IS NULL OR status != 'Unsubscribed')
        """)
        total = cursor.fetchone()[0]
        print(f"\nTotal 'Unknown': {total}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    check_unknowns()
