import os, json
print('=== CAMPAIGNS IN campaign_data/ (BROOK) ===')
for f in os.listdir('campaign_data'):
    p = os.path.join('campaign_data', f)
    try:
        with open(p, 'r', encoding='utf-8') as fl: 
            c = json.load(fl)
        name = c.get('campaign_name', '')
        if 'Brook' in name:
            print(f"{f}: Name='{name}' Status='{c.get('status')}' Sent={c.get('sent_count_final', 0)} Targets={c.get('target_count')} Sched={c.get('scheduled_at')}")
    except Exception as e:
        pass
