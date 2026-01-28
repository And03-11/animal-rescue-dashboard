import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001/api/v1"

def login():
    print("0. Logging in...")
    login_data = {
        "username": "Ronald",
        "password": "Androc1020@"
    }
    res = requests.post(f"{BASE_URL}/login", data=login_data)
    if res.status_code != 200:
        print(f"Failed to login: {res.text}")
        return None
    return res.json()["access_token"]

def test_duplicate_behavior():
    token = login()
    if not token:
        return
    
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Campaign
    print("1. Creating Campaign...")
    campaign_data = {
        "title": "Test Duplicate Campaign",
        "start_date": datetime.now().isoformat(),
        "end_date": (datetime.now() + timedelta(days=7)).isoformat(),
        "category": "Other",
        "notes": "Testing duplicate behavior",
        "segmentation_mode": "standard"
    }
    res = requests.post(f"{BASE_URL}/scheduler/events", json=campaign_data, headers=headers)
    if res.status_code != 201:
        print(f"Failed to create campaign: {res.text}")
        return
    campaign = res.json()
    campaign_id = campaign['id']
    print(f"Campaign created: {campaign_id}")

    # 2. Create Email
    print("\n2. Creating Email...")
    email_data = {
        "campaign_id": campaign_id,
        "title": "Original Email",
        "subject": "Original Subject",
        "button_name": "Donate",
        "link_donation": "http://example.com",
        "link_contact_us": "http://example.com",
        "custom_links": ""
    }
    res = requests.post(f"{BASE_URL}/scheduler/emails", json=email_data, headers=headers)
    if res.status_code != 201:
        print(f"Failed to create email: {res.text}")
        return
    email = res.json()
    email_id = email['id']
    print(f"Email created: {email_id}")

    # 3. Create Send
    print("\n3. Creating Send...")
    send_data = {
        "campaign_email_id": email_id,
        "send_at": (datetime.now() + timedelta(hours=1)).isoformat(),
        "service": "Automation",
        "status": "pending",
        "segment_tag": "Original Segment",
        "is_dnr": False,
        "dnr_date": None
    }
    res = requests.post(f"{BASE_URL}/scheduler/sends", json=send_data, headers=headers)
    if res.status_code != 201:
        print(f"Failed to create send: {res.text}")
        return
    send1 = res.json()
    print(f"Send 1 created: {send1['id']}")

    # 4. Duplicate Send (Simulate frontend logic)
    print("\n4. Duplicating Send...")
    duplicate_data = {
        "campaign_email_id": email_id, # SAME EMAIL ID
        "send_at": (datetime.now() + timedelta(hours=2)).isoformat(),
        "service": "Automation",
        "status": "pending",
        "segment_tag": "Original Segment (Copy)",
        "is_dnr": False,
        "dnr_date": None
    }
    res = requests.post(f"{BASE_URL}/scheduler/sends", json=duplicate_data, headers=headers)
    if res.status_code != 201:
        print(f"Failed to duplicate send: {res.text}")
        return
    send2 = res.json()
    print(f"Send 2 created: {send2['id']}")

    # 5. Verify Linkage
    print("\n5. Verifying Linkage...")
    print(f"Send 1 Email ID: {send1['campaign_email_id']}")
    print(f"Send 2 Email ID: {send2['campaign_email_id']}")
    
    if send1['campaign_email_id'] == send2['campaign_email_id']:
        print("SUCCESS: Both sends share the same campaign_email_id.")
    else:
        print("FAILURE: Sends have different campaign_email_id.")

    # 6. Update Email Subject
    print("\n6. Updating Email Subject...")
    update_data = {
        "subject": "Updated Subject",
        "title": "Updated Subject"
    }
    res = requests.put(f"{BASE_URL}/scheduler/emails/{email_id}", json=update_data, headers=headers)
    if res.status_code != 200:
        print(f"Failed to update email: {res.text}")
        return
    updated_email = res.json()
    print(f"Email updated: {updated_email['subject']}")

    # 7. Fetch Events to verify both sends show updated subject (simulating frontend fetch)
    print("\n7. Verifying Events...")
    start = (datetime.now() - timedelta(days=1)).isoformat()
    end = (datetime.now() + timedelta(days=8)).isoformat()
    res = requests.get(f"{BASE_URL}/scheduler/events", params={"start": start, "end": end}, headers=headers)
    events = res.json()
    
    send1_event = next((e for e in events if e['id'] == f"send_{send1['id']}"), None)
    send2_event = next((e for e in events if e['id'] == f"send_{send2['id']}"), None)
    
    print(f"Send 1 Title: {send1_event['title']}")
    print(f"Send 2 Title: {send2_event['title']}")
    
    if "Updated Subject" in send1_event['title'] and "Updated Subject" in send2_event['title']:
        print("SUCCESS: Both events reflect the updated subject.")
    else:
        print("FAILURE: Events do not reflect the updated subject.")

if __name__ == "__main__":
    test_duplicate_behavior()
