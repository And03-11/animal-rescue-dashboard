
import asyncio
import sys
import os
import json

sys.path.append(os.path.join(os.path.dirname(__file__), "../../.."))

from backend.app.services.airtable_service import get_airtable_service

async def main():
    service = get_airtable_service()
    print("Fetching donors to inspect Fields...")
    try:
        # Fetch 50 records to be sure we get populated fields
        donors = service.donors_table.all(max_records=50)
        
        if not donors:
            print("No donors found.")
            return

        print("\n--- RECORD 0 KEYS ---")
        keys = list(donors[0].get('fields', {}).keys())
        keys.sort()
        for k in keys:
            print(k)

        print("\n--- SAMPLE STAGE VALUES ---")
        stages = set()
        for d in donors:
            f = d.get('fields', {})
            # Check various potential names
            if 'Stage' in f: stages.add(str(f['Stage']))
            if 'Funnel Stage' in f: stages.add(str(f['Funnel Stage']))
            if 'New Comer Funnel' in f: stages.add(str(f['New Comer Funnel']))
        
        for s in stages:
            print(f"'{s}'")

        print("\n--- SAMPLE STATUS VALUES ---")
        statuses = set()
        for d in donors:
            f = d.get('fields', {})
            if 'Status' in f: statuses.add(str(f['Status']))
        
        for s in statuses:
            print(f"'{s}'")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
