import os
import sys
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Add backend to path to allow imports if needed, though we'll try to keep this standalone-ish
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

CREDENTIALS_DIR = r"r:\Coding\dashboard_animal_rescue\backend\gmail_credentials"

def get_email_from_credential(file_path):
    try:
        # Load the JSON directly first to check for 'client_email' (Service Account)
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        if 'client_email' in data:
            return f"{data['client_email']} (Service Account)"
            
        # If it's an OAuth user credential (installed app), we need to load it and ask Gmail API
        # Or check if there is a corresponding token file.
        # Assuming the system uses token files generated alongside.
        
        # Let's try to use the existing GmailService logic if possible, 
        # but to be safe and simple, let's just look for the token file which usually contains the scope/email? 
        # No, token file has refresh token.
        
        # We need to authenticate to get the profile email.
        # This might be slow if we do it for 18 accounts.
        
        # Alternative: The 'client_id' in the json identifies the APP, not the user.
        # The USER identity is in the 'token_*.json' file.
        
        # GmailService uses: f"token_{os.path.basename(credentials_path)}.json"
        # And it saves it in the Current Working Directory (relative path).
        
        base_name = os.path.basename(file_path)
        token_name = f"token_{base_name}.json"
        
        # Check in CWD first (where they seem to be)
        token_path = os.path.join(os.getcwd(), token_name)
        
        # DEBUG
        print(f"Checking token path: {token_path}")
        print(f"Exists? {os.path.exists(token_path)}")

        
        if not os.path.exists(token_path):

            # Fallback: Check in the same directory as credentials (just in case)
            dir_name = os.path.dirname(file_path)
            token_path = os.path.join(dir_name, token_name)
        
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path)
            if creds and creds.valid:
                # We can try to fetch the profile
                service = build('gmail', 'v1', credentials=creds)
                profile = service.users().getProfile(userId='me').execute()
                return profile.get('emailAddress')
            elif creds and creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
                service = build('gmail', 'v1', credentials=creds)
                profile = service.users().getProfile(userId='me').execute()
                return profile.get('emailAddress')
                
        return "Unknown (No valid token found)"
        
    except Exception as e:
        return f"Error: {str(e)}"

def audit_credentials():
    print(f"Auditing credentials in: {CREDENTIALS_DIR}")
    if not os.path.exists(CREDENTIALS_DIR):
        print("Credentials directory not found!")
        return

    results = []
    for root, dirs, files in os.walk(CREDENTIALS_DIR):
        for file in files:
            if file.endswith(".json") and not file.startswith("token_"):
                full_path = os.path.join(root, file)
                # print(f"Checking {file}...", end="", flush=True)
                email = get_email_from_credential(full_path)
                # print(f" -> {email}")
                results.append({"file": file, "email": email, "path": full_path})
    
import os
import sys
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Add backend to path to allow imports if needed, though we'll try to keep this standalone-ish
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

CREDENTIALS_DIR = r"r:\Coding\dashboard_animal_rescue\backend\gmail_credentials"

def get_email_from_credential(file_path):
    try:
        # Load the JSON directly first to check for 'client_email' (Service Account)
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        if 'client_email' in data:
            return f"{data['client_email']} (Service Account)"
            
        # If it's an OAuth user credential (installed app), we need to load it and ask Gmail API
        # Or check if there is a corresponding token file.
        # Assuming the system uses token files generated alongside.
        
        # Let's try to use the existing GmailService logic if possible, 
        # but to be safe and simple, let's just look for the token file which usually contains the scope/email? 
        # No, token file has refresh token.
        
        # We need to authenticate to get the profile email.
        # This might be slow if we do it for 18 accounts.
        
        # Alternative: The 'client_id' in the json identifies the APP, not the user.
        # The USER identity is in the 'token_*.json' file.
        
        # Let's look for the corresponding token file.
        dir_name = os.path.dirname(file_path)
        base_name = os.path.basename(file_path)
        token_path = os.path.join(dir_name, f"token_{base_name}")
        
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path)
            if creds and creds.valid:
                # We can try to fetch the profile
                service = build('gmail', 'v1', credentials=creds)
                profile = service.users().getProfile(userId='me').execute()
                return profile.get('emailAddress')
            elif creds and creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
                service = build('gmail', 'v1', credentials=creds)
                profile = service.users().getProfile(userId='me').execute()
                return profile.get('emailAddress')
                
        return "Unknown (No valid token found)"
        
    except Exception as e:
        return f"Error: {str(e)}"

def audit_credentials():
    print(f"Auditing credentials in: {CREDENTIALS_DIR}")
    if not os.path.exists(CREDENTIALS_DIR):
        print("Credentials directory not found!")
        return

    results = []
    for root, dirs, files in os.walk(CREDENTIALS_DIR):
        for file in files:
            if file.endswith(".json") and not file.startswith("token_"):
                full_path = os.path.join(root, file)
                # print(f"Checking {file}...", end="", flush=True)
                email = get_email_from_credential(full_path)
                # print(f" -> {email}")
                results.append({"file": file, "email": email, "path": full_path})
    
    # Check for duplicates
    email_map = {}
    for item in results:
        email = item['email']
        if email not in email_map:
            email_map[email] = []
        email_map[email].append(item['file'])

    with open("duplicates_report.txt", "w", encoding="utf-8") as f:
        f.write("DUPLICATE ACCOUNTS FOUND\n")
        f.write("="*50 + "\n")
        
        found_duplicates = False
        for email, files in email_map.items():
            if len(files) > 1:
                found_duplicates = True
                f.write(f"[DUPLICATE] {email}\n")
                for file_name in files:
                    f.write(f"   - {file_name}\n")
        
        if not found_duplicates:
            f.write("No duplicates found.\n")
            
    print("Report written to duplicates_report.txt")


if __name__ == "__main__":
    audit_credentials()
