with open('backend_logs.txt', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()
    print("--- LAST 200 LINES OF backend_logs.txt ---")
    for line in lines[-200:]:
        print(line, end='')
