import requests
import json

def test_source_donations():
    base_url = "http://localhost:8001/api/v1"
    source_name = "Big Campaign"
    
    print(f"Testing source donations for: {source_name}")
    
    url = f"{base_url}/campaigns/source/{source_name}/donations"
    params = {
        "page_size": 10,
        "offset": 0
    }
    
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            donations = data.get("donations", [])
            total_count = data.get("total_count", 0)
            print(f"✅ Success! Found {len(donations)} donations. Total count: {total_count}")
            if donations:
                print("First donation sample:")
                print(json.dumps(donations[0], indent=2))
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    test_source_donations()
