import os
import sys
from bs4 import BeautifulSoup

input_path = r'C:\Users\marce\.gemini\antigravity\brain\f24c741f-5820-4f25-a07d-2b31f555297a\.user_uploaded\media_1787318641906.html'

with open(input_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

soup = BeautifulSoup(html_content, 'html.parser')

priority_map = {
    'Crítico': 0,
    'Alto': 1,
    'Médio': 2,
    'Baixo': 3
}

def get_priority(impact_text):
    for key, val in priority_map.items():
        if key in impact_text:
            return val
    if 'Bloqueio de pipeline' in impact_text:
        return 0
    return 4

for table in soup.find_all('table'):
    tbody = table.find('tbody')
    if not tbody: continue
    
    rows = tbody.find_all('tr')
    
    # Sort rows by priority
    rows.sort(key=lambda row: get_priority(row.find_all('td')[3].get_text()))
    
    # Re-append sorted rows and add checkbox
    tbody.clear()
    for row in rows:
        tds = row.find_all('td')
        if len(tds) == 6:
            status_td = tds[5]
            checkbox_html = '<label style="display: flex; align-items: center; gap: 4px; justify-content: center; margin-top: 4px; cursor: pointer;"><input type="checkbox" class="status-checkbox" onchange="const row = this.closest(\'tr\'); if(this.checked) { row.style.opacity = \'0.5\'; row.style.backgroundColor = \'#f0fdf4\'; } else { row.style.opacity = \'1\'; row.style.backgroundColor = \'\'; }"> <span style="font-size: 0.65rem;">Concluído</span></label>'
            cb_soup = BeautifulSoup(checkbox_html, 'html.parser')
            status_td.append(cb_soup)
        tbody.append(row)

# Inject script and style if needed
style = soup.new_tag('style')
style.string = '.status-checkbox { cursor: pointer; }'
if soup.head:
    soup.head.append(style)

output_path = r'C:\Users\marce\.gemini\antigravity\brain\f24c741f-5820-4f25-a07d-2b31f555297a\auditoria-organizada.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(str(soup))
print(f'Processed and saved to {output_path}')
