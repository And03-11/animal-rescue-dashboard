import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY')

async def main():
    embedding = [0.0] * 1536
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/search_templates",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "query_embedding": "[" + ",".join(str(v) for v in embedding) + "]",
                "filter_species": "",
                "filter_problem": "",
                "filter_status": "",
                "filter_urgency": "",
                "filter_scope": "",
                "filter_conditions": None,
                "include_unknown_species": False,
                "match_count": 50,
            },
        )
        print("Status", res.status_code)
        try:
            print("Data:", len(res.json()), "results")
        except:
            print("Text:", res.text)

if __name__ == "__main__":
    asyncio.run(main())
