const fs = require('fs');

const transcriptPath = 'C:\\Users\\Mah\\.gemini\\antigravity\\brain\\614eae9f-6d6b-4451-8137-161d310a4c70\\.system_generated\\logs\\transcript_full.jsonl';

const fileContent = fs.readFileSync(transcriptPath, 'utf8');

let found_10 = false;
let found_11 = false;

fileContent.split('\n').forEach(line => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    const searchObj = (obj) => {
      if (typeof obj === 'string') {
        if (obj.includes('#Requires -Version 5.1')) {
          const parts = obj.split('#Requires -Version 5.1');
          for (let i = 1; i < parts.length; i++) {
            let script = '#Requires -Version 5.1' + parts[i];
            
            const idx = script.indexOf('</USER_REQUEST>');
            if (idx !== -1) {
              script = script.substring(0, idx).trim();
            }
            // Remove any trailing XML tags like </USER_SETTINGS_CHANGE>
            const idx2 = script.indexOf('</USER_SETTINGS_CHANGE>');
            if (idx2 !== -1) {
              script = script.substring(0, idx2).trim();
            }
            
            if (script.includes('Write-FileFromContent -RelativePath "src/modules/crm/application/')) {
              fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-10-APPLICATION.ps1', script);
              found_10 = true;
              console.log('Found FASE 10');
            }
            
            if (script.includes('FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE')) {
              fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-11-INFRASTRUCTURE.ps1', script);
              found_11 = true;
              console.log('Found FASE 11');
            }
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchObj);
      } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(searchObj);
      }
    };
    searchObj(data);
  } catch (e) {}
});

if (!found_10) console.log('Failed to find FASE 10');
if (!found_11) console.log('Failed to find FASE 11');
