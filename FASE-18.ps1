#Requires -Version 5.1" + parts[2]
    
    with open(r"C:\Users\Mah\Documents\GitHub\PROSPECTOR-ATLAS\FASE-10-APPLICATION.ps1", "w", encoding="utf-8") as f:
        f.write(script1)
        
    with open(r"C:\Users\Mah\Documents\GitHub\PROSPECTOR-ATLAS\FASE-11-INFRASTRUCTURE.ps1", "w", encoding="utf-8") as f:
        f.write(script2)
        
    print("Extracted scripts successfully.")
else:
    print(f"Found {len(parts)} parts, expected at least 3.")
