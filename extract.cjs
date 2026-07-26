const fs = require('fs');
const readline = require('readline');
const path = 'C:/Users/Mah/.gemini/antigravity/brain/a605d77e-c5ad-42a6-b52d-9d4753fcd17b/.system_generated/logs/transcript_full.jsonl';
const fileStream = fs.createReadStream(path);
const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

let foundContent = null;
rl.on('line', (line) => {
  if (line.includes('"USER_INPUT"') && line.includes('implemente todos')) {
    try {
      const obj = JSON.parse(line);
      if (obj.content && obj.content.includes('implemente todos')) {
        foundContent = obj.content;
      }
    } catch(e) {}
  }
});
rl.on('close', () => {
  if (!foundContent) { console.log('Not found'); return; }
  
  let f10_start = foundContent.indexOf('#Requires -Version 5.1');
  let f12_start = foundContent.indexOf('[CmdletBinding(SupportsShouldProcess = $true)]');
  let f11_start = foundContent.lastIndexOf('#Requires -Version 5.1');

  if (f10_start !== -1 && f12_start !== -1) {
    fs.writeFileSync('C:/Users/Mah/Documents/GitHub/PROSPECTOR-ATLAS/FASE-10.ps1', foundContent.substring(f10_start, f12_start).trim());
    console.log('FASE-10 written');
  }
  if (f12_start !== -1 && f11_start !== -1) {
    fs.writeFileSync('C:/Users/Mah/Documents/GitHub/PROSPECTOR-ATLAS/FASE-12.ps1', foundContent.substring(f12_start, f11_start).trim());
    console.log('FASE-12 written');
  }
  if (f11_start !== -1 && f11_start !== f10_start) {
    fs.writeFileSync('C:/Users/Mah/Documents/GitHub/PROSPECTOR-ATLAS/FASE-11.ps1', foundContent.substring(f11_start).trim());
    console.log('FASE-11 written');
  }
});
