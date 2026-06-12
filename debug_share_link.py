import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load env variables from backend/.env
load_dotenv(dotenv_path="backend/.env")

db_url = os.getenv("SUPABASE_DATABASE_URL")
if not db_url:
    print("ERROR: SUPABASE_DATABASE_URL not found")
    exit(1)

print(f"DB URL (masked): {db_url[:30]}...")

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    
    # 1. Check table structure
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'analytics_shared_views'
        ORDER BY ordinal_position
    """)
    columns = cur.fetchall()
    print("\nTable structure of 'analytics_shared_views':")
    if columns:
        for col in columns:
            print(f"   - {col['column_name']}: {col['data_type']} (nullable={col['is_nullable']}, default={col['column_default']})")
    else:
        print("   TABLE DOES NOT EXIST!")

    # 2. Try to simulate exact INSERT the backend does
    print("\nTrying INSERT simulation...")
    test_config = {
        "source_id": "test-source",
        "source_name": "Test Source",
        "campaign_id": None,
        "campaign_name": None,
        "start_date": None,
        "end_date": None,
        "form_titles": None
    }
    
    query = """
        INSERT INTO analytics_shared_views (configuration, created_by)
        VALUES (%s, %s)
        RETURNING token
    """
    
    cur.execute(query, (psycopg2.extras.Json(test_config), "test-user@email.com"))
    result = cur.fetchone()
    
    if result:
        token = str(result['token'])
        print(f"INSERT SUCCESS! Token generated: {token}")
        
        # Clean up test record
        cur.execute("DELETE FROM analytics_shared_views WHERE token = %s", (token,))
        print("Test record deleted.")
    
    conn.commit()
    cur.close()
    conn.close()
    print("\nAll tests PASSED - the DB seems fine from local connection!")

except Exception as e:
    print(f"\nERROR: {e}")
    print(f"\nError type: {type(e).__name__}")
    import traceback
    traceback.print_exc()
