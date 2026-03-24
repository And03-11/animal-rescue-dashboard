import os
import sys

# Agrega la ruta base del proyecto para poder importar módulos
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.email_sender_service import get_email_sender_service

def check():
    service = get_email_sender_service()
    campaigns = service._execute_query("""
        SELECT id, campaign_name, status, scheduled_at, created_at
        FROM email_sender_campaigns
        ORDER BY created_at DESC
        LIMIT 10
    """)
    with open('output_recent_campaigns.txt', 'w', encoding='utf-8') as f:
        for c in campaigns:
            f.write(f"ID: {c['id']}, Name: {c['campaign_name']}, Status: {c['status']}, Scheduled: {c['scheduled_at']}\n")

if __name__ == "__main__":
    check()
