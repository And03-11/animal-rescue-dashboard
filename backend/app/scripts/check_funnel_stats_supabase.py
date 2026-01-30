import os
import sys
from dotenv import load_dotenv

# Ajustar path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

load_dotenv()

from backend.app.services.supabase_service import SupabaseService

def main():
    # Force utf-8 for stdout if possible, or just default
    sys.stdout.reconfigure(encoding='utf-8')
    service = SupabaseService()
    print("Testing get_funnel_stats from Supabase...")
    try:
        stats = service.get_funnel_stats()
        print("\n[Funnel Stats]")
        print(f"  Total Funnel (Active): {stats.get('total_funnel')}")
        print(f"  Pending Approvals:     {stats.get('pending_approvals')}")
        print(f"  Total Unsubscribed:    {stats.get('total_unsubscribed')}")
        print("\n[Stage Breakdown]")
        # Now returns list of dicts: [{'name': 'Stage 1', 'count': 10}, ...]
        for item in stats.get('stage_breakdown', []):
            print(f"  - {item['name']}: {item['count']}")
        print(f"UNSUB: {stats.get('total_unsubscribed')}")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        service.close()

if __name__ == "__main__":
    main()
