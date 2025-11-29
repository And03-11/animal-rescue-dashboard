"""
Test script to debug Supabase campaign stats error
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from dotenv import load_dotenv
load_dotenv()

from app.services.supabase_service import get_supabase_service

# Test campaign stats
campaign_id = "reclXRCLe6rHj1fJi"  # Facebook campaign

print(f"Testing campaign stats for: {campaign_id}")
print("=" * 50)

try:
    service = get_supabase_service()
    print("✅ Service created successfully")
    
    # Test without dates
    print("\n1. Testing WITHOUT date filters...")
    result = service.get_campaign_stats(campaign_id=campaign_id)
    print(f"✅ Success! Total: ${result['campaign_total_amount']}, Count: {result['campaign_total_count']}")
    
    # Test with dates
    print("\n2. Testing WITH date filters...")
    result = service.get_campaign_stats(
        campaign_id=campaign_id,
        start_date="2025-11-25",
        end_date="2025-11-29"
    )
    print(f"✅ Success! Total: ${result['campaign_total_amount']}, Count: {result['campaign_total_count']}")
    
    print("\n" + "=" * 50)
    print("✅ ALL TESTS PASSED!")
    
except Exception as e:
    print(f"\n❌ ERROR: {type(e).__name__}")
    print(f"Message: {str(e)}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()
