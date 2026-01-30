
import asyncio
import sys
import os

# Add the project root to the python path
sys.path.append(os.path.join(os.path.dirname(__file__), "../../.."))

from backend.app.services.data_service import get_data_service

async def main():
    service = get_data_service()
    print("Fetching funnel stats...")
    try:
        stats = service.get_funnel_stats()
        print("Success!")
        print(stats)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
