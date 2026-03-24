import sys
import os
sys.path.append('.')
from dotenv import load_dotenv

load_dotenv()
from app.services.email_sender_service import get_email_sender_service

try:
    service = get_email_sender_service()
    results = service._execute_query('''
        SELECT id, campaign_name, status, scheduled_at, created_at, target_count, sent_count_final
        FROM email_sender_campaigns 
        ORDER BY scheduled_at DESC NULLS LAST LIMIT 50
    ''')
    with open('db_output_utf8.txt', 'w', encoding='utf-8') as f:
        f.write("==== RECENT CAMPAIGNS ====\n")
        # Find exactly the ones scheduled for around 1 AM 24th March
        for r in results:
            sched = str(r['scheduled_at']) if r['scheduled_at'] else "None"
            f.write(f"ID: {r['id'][:8]} | Name: {r['campaign_name']} | Status: {r['status']} | Sched: {sched} | Targets: {r['target_count']} | Sent: {r.get('sent_count_final', 0)}\n")
    print("Success writing to db_output_utf8.txt")
except Exception as e:
    import traceback
    traceback.print_exc()
