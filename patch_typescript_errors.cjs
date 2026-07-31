const fs = require('fs');

function patchFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const [search, replace] of replacements) {
        if (typeof search === 'string') {
            content = content.split(search).join(replace);
        } else {
            content = content.replace(search, replace);
        }
    }
    fs.writeFileSync(filePath, content);
}

// 1. Fix Duplicate BaseMessage in agents
const agentFiles = [
    'src/features/intelligence/agents/bdr.agent.ts',
    'src/features/intelligence/agents/crm.agent.ts',
    'src/features/intelligence/agents/sdr.agent.ts'
];

for (const file of agentFiles) {
    try {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/import { BaseMessage, ([^}]+) } from '@langchain\/langgraph';/g, "import { $1 } from '@langchain/langgraph';");
        content = content.replace(/import { BaseMessage, SystemMessage, HumanMessage, BaseMessage }/g, "import { BaseMessage, SystemMessage, HumanMessage }");
        content = content.replace(/import { BaseMessage, SystemMessage, HumanMessage }/g, "import { BaseMessage, SystemMessage, HumanMessage }");
        content = content.replace(/import { BaseMessage, (getAiModel.*?) } from '\.\.\/\.\.\/\.\.\/lib\/ai\/gateway\.js';/g, "import { $1 } from '../../../lib/ai/gateway.js';");
        content = content.replace(/import { BaseMessage, (prisma) } from '\.\.\/\.\.\/\.\.\/lib\/prisma\.js';/g, "import { $1 } from '../../../lib/prisma.js';");
        content = content.replace(/import { BaseMessage, (logger) } from '\.\.\/\.\.\/\.\.\/lib\/logger\.js';/g, "import { $1 } from '../../../lib/logger.js';");
        content = content.replace(/import { BaseMessage, (getLeadContextTool.*?) } from '\.\.\/tools\/crmTools\.js';/g, "import { $1 } from '../tools/crmTools.js';");
        content = content.replace(/import { BaseMessage, (searchPlaybookTool) } from '\.\.\/tools\/playbookTool\.js';/g, "import { $1 } from '../tools/playbookTool.js';");
        content = content.replace(/import { BaseMessage, (ToolNode) } from '@langchain\/langgraph\/prebuilt';/g, "import { $1 } from '@langchain/langgraph/prebuilt';");
        content = content.replace(/import { BaseMessage, (ChatOpenAI) } from '@langchain\/openai';/g, "import { $1 } from '@langchain/openai';");
        content = content.replace(/import { BaseMessage, (crmTool.*?) } from '\.\.\/tools\/crmTools\.js';/g, "import { $1 } from '../tools/crmTools.js';");
        content = content.replace(/import { BaseMessage, (playbookTool) } from '\.\.\/tools\/playbookTool\.js';/g, "import { $1 } from '../tools/playbookTool.js';");
        fs.writeFileSync(file, content);
    } catch(e) {}
}

// 2. Fix Auth Unused Variables
patchFile('src/contexts/AuthContext.tsx', [
    ['const { data: session, error } = useSession();', 'const { error } = useSession();']
]);

patchFile('src/features/auth/components/SelectionScreen.tsx', [
    ['const [selectedBrand, setSelectedBrand] = useState<string | null>(null);', '']
]);

patchFile('src/features/auth/components/GoogleLoginModal.tsx', [
    ['import { useAuth } from "../../hooks/useAuth";', ''],
    ['const navigate = useNavigate();', ''],
    ['import { useNavigate } from "react-router-dom";', '']
]);

// 3. Fix DeepResearchService Unused Variable
patchFile('src/features/intelligence/services/DeepResearchService.ts', [
    ['} catch (_err) {', '} catch {'],
    ['catch (err) {', 'catch {']
]);

// 4. Fix learning.agent.ts Prisma errors
patchFile('src/features/intelligence/agents/learning.agent.ts', [
    ['where: { userId, organizationId },', 'where: { actorId: actorId, tenantId: tenantId },'],
    ['orderBy: { createdAt: \'desc\' },', 'orderBy: { timestamp: \'desc\' },'],
    ['Recurso: ${a.resource}', 'Entidade: ${a.entity}'],
    ['toolKey_organizationId: {', 'toolKey_tenantId: {'],
    ['organizationId', 'tenantId'],
    ['systemPrompt: learnedStyle,', 'config: { systemPrompt: learnedStyle },'],
    ['organizationId,', 'tenantId,']
]);

// 5. Fix prompt.routes.ts args count (prisma.prompt.findMany usually takes 1, let's see)
// Actually we will check what prompt.routes.ts has.
