import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
SUPABASE_DB_URL = os.getenv("SUPABASE_DATABASE_URL")

try:
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cursor = conn.cursor()

    print("🔍 Checking for blocking queries...")
    cursor.execute("""
        SELECT pid, 
               usename, 
               pg_blocking_pids(pid) as blocked_by, 
               query as blocked_query,
               state
        FROM pg_stat_activity
        WHERE cardinality(pg_blocking_pids(pid)) > 0;
    """)
    
    blocked_pids = cursor.fetchall()
    if blocked_pids:
        print(f"⚠️ Found {len(blocked_pids)} blocked queries.")
        for row in blocked_pids:
            print(f"   PID: {row[0]}, User: {row[1]}, Blocked By: {row[2]}, Query: {row[3]}")
            
        # Kill the blockers?
        blocker_pids = set()
        for row in blocked_pids:
            for pid in row[2]:
                blocker_pids.add(pid)
        
        print(f"🔪 Attempting to terminate {len(blocker_pids)} blocking PIDs: {blocker_pids}")
        for pid in blocker_pids:
            try:
                cursor.execute(f"SELECT pg_terminate_backend({pid})")
                print(f"   ✅ Terminated PID {pid}")
            except Exception as e:
                print(f"   ❌ Failed to terminate PID {pid}: {e}")
        conn.commit()
    else:
        print("✨ No blocked queries found.")
        
    # Also check for long running idle transactions
    print("\n🔍 Checking for idle transactions > 5 minutes...")
    cursor.execute("""
        SELECT pid, usename, state, query, state_change
        FROM pg_stat_activity
        WHERE state = 'idle in transaction'
        AND state_change < current_timestamp - interval '5 minutes'
    """)
    idle_pids = cursor.fetchall()
    if idle_pids:
         print(f"⚠️ Found {len(idle_pids)} idle transactions.")
         for row in idle_pids:
            print(f"   PID: {row[0]}, Time: {row[4]}")
            try:
                cursor.execute(f"SELECT pg_terminate_backend({row[0]})")
                conn.commit()
                print(f"   ✅ Terminated idle PID {row[0]}")
            except Exception as e:
                print(f"   ❌ Failed to terminate idle PID {row[0]}: {e}")
    else:
        print("✨ No stale idle transactions found.")

except Exception as e:
    print(f"❌ Error: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
