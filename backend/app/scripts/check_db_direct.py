from backend.app.db.database import SessionLocal
from sqlalchemy import text

def check_db():
    db = SessionLocal()
    try:
        print("🔍 Checking Supabase DB directly...")
        
        # Check campaigns
        sql_campaigns = text("SELECT id, name, source FROM campaigns WHERE source = 'Big Campaign'")
        result = db.execute(sql_campaigns).fetchall()
        print(f"Found {len(result)} campaigns for 'Big Campaign':")
        for r in result:
            print(f" - {r[1]} (ID: {r[0]})")
            
        if not result:
            print("⚠️ No campaigns found! This explains why no donors are shown.")
            return

        # Check donations
        sql_donations = text("""
            SELECT count(*) 
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            JOIN campaigns c ON ft.campaign_id = c.id
            WHERE c.source = 'Big Campaign'
            AND d.donation_date >= '2025-11-01' AND d.donation_date <= '2025-11-30'
        """)
        count = db.execute(sql_donations).scalar()
        print(f"Found {count} donations in Supabase for 'Big Campaign' between 2025-11-01 and 2025-11-30")

        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_db()
