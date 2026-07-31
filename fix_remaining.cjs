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

// learning.agent.ts (restore original values so tests pass if schema didn't change)
// Actually we need to check the schema to see what's correct.
// The errors state:
// 'toolKey_tenantId' does not exist in type 'AiEngineSettingWhereUniqueInput'
// 'tenantId' does not exist in type 'AiEngineSettingCreateInput'
// 'config' does not exist in type 'AiEngineSettingUpdateInput'
// So the schema expects organizationId and systemPrompt!
// Let's restore those in learning.agent.ts, but fix the first 'userId' error.
// "userId does not exist in AuditLogWhereInput" => schema has actorId for AuditLog.

regexReplaceInFile('src/features/intelligence/agents/learning.agent.ts', /where: \{ actorId: actorId, tenantId: tenantId \},/g, "where: { actorId: actorId, tenantId: tenantId },");
replaceInFile('src/features/intelligence/agents/learning.agent.ts', "where: { actorId: actorId, tenantId: tenantId },", "where: { actorId: actorId, tenantId: tenantId },");
replaceInFile('src/features/intelligence/agents/learning.agent.ts', "actorId: string, tenantId: string", "actorId: string, tenantId: string");

// Wait, the first error was: "userId does not exist in AuditLogWhereInput" and "organizationId".
// Let's look at schema for AuditLog.
