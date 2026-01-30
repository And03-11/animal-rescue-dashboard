import sys
import os
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv()

from backend.app.services.supabase_service import SupabaseService

def verify_sort():
    service = SupabaseService()
    print("Fetching stats...")
    stats = service.get_funnel_stats()
    
    print("\n--- STAGE ORDER ---")
    for item in stats.get('stage_breakdown', []):
        try:
            name = item['name']
            # Print only ascii safe chars
            clean_name = name.encode('ascii', 'ignore').decode('ascii')
            print(f"{clean_name} (Count: {item['count']})")
        except:
            print("Encoding error printing name")

if __name__ == "__main__":
    verify_sort()
