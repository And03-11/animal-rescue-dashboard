import sys
import os
from datetime import date
import json

# Add the project root to the python path
sys.path.append(os.getcwd())

from backend.app.services.supabase_service import get_supabase_service

class DateEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)

def reproduce():
    service = get_supabase_service()
    
    start_date = date(2025, 12, 19)
    end_date = date(2025, 12, 19)
    
    output = []
    output.append(f"Querying daily summaries for {start_date} to {end_date}...")
    
    try:
        results = service.get_daily_summaries(start_date, end_date)
        output.append(f"Found {len(results)} records:")
        for r in results:
            output.append(str(r))
            
        output.append("\n--- Inspecting daily_metrics schema (first row) ---")
        raw_query = "SELECT date, pg_typeof(date) as type, total_amount, donation_count FROM daily_metrics LIMIT 1"
        raw_results = service._execute_query(raw_query)
        if raw_results:
            output.append(str(raw_results[0]))
            
        # Let's also check what 2025-12-20 looks like in the DB
        output.append("\n--- Checking Dec 20 data ---")
        check_query = "SELECT * FROM daily_metrics WHERE date = '2025-12-20'"
        check_results = service._execute_query(check_query)
        for r in check_results:
            output.append(str(r))

    except Exception as e:
        output.append(f"Error: {e}")
    finally:
        service.close()
        
    with open("reproduce_output.txt", "w") as f:
        f.write("\n".join(output))

if __name__ == "__main__":
    reproduce()
