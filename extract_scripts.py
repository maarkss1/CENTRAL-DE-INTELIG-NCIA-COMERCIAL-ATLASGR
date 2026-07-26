import re
import codecs

transcript_path = r"C:\Users\Mah\.gemini\antigravity\brain\614eae9f-6d6b-4451-8137-161d310a4c70\.system_generated\logs\transcript_full.jsonl"

with codecs.open(transcript_path, 'r', encoding='utf-8') as f:
    raw_content = f.read()

# Since the file is JSONL, we can try to extract the powershell scripts directly
# using a regex that captures everything from #Requires -Version 5.1 to the end of the script.
# In JSON, newlines are represented as \n, so we'll look for #Requires -Version 5.1

# unescape the content roughly
import ast

found_10 = False
found_11 = False

for line in raw_content.split('\n'):
    if not line.strip(): continue
    try:
        # Evaluate the line if it is a dictionary string
        import json
        data = json.loads(line)
        # Search all string values in data
        def search(obj):
            global found_10, found_11
            if isinstance(obj, str):
                if '#Requires -Version 5.1' in obj:
                    parts = obj.split('#Requires -Version 5.1')
                    for part in parts[1:]:
                        script = '#Requires -Version 5.1' + part
                        
                        # Cleanup the script from trailing tags
                        idx = script.find('</USER_REQUEST>')
                        if idx != -1:
                            script = script[:idx].strip()
                        
                        # Write it if it matches
                        if 'Write-FileFromContent -RelativePath "src/modules/crm/application/' in script:
                            with open(r"C:\Users\Mah\Documents\GitHub\PROSPECTOR-ATLAS\FASE-10-APPLICATION.ps1", "w", encoding="utf-8") as out:
                                out.write(script)
                            found_10 = True
                            print("Found FASE 10")
                            
                        if 'FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE' in script:
                            with open(r"C:\Users\Mah\Documents\GitHub\PROSPECTOR-ATLAS\FASE-11-INFRASTRUCTURE.ps1", "w", encoding="utf-8") as out:
                                out.write(script)
                            found_11 = True
                            print("Found FASE 11")
                            
            elif isinstance(obj, list):
                for v in obj:
                    search(v)
            elif isinstance(obj, dict):
                for v in obj.values():
                    search(v)
                    
        search(data)
    except Exception as e:
        pass

if not found_10: print("Failed to find FASE 10")
if not found_11: print("Failed to find FASE 11")
