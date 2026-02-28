"""
Script para re-autorizar credenciales de Gmail duplicadas.

Uso:
  # Re-autorizar una credencial específica:
  python -m backend.app.scripts.reauthorize_credentials --reauth 11

  # Re-autorizar las 3 duplicadas (interactivo):
  python -m backend.app.scripts.reauthorize_credentials --fix-duplicates

  # Verificar estado actual de todos los tokens:
  python -m backend.app.scripts.reauthorize_credentials --verify-all
"""

import os
import sys
import json
import argparse

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Scopes: gmail.send (for sending) + gmail.readonly (to verify email address)
SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
]

# Base directories
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, '..'))
CREDENTIALS_NORMAL_DIR = os.path.join(BACKEND_DIR, 'gmail_credentials', 'Normal')
CREDENTIALS_BP_DIR = os.path.join(BACKEND_DIR, 'gmail_credentials', 'BigPond')

# The mapping of duplicates to the accounts they should be re-authorized with
DUPLICATE_FIXES = {
    # credential_account_number: target_email
    # These are the 3 duplicate credential files and the accounts they should use
    11: 'assafs@animallove.cr',
    12: 'assaf.shlosberg@animallove.cr',
    16: 'assaf.sh@animallove.cr',  # Old system had this (dot, not underscore)
}


def get_credential_path(account_num: int) -> str:
    """Get the full path to a credential file by account number."""
    filename = f"credentials_account{account_num}.json"
    path = os.path.join(CREDENTIALS_NORMAL_DIR, filename)
    if not os.path.exists(path):
        # Try BigPond
        bp_name = f"credentials_account_BP.json" if account_num == 'BP' else None
        if bp_name:
            path = os.path.join(CREDENTIALS_BP_DIR, bp_name)
    return path


def get_token_path(credential_filename: str) -> str:
    """Get the token file path (at project root, matching GmailService convention)."""
    token_name = f"token_{credential_filename}.json"
    return os.path.join(PROJECT_ROOT, token_name)


def get_email_from_token(token_path: str) -> str:
    """Try to get the email associated with a token by calling Gmail API."""
    if not os.path.exists(token_path):
        return "<no token file>"

    try:
        creds = Credentials.from_authorized_user_file(token_path)

        # Refresh if expired
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Save refreshed token
            with open(token_path, 'w') as f:
                f.write(creds.to_json())

        if not creds or not creds.valid:
            return "<token invalid/expired>"

        # Check if we have readonly scope
        token_scopes = creds.scopes or []
        if 'https://www.googleapis.com/auth/gmail.readonly' not in token_scopes:
            return "<needs gmail.readonly scope to verify>"

        service = build('gmail', 'v1', credentials=creds)
        profile = service.users().getProfile(userId='me').execute()
        return profile.get('emailAddress', '<unknown>')
    except Exception as e:
        return f"<error: {str(e)[:60]}>"


def reauthorize_credential(account_num: int, target_email: str = None):
    """Delete token and re-authorize a specific credential file."""
    credential_filename = f"credentials_account{account_num}.json"
    credential_path = os.path.join(CREDENTIALS_NORMAL_DIR, credential_filename)

    if not os.path.exists(credential_path):
        print(f"  ❌ Credential file not found: {credential_path}")
        return False

    token_path = get_token_path(credential_filename)

    print(f"\n{'='*60}")
    print(f"  RE-AUTHORIZING: credentials_account{account_num}.json")
    if target_email:
        print(f"  👉 LOG INTO: {target_email}")
    print(f"{'='*60}")

    # Delete existing token
    if os.path.exists(token_path):
        os.remove(token_path)
        print(f"  🗑️  Deleted old token: {os.path.basename(token_path)}")
    else:
        print(f"  ℹ️  No existing token found (first authorization)")

    # Run OAuth flow
    print(f"\n  🌐 Opening browser for OAuth authorization...")
    if target_email:
        print(f"  ⚠️  IMPORTANT: Log into {target_email} in the browser!")
    print()

    try:
        flow = InstalledAppFlow.from_client_secrets_file(credential_path, SCOPES)
        creds = flow.run_local_server(port=0)

        # Save new token
        with open(token_path, 'w') as f:
            f.write(creds.to_json())
        print(f"\n  ✅ New token saved: {os.path.basename(token_path)}")

        # Verify the authorized email
        try:
            service = build('gmail', 'v1', credentials=creds)
            profile = service.users().getProfile(userId='me').execute()
            actual_email = profile.get('emailAddress', 'unknown')
            print(f"  📧 Authorized email: {actual_email}")

            if target_email and actual_email.lower() != target_email.lower():
                print(f"\n  ⚠️  WARNING: Expected {target_email} but got {actual_email}!")
                print(f"  You may need to re-run this for account {account_num}.")
                return False
            else:
                print(f"  ✅ Email matches expected account!")
                return True
        except Exception as e:
            print(f"  ⚠️  Could not verify email (token saved anyway): {e}")
            return True

    except Exception as e:
        print(f"  ❌ Authorization failed: {e}")
        return False


