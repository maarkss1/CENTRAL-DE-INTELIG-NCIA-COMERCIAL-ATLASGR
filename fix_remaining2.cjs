const fs = require('fs');

function replaceInFile(filePath, search, replace) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.split(search).join(replace);
    fs.writeFileSync(filePath, content);
}

function regexReplaceInFile(filePath, regex, replace) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(regex, replace);
    fs.writeFileSync(filePath, content);
}

// learning.agent.ts (actorId is missing because the function signature used userId)
// Ah! In learning.agent.ts we had `reflectAndLearn(userId: string, tenantId: string)`!
// We need to change that to actorId or use userId.
replaceInFile('src/features/intelligence/agents/learning.agent.ts', 'reflectAndLearn(userId: string, tenantId: string)', 'reflectAndLearn(actorId: string, tenantId: string)');
replaceInFile('src/features/intelligence/agents/learning.agent.ts', '{ userId, tenantId }', '{ actorId, tenantId }');

// sdr.agent.ts Duplicate BaseMessage
// line 6 has `import { BaseMessage, HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';`
// Let's clean it up specifically.
regexReplaceInFile('src/features/intelligence/agents/sdr.agent.ts', /import \{ BaseMessage, HumanMessage, SystemMessage, BaseMessage \} from '@langchain\/core\/messages';/g, "import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';");

// supervisor.agent.ts(111,33): Element implicitly has an 'any' type...
// `agentState[agentName as string]` -> `agentState[agentName as keyof typeof agentState]`
regexReplaceInFile('src/features/intelligence/agents/supervisor.agent.ts', /agentState\[agentName as string\]/g, 'agentState[agentName as keyof typeof agentState]');

// agent.routes.ts(154,61): 'err' is of type 'unknown'
// In try catch
// (err as Error).message
regexReplaceInFile('src/features/intelligence/routes/agent.routes.ts', /err\.message/g, '(err as Error).message');

// prompt.routes.ts: Expected 2-3 arguments, but got 1. (Line 25 and 56)
// Let's see what is there
