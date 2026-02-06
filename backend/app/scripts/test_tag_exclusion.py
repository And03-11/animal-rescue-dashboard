import os
import sys
from dotenv import load_dotenv

# Add backend to path - resolving from current script location
# Current: backend/app/scripts/test_tag_exclusion.py
# Root of project is ../../../
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from backend.app.services.airtable_service import AirtableService, EMAILS_FIELDS

def test_exclusion():
    load_dotenv()
    service = AirtableService()
    
    email_to_test = "dmeider@peoplepc.com"
    print(f"Testing for email: {email_to_test}")
    
    # 1. Fetch the record directly to see raw data
    email_field = EMAILS_FIELDS.get("email", "Email")
    tag_field = EMAILS_FIELDS.get("utils_tags", "Tag (Mailchimp) (from Donor)")
    
    formula = f"{{{email_field}}} = '{email_to_test}'"
    print(f"Querying with formula: {formula}")
    
    records = service.emails_table.all(formula=formula)
    
    if not records:
        print("❌ Email not found in Airtable.")
        return

    record = records[0]
    fields = record.get("fields", {})
    tags = fields.get(tag_field)
    
    print(f"\n--- Record Details ---")
    print(f"ID: {record['id']}")
    print(f"Email: {fields.get(email_field)}")
    print(f"Tags (raw): {tags}")
    
    # 2. Check exclusion logic
    excluded_tags = ['Aol and other accounts', 'Apple_Accounts USA', 'Apple_Accounts EUR']
    
    # Convert tags to string for search (in case it's a list)
    tags_str = str(tags) if tags else ""
    
    print(f"\n--- Exclusion Check ---")
    is_excluded = False
    for tag in excluded_tags:
        if tag in tags_str:
            print(f"🚫 MATCH FOUND: Contains prohibited tag '{tag}'")
            is_excluded = True
        else:
            print(f"✅ OK: Does not contain '{tag}'")
            
    output_msg = ""
    if is_excluded:
        output_msg = "\nRESULT: This contact WOULD BE EXCLUDED from the campaign."
    else:
        output_msg = "\nRESULT: This contact WOULD BE INCLUDED in the campaign."
    
    print(output_msg)
    
    # Save to file
    with open("test_result.txt", "w", encoding="utf-8") as f:
        f.write(f"Email: {email_to_test}\n")
        f.write(f"Tags: {tags}\n")
        f.write(output_msg)

if __name__ == "__main__":
    test_exclusion()
