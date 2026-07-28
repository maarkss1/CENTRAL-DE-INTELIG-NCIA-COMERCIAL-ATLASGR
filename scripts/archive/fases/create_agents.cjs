const fs = require('fs');
const path = require('path');

const agents = [
  { dir: 'researcher', id: 'research-agent', name: 'Research Agent', desc: 'Análise de empresas e contexto de mercado.' },
  { dir: 'icp', id: 'icp-agent', name: 'ICP Agent', desc: 'Cálculo de ICP e ajuste de pesos.' },
  { dir: 'cadence', id: 'cadence-agent', name: 'Cadence Agent', desc: 'Seleção e acompanhamento de cadências.' },
  { dir: 'crm', id: 'crm-assistant', name: 'CRM Assistant Agent', desc: 'Atualização e limpeza de dados do CRM.' },
  { dir: 'analytics', id: 'analytics-agent', name: 'Analytics Agent', desc: 'Observação de tendências e relatórios.' },
  { dir: 'manager', id: 'sales-manager', name: 'Sales Manager Agent', desc: 'Monitora SLAs e distribui Leads.' },
  { dir: 'director', id: 'revenue-director', name: 'Revenue Director Agent', desc: 'Visão executiva e estratégica.' }
];

agents.forEach(a => {
  const code = `import { AgentSDK } from '../../agent-runtime/sdk/index.js';

AgentSDK.createAgent({
  id: '${a.id}',
  name: '${a.name}',
  description: '${a.desc}',
  version: '1.0.0',
  supportedTools: ['LeadTool', 'ActivityTool'],
  memoryType: 'persistent',
  permissions: ['read:all'],
  listensTo: ['SystemTick'],
  publishesTo: ['StatusUpdated']
});
`;
  fs.writeFileSync(path.join(__dirname, 'server', 'agents', a.dir, 'index.ts'), code);
});
