const fs = require('fs');
const readline = require('readline');
const path = 'C:/Users/Mah/.gemini/antigravity/brain/a605d77e-c5ad-42a6-b52d-9d4753fcd17b/.system_generated/logs/transcript_full.jsonl';
const fileStream = fs.createReadStream(path);
const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

let found = false;
rl.on('line', (line) => {
    if (line.includes('"USER_INPUT"') && line.includes('implemente todos')) {
        const data = JSON.parse(line);
        const content = data.content;
        const fase12Index = content.indexOf('FASE-12.ps1');
        if (fase12Index !== -1) {
            let start = content.indexOf('#Requires', fase12Index);
            let end = content.indexOf('FASE-13.ps1', start);
            if (end === -1) end = content.length;
            let script = content.substring(start, end).trim();
            fs.writeFileSync('FASE-12-extracted.ps1', script);
            console.log('Saved FASE-12-extracted.ps1, length:', script.length);
        }
    }
});
