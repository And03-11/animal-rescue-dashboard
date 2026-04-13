import os, httpx, json
from dotenv import load_dotenv

load_dotenv('backend/.env')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY')

res = httpx.get(f'{SUPABASE_URL}/rest/v1/templates?select=*&limit=5', headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
print("TEMPLATES:", res.status_code, res.text)
