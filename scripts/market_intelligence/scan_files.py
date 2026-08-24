import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

targets = ['manifest.json', 'rntrc_by_cnpj.csv', 'd0413a13df4be958', '0ca6f0104ef847a9', '.cache', 'competencia=2026-08', 'market-intelligence']

def scan(root_dir, max_depth=6):
    try:
        base_depth = root_dir.rstrip(r'\/').count(os.sep)
        for root, dirs, files in os.walk(root_dir):
            cur_depth = root.count(os.sep) - base_depth
            if cur_depth > max_depth:
                dirs.clear()
                continue
            for d in list(dirs):
                if any(t in d.lower() for t in targets):
                    print("DIR MATCH:", os.path.join(root, d))
            for f in files:
                if any(t in f.lower() for t in targets):
                    print("FILE MATCH:", os.path.join(root, f))
    except Exception as e:
        print(f"Error scanning {root_dir}: {e}")

print("Scanning D:...")
scan("D:\\", max_depth=7)
print("Done scan.")
