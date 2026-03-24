import os
import sys
sys.path.append('.')
from dotenv import load_dotenv

load_dotenv()
from app.services.email_sender_service import get_email_sender_service

try:
    service = get_email_sender_service()
    results = service._execute_query('''
        SELECT id, campaign_name, status, scheduled_at, target_count, sent_count_final
        FROM email_sender_campaigns 
        WHERE campaign_name LIKE '%Brook%'
        ORDER BY scheduled_at DESC LIMIT 10
    ''')
    for r in results:
        print(f"ID: {r['id']} | Name: {r['campaign_name']} | Status: {r['status']}")
except Exception as e:
    print(f"Error: {e}")
