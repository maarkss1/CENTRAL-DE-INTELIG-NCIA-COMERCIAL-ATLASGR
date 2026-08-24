import os

arrumar_path = r"D:\ARRUMAR"
for item in os.listdir(arrumar_path):
    full = os.path.join(arrumar_path, item)
    if os.path.isfile(full):
        size = os.path.getsize(full)
        if size > 1000000 or any(k in item.lower() for k in ['sqlite', 'csv', 'gz', 'json', 'rar', 'zip', 'd0413', '0ca6']):
            print(f"FILE: {item} ({size:,} bytes)")
    elif os.path.isdir(full):
        print(f"DIR: {item}")
