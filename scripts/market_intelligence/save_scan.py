import os
import sys

targets = ['manifest.json', 'rntrc_by_cnpj.csv', 'd0413a13df4be958', '0ca6f0104ef847a9', 'snapshot=', 'competencia=2026-08', 'market-intelligence']

output_file = r"C:\Users\Marcelo\.gemini\antigravity\brain\1f4c2a69-dbf4-4f82-9129-d63361214712\scratch\scan_results.txt"

with open(output_file, 'w', encoding='utf-8') as out:
    def log(msg):
        out.write(msg + '\n')

    def scan(root_dir, max_depth=7):
        base_depth = root_dir.rstrip(r'\/').count(os.sep)
        for root, dirs, files in os.walk(root_dir):
            cur_depth = root.count(os.sep) - base_depth
            if cur_depth > max_depth:
                dirs.clear()
                continue
            for d in list(dirs):
                if any(t in d.lower() for t in targets):
                    log(f"DIR MATCH: {os.path.join(root, d)}")
            for f in files:
                if any(t in f.lower() for t in targets):
                    log(f"FILE MATCH: {os.path.join(root, f)}")

    log("Scanning D:...")
    scan("D:\\", max_depth=7)
    log("Scanning C:\\Users\\Marcelo...")
    scan("C:\\Users\\Marcelo", max_depth=6)
    log("Done scan.")
