import sys
import os
import asyncio
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from backend.app.services.supabase_service import SupabaseService

load_dotenv()

def verify_sorting():
    service = SupabaseService()
    # Pick a source that has campaigns, e.g., "Facebook" or "Big Campaigns" or from the screenshot "Astral" seems to be a campaign name, source might be "Big Campaigns"?
    # Let's try to get unique sources first or just pick one if we know it.
    # I'll try to fetch sources first if possible, or just guess "Big Campaigns".
    # Actually, I can just query the DB directly if I had a tool, but I'll use the service.
    
    print("Fetching unique sources...")
    try:
        sources = service.get_unique_campaign_sources()
        print(f"Sources found: {sources}")
        
        if not sources:
            print("No sources found.")
            return

        source = sources[0]
        print(f"Verifying sorting for source: '{source}'")
        
        campaigns = service.get_campaigns(source)
        print(f"Found {len(campaigns)} campaigns.")
        for c in campaigns[:5]:
            print(f"- {c['name']} (Created: {c['createdTime']})")
            
        # Check if sorted
        dates = [c['createdTime'] for c in campaigns if c['createdTime']]
        if dates != sorted(dates, reverse=True):
            print("❌ WARNING: Campaigns are NOT sorted by createdTime DESC.")
            print("Expected:", sorted(dates, reverse=True)[:3])
            print("Actual:  ", dates[:3])
        else:
            print("✅ Campaigns are sorted by createdTime DESC.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_sorting()
