const fs = require('fs');

const transcriptPath = 'C:\\Users\\Mah\\.gemini\\antigravity\\brain\\614eae9f-6d6b-4451-8137-161d310a4c70\\.system_generated\\logs\\transcript_full.jsonl';

const fileContent = fs.readFileSync(transcriptPath, 'utf8');

let extractedScripts = [];
fileContent.split('\n').forEach(line => {
  try {
    const data = JSON.parse(line);
    const searchObj = (obj) => {
      if (typeof obj === 'string') {
        if (obj.includes('#Requires -Version 5.1')) {
          extractedScripts.push(obj);
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

console.log('Found strings with the script:', extractedScripts.length);

// Sort by length so we process the most complete accumulations first
extractedScripts.sort((a, b) => b.length - a.length);

let scriptCount = 0;
// We just need to extract ALL unique scripts.
// The string might contain one or multiple scripts.
const scriptSet = new Set();

extractedScripts.forEach(text => {
    const parts = text.split('#Requires -Version 5.1');
    for (let i = 1; i < parts.length; i++) {
        const fullScript = '#Requires -Version 5.1' + parts[i];
        // We might have trailing HTML or XML tags from the prompt format, like `</USER_REQUEST>`, but the powershell script usually runs fine if we just let it be, or we can trim it.
        // Let's just find where the script ends. It usually ends with `exit 0` or similar, or we can just cut off at `<` since the XML tags follow it.
        const cleanedScript = fullScript.split(/<(?!\#)/)[0].trim() + '\n';
        
        if (!scriptSet.has(cleanedScript)) {
            scriptSet.add(cleanedScript);
            scriptCount++;
            
            // Try to extract Phase number from script to name it
            const match = cleanedScript.match(/FASE (\d+)/i);
            const num = match ? match[1] : scriptCount;
            const name = `FASE-${num}.ps1`;
            
            fs.writeFileSync(`C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\${name}`, cleanedScript);
            console.log(`Written ${name}`);
        }
    }
});
