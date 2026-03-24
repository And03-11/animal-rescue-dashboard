import os, json

base_dir = r"r:\Coding\dashboard_animal_rescue\campaign_data"
out_file = r"r:\Coding\dashboard_animal_rescue\root_brook_campaigns.txt"

with open(out_file, 'w', encoding='utf-8') as cout:
    cout.write(f'=== CAMPAIGNS IN {base_dir} (BROOK) ===\n')

    for f in os.listdir(base_dir):
        p = os.path.join(base_dir, f)
        try:
            with open(p, 'r', encoding='utf-8') as fl: 
                c = json.load(fl)
            name = c.get('campaign_name', '')
            if 'Brook' in name:
                cout.write(f"{f}: Name='{name}' Status='{c.get('status')}' Sent={c.get('sent_count_final', 0)} Targets={c.get('target_count')} Sched={c.get('scheduled_at')}\n")
        except Exception as e:
            pass
print("Done writing to root_brook_campaigns.txt")
