import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.email_sender_service import get_email_sender_service

def reset_stuck_campaigns():
    service = get_email_sender_service()
    
    # Busca las campañas que están en "Sending" y que fueron creadas recientemente (hoy o ayer)
    # y las pasa a "Draft" para que el usuario pueda volver a enviarlas
    campaigns = service._execute_query("""
        SELECT id, campaign_name, status, scheduled_at 
        FROM email_sender_campaigns 
        WHERE status = 'Sending' AND sent_count_final = 0
    """)
    
    if not campaigns:
        print("✅ No stuck campaigns found.")
        return

    print("🔄 Resetting stuck campaigns to 'Draft':")
    for c in campaigns:
        campaign_id = c['id']
        print(f"   - Resetting: {campaign_id} ({c['campaign_name']})")
        service.update_campaign(campaign_id, {'status': 'Draft'})
        
    print("✅ Done! You can now edit/launch them again from the app.")

if __name__ == "__main__":
    reset_stuck_campaigns()
