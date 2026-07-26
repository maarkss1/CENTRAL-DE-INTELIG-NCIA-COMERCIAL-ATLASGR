const fs = require('fs');

const transcriptPath = 'C:\\Users\\Mah\\.gemini\\antigravity\\brain\\614eae9f-6d6b-4451-8137-161d310a4c70\\.system_generated\\logs\\transcript_full.jsonl';

const fileContent = fs.readFileSync(transcriptPath, 'utf8');

let phase10_script = "";
let phase11_script = "";

fileContent.split('\n').forEach(line => {
  try {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT') {
      const content = data.content || '';
      
      if (content.includes('Write-FileFromContent -RelativePath "src/modules/crm/application/')) {
        const idx = content.indexOf('#Requires -Version 5.1');
        if (idx !== -1) {
          phase10_script = content.substring(idx);
        }
      }
      
      if (content.includes('$Script:InfraRoot')) {
        const idx = content.indexOf('#Requires -Version 5.1');
        if (idx !== -1) {
          phase11_script = content.substring(idx);
        }
      }
    }
  } catch (e) {}
});

if (phase10_script) {
  fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-10-APPLICATION.ps1', phase10_script);
  console.log('Wrote FASE-10-APPLICATION.ps1');
} else {
  console.log('Could not find Phase 10 script');
}

if (phase11_script) {
  fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-11-INFRASTRUCTURE.ps1', phase11_script);
  console.log('Wrote FASE-11-INFRASTRUCTURE.ps1');
} else {
  console.log('Could not find Phase 11 script');
}
