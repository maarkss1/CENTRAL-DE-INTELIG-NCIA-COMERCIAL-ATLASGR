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

all_rows = []

# For each table, find the H2 right before it
for table in soup.find_all('table'):
    agent_h2 = table.find_previous_sibling('h2')
    agent_name = agent_h2.get_text().strip() if agent_h2 else "Desconhecido"
    
    tbody = table.find('tbody')
    if not tbody: continue
    
    for row in tbody.find_all('tr'):
        tds = row.find_all('td')
        if len(tds) < 6:
            continue
            
        priority = get_priority(tds[3].get_text())
        
        # We need to insert a new TD for the agent
        agent_td = soup.new_tag('td')
        agent_td.string = agent_name
        # Insert as second column
        row.insert(1, agent_td)
        
        all_rows.append({
            'priority': priority,
            'row': row
        })

# Sort all rows globally
all_rows.sort(key=lambda x: x['priority'])

# Now create a new document structure
new_soup = BeautifulSoup(html_content, 'html.parser')

# Remove all existing H2 and tables
for h2 in new_soup.find_all('h2'):
    h2.decompose()
for table in new_soup.find_all('table'):
    table.decompose()

container = new_soup.find(class_='container')

# Create the unified table
new_table = new_soup.new_tag('table')
new_thead = new_soup.new_tag('thead')
header_tr = new_soup.new_tag('tr')

headers = ["Tag", "Domínio / Agente", "Arquivo / Linha", "Descrição do Problema", "Impacto", "O que precisa ser feito", "Status", "Concluído"]
widths = ["6%", "15%", "15%", "20%", "12%", "22%", "5%", "5%"]

for h, w in zip(headers, widths):
    th = new_soup.new_tag('th', style=f"width:{w}")
    th.string = h
    header_tr.append(th)

new_thead.append(header_tr)
new_table.append(new_thead)

new_tbody = new_soup.new_tag('tbody')

for item in all_rows:
    row = item['row']
    # Add checkbox TD at the end
    tds = row.find_all('td')
    status_td = tds[6] # It's now index 6 because we inserted Agente at 1
    
    checkbox_td = new_soup.new_tag('td', style="text-align: center;")
    checkbox_html = '<input type="checkbox" class="status-checkbox" onchange="const row = this.closest(\'tr\'); if(this.checked) { row.style.opacity = \'0.5\'; row.style.backgroundColor = \'#f0fdf4\'; } else { row.style.opacity = \'1\'; row.style.backgroundColor = \'\'; }">'
    cb_soup = BeautifulSoup(checkbox_html, 'html.parser')
    checkbox_td.append(cb_soup)
    row.append(checkbox_td)
    
    new_tbody.append(row)

new_table.append(new_tbody)
container.append(new_table)

style = new_soup.new_tag('style')
style.string = '.status-checkbox { cursor: pointer; transform: scale(1.3); }'
if new_soup.head:
    new_soup.head.append(style)

output_path = r'C:\Users\marce\.gemini\antigravity\brain\f24c741f-5820-4f25-a07d-2b31f555297a\auditoria-priorizada-unificada.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(str(new_soup))
print(f'Processed and saved to {output_path}')
