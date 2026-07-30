import { SwarmOrchestrator } from '../src/features/intelligence/agents/supervisor.agent.js';
import dotenv from 'dotenv';

dotenv.config();

async function runSimulation() {
    console.log("==========================================");
    console.log("🐝 INICIANDO SIMULAÇÃO DO ENXAME (SWARM) 🐝");
    console.log("==========================================\n");

    const swarm = new SwarmOrchestrator();
    
    // Um cenário complexo para a IA decidir o que fazer
    const mission = `Acabei de importar um lead da empresa "TransLogística Express" (ID: 999123).
Eles têm frota de 50 caminhões e faturamento alto, mas não sei como abordá-los e precisamos qualificar o risco e sugerir um quebra-gelo B2B.`;

    console.log(`👤 USUÁRIO: "${mission}"\n`);
    console.log("🔄 SUPERVISOR: Analisando missão e invocando agentes...\n");

    try {
        const messages = await swarm.executeMission(mission, 'simulation-123');
        
        console.log("==========================================");
        console.log("📜 TRILHA DE EXECUÇÃO DOS AGENTES");
        console.log("==========================================");

        messages.forEach((m: any, i: number) => {
            const role = m._getType().toUpperCase();
            const content = m.content;
            
            // Highlight the routing and sub-agent results
            if (content.includes('[ROUTING]')) {
                console.log(`\n👑 SUPERVISOR DECIDIU:`);
                console.log(`   ${content}`);
            } else if (content.includes('[SDR Result]') || content.includes('[BDR Result]') || content.includes('[CRM Result]')) {
                console.log(`\n🤖 AGENTE ESPECIALISTA RETORNOU:`);
                console.log(`   ${content}`);
            } else {
                if (i === 0) return; // Skip user message
                console.log(`\n💬 Mensagem [${role}]:\n   ${content}`);
            }
        });

        console.log("\n✅ SIMULAÇÃO CONCLUÍDA.");
    } catch (error) {
        console.error("❌ ERRO NA SIMULAÇÃO:", error);
    }
}

runSimulation();
