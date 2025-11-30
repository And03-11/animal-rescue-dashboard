from backend.app.db.database import SessionLocal
from backend.app.services.supabase_service import SupabaseService
from backend.app.services.data_service import DataService
from backend.app.services.airtable_service import AirtableService

def check_data():
    print("🔍 Checking data for source: 'Big Campaign'")
    
    # 1. Check Supabase directly via Service
    supabase_service = SupabaseService()
    
    try:
        print("\n--- Checking Supabase ---")
        # Check if campaigns exist for this source
        campaigns = supabase_service.get_campaigns_by_source("Big Campaign")
        print(f"Found {len(campaigns)} campaigns in Supabase for 'Big Campaign'")
        for c in campaigns:
            print(f" - {c.get('name')} (ID: {c.get('id')})")
            
        # Check donations via the new method
        print("\nChecking get_source_donations in Supabase...")
        result = supabase_service.get_source_donations("Big Campaign", page_size=5)
        donations = result.get("donations", [])
        count = result.get("total_count", 0)
        print(f"Found {len(donations)} donations (Total: {count}) in Supabase")
        
    except Exception as e:
        print(f"❌ Supabase Error: {e}")

    # 2. Check Airtable (Fallback)
    try:
        print("\n--- Checking Airtable ---")
        airtable_service = AirtableService()
        result = airtable_service.get_source_donations("Big Campaign", page_size=5)
        donations = result.get("donations", [])
        count = result.get("total_count", 0)
        print(f"Found {len(donations)} donations (Total: {count}) in Airtable")
        
    except Exception as e:
        print(f"❌ Airtable Error: {e}")

if __name__ == "__main__":
    check_data()
