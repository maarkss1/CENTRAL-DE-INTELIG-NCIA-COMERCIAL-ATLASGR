import os
import sys
import subprocess

def find_gz():
    print("Searching for .gz files on D:\\ and C:\\...")
    for drive in ["D:\\", "C:\\Users\\Marcelo"]:
        for root, dirs, files in os.walk(drive):
            for f in files:
                if f.endswith(".gz"):
                    print("GZ FILE:", os.path.join(root, f))
                if f.endswith((".rar", ".zip", ".7z")):
                    # check if it mentions snapshot or d0413a13df4be958
                    lower = f.lower()
                    if any(k in lower for k in ['cache', 'market', 'cnpj', 'atlas', 'snapshot', 'intel']):
                        print("ARCHIVE:", os.path.join(root, f))

find_gz()
