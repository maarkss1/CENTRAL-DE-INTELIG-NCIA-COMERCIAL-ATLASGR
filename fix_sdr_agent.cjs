const fs = require('fs');

let content = fs.readFileSync('src/features/intelligence/agents/sdr.agent.ts', 'utf8');

// Fix TS2532: Object is possibly 'undefined' on tool_calls.length === 0
content = content.replace(/\(lastMessage as BaseMessage & \{ tool_calls\?: unknown\[\] \}\)\.tool_calls\.length === 0/g, '((lastMessage as BaseMessage & { tool_calls?: unknown[] }).tool_calls?.length ?? 0) === 0');

fs.writeFileSync('src/features/intelligence/agents/sdr.agent.ts', content);
