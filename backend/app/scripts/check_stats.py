import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from backend.app.services.supabase_service import SupabaseService

load_dotenv()

def check_counts():
    service = SupabaseService()
    query = """
        SELECT 
            c.name, 
            COUNT(d.id) as count 
        FROM campaigns c 
        JOIN form_titles ft ON ft.campaign_id = c.id 
        JOIN donations d ON d.form_title_id = ft.id 
        GROUP BY c.name 
        ORDER BY count DESC 
        LIMIT 10
    """
    try:
        results = service._execute_query(query)
        print("Top 10 Campaigns by Donation Count:")
        for row in results:
            print(f"- {row['name']}: {row['count']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_counts()
