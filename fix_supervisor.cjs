const fs = require('fs');

let content = fs.readFileSync('src/features/intelligence/agents/supervisor.agent.ts', 'utf8');
content = content.replace(/chunk\[nodeName\]/g, 'chunk[nodeName as keyof typeof chunk]');
fs.writeFileSync('src/features/intelligence/agents/supervisor.agent.ts', content);