def verify_all():
    """List all credential files and try to determine their associated email."""
    print("\n" + "=" * 80)
    print("  CREDENTIAL VERIFICATION REPORT")
    print("=" * 80)

    # Check Normal accounts
    print(f"\n  📁 Normal accounts ({CREDENTIALS_NORMAL_DIR}):\n")
    print(f"  {'#':<4} {'Credential File':<35} {'Token Email':<40}")
    print(f"  {'-'*4} {'-'*35} {'-'*40}")

    seen_emails = {}  # email -> list of account numbers

    for i in range(1, 17):
        credential_filename = f"credentials_account{i}.json"
        token_path = get_token_path(credential_filename)
        email = get_email_from_token(token_path)

        # Track duplicates
        if email and not email.startswith('<'):
            if email.lower() in seen_emails:
                seen_emails[email.lower()].append(i)
            else:
                seen_emails[email.lower()] = [i]

        print(f"  {i:<4} {credential_filename:<35} {email:<40}")

    # Check BigPond accounts
    print(f"\n  📁 BigPond accounts ({CREDENTIALS_BP_DIR}):\n")
    for bp_name in ['credentials_account_BP.json', 'credentials_account_BP_1.json']:
        token_path = get_token_path(bp_name)
        email = get_email_from_token(token_path)
        label = bp_name.replace('credentials_', '').replace('.json', '')
        print(f"  {'BP':<4} {bp_name:<35} {email:<40}")

        if email and not email.startswith('<'):
            if email.lower() in seen_emails:
                seen_emails[email.lower()].append(label)
            else:
                seen_emails[email.lower()] = [label]

    # Report duplicates
    duplicates = {email: accounts for email, accounts in seen_emails.items() if len(accounts) > 1}
    print(f"\n  {'='*60}")
    if duplicates:
        print(f"  ⚠️  DUPLICATES FOUND:")
        for email, accounts in duplicates.items():
            print(f"    - {email} → accounts: {accounts}")
    else:
        print(f"  ✅ No duplicates found! All accounts are unique.")
    print(f"  {'='*60}\n")


def fix_duplicates():
    """Interactive flow to fix the 3 known duplicate credentials."""
    print("\n" + "=" * 60)
    print("  FIXING DUPLICATE CREDENTIALS")
    print("=" * 60)

    # Fix account 11 → assafs@animallove.cr
    print("\n  📋 Step 1 of 3: Fix credentials_account11.json")
    print("     Currently duplicates: assaf@landsinlove.com")
    print("     Should be: assafs@animallove.cr")
    input("\n  Press ENTER when ready to open the browser...")
    reauthorize_credential(11, 'assafs@animallove.cr')

    # Fix account 12 → assaf.shlosberg@animallove.cr
    print("\n  📋 Step 2 of 3: Fix credentials_account12.json")
    print("     Currently duplicates: shlos@animallove.cr")
    print("     Should be: assaf.shlosberg@animallove.cr")
    input("\n  Press ENTER when ready to open the browser...")
    reauthorize_credential(12, 'assaf.shlosberg@animallove.cr')

    # Fix account 16 → assaf.sh@animallove.cr
    print("\n  📋 Step 3 of 3: Fix credentials_account16.json")
    print("     Currently duplicates: shlos@animallove.cr")
    print("     Should be: assaf.sh@animallove.cr (with dot, NOT underscore)")
    input("\n  Press ENTER when ready to open the browser...")
    reauthorize_credential(16, 'assaf.sh@animallove.cr')

    print("\n" + "=" * 60)
    print("  ✅ DONE! Run with --verify-all to confirm the fix.")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='Re-authorize Gmail credentials')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--reauth', type=int, metavar='N',
                       help='Re-authorize credential account N (opens browser for OAuth)')
    group.add_argument('--fix-duplicates', action='store_true',
                       help='Interactive flow to fix the 3 known duplicate credentials')
    group.add_argument('--verify-all', action='store_true',
                       help='List all credentials and their associated emails')

    args = parser.parse_args()

    if args.verify_all:
        verify_all()
    elif args.fix_duplicates:
        fix_duplicates()
    elif args.reauth is not None:
        target = DUPLICATE_FIXES.get(args.reauth)
        email_hint = input(f"  Enter the email to authorize for account {args.reauth} (or press Enter to skip hint): ").strip() or target
        reauthorize_credential(args.reauth, email_hint)


if __name__ == '__main__':
    main()
