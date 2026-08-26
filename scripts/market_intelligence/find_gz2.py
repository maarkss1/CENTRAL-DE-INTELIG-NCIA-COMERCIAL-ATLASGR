import os
import sys

out_path = r"C:\Users\Marcelo\.gemini\antigravity\brain\1f4c2a69-dbf4-4f82-9129-d63361214712\scratch\gz_and_archives.txt"

with open(out_path, "w", encoding="utf-8") as out:
    def log(msg):
        out.write(msg + "\n")

    for drive in ["D:\\", "C:\\Users\\Marcelo"]:
        for root, dirs, files in os.walk(drive):
            for f in files:
                if f.endswith(".gz"):
                    log(f"GZ FILE: {os.path.join(root, f)}")
                if f.endswith((".rar", ".zip", ".7z")):
                    lower = f.lower()
                    if any(k in lower for k in ['cache', 'market', 'cnpj', 'atlas', 'snapshot', 'intel', 'd0413a13']):
                        log(f"ARCHIVE: {os.path.join(root, f)}")

print("Done find_gz.")
