const fs = require('fs');

const transcriptPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\614eae9f-6d6b-4451-8137-161d310a4c70\\.system_generated\\logs\\transcript_full.jsonl';

const fileContent = fs.readFileSync(transcriptPath, 'utf8');

let phase10_script = "";
let phase11_script = "";

fileContent.split('\n').forEach(line => {
  if (!line) return;
  try {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT') {
      const content = data.content;
      if (content.includes('Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateLeadCommand.ts"')) {
         // Extract Phase 10
         const idx = content.indexOf('#Requires -Version 5.1');
         if (idx !== -1) {
            phase10_script = content.substring(idx);
            // remove any trailing </USER_REQUEST> if it exists
            const endIdx = phase10_script.lastIndexOf('</USER_REQUEST>');
            if (endIdx !== -1 && endIdx > phase10_script.length - 100) {
               phase10_script = phase10_script.substring(0, endIdx).trim();
            }
         }
      }
      
      if (content.includes('FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE')) {
         // Extract Phase 11
         const idx = content.indexOf('#Requires -Version 5.1');
         if (idx !== -1) {
            phase11_script = content.substring(idx);
            const endIdx = phase11_script.lastIndexOf('</USER_REQUEST>');
            if (endIdx !== -1 && endIdx > phase11_script.length - 100) {
               phase11_script = phase11_script.substring(0, endIdx).trim();
            }
         }
      }
    }
  } catch (e) {}
});

if (phase10_script) {
  fs.writeFileSync('C:\\Users\\USER\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-10-APPLICATION.ps1', phase10_script);
  console.log('Successfully wrote FASE-10-APPLICATION.ps1');
} else {
  console.log('Failed to find Phase 10 script');
}

if (phase11_script) {
  fs.writeFileSync('C:\\Users\\USER\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-11-INFRASTRUCTURE.ps1', phase11_script);
  console.log('Successfully wrote FASE-11-INFRASTRUCTURE.ps1');
} else {
  console.log('Failed to find Phase 11 script');
}
