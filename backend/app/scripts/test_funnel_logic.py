
import asyncio
import sys
import os
import json

sys.path.append(os.path.join(os.path.dirname(__file__), "../../.."))

from backend.app.services.airtable_service import get_airtable_service

async def main():
    print("Testing get_funnel_stats...")
    try:
        service = get_airtable_service()
        stats = service.get_funnel_stats()
        print("Success!")
        print(json.dumps(stats, indent=2))
    except Exception as e:
        print(f"Error calling get_funnel_stats: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
