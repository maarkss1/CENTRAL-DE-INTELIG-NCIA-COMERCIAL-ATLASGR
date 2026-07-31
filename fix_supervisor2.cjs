const fs = require('fs');
let content = fs.readFileSync('src/features/intelligence/agents/supervisor.agent.ts', 'utf8');
content = content.replace(/if \(nodeName && chunk\[nodeName as keyof typeof chunk\] && chunk\[nodeName as keyof typeof chunk\]\.messages\) \{/g, 'const nodeData = chunk[nodeName as keyof typeof chunk];\n                if (nodeName && nodeData && nodeData.messages) {');
content = content.replace(/const msgs = chunk\[nodeName as keyof typeof chunk\]\.messages;/g, 'const msgs = nodeData.messages;');
fs.writeFileSync('src/features/intelligence/agents/supervisor.agent.ts', content);
