with open(r'C:\Users\Marcelo\.gemini\antigravity\brain\1f4c2a69-dbf4-4f82-9129-d63361214712\scratch\scan_results.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(r'C:\Users\Marcelo\.gemini\antigravity\brain\1f4c2a69-dbf4-4f82-9129-d63361214712\scratch\clean_matches.txt', 'w', encoding='utf-8') as out:
    for line in lines:
        if any(ign in line for ign in ['Textos\\🗒️ MD', 'AppData\\Local\\GitKraken', 'AppData\\Local\\Temp']):
            continue
        out.write(line)
