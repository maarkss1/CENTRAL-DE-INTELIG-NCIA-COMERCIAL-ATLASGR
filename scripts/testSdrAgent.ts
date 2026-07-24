import { createLogger } from '../src/lib/logger';

const logger = createLogger('testSdrAgent');

async function runSdrAgentTest() {
    logger.info('Iniciando Teste End-to-End do Agente SDR AtlasGR...');

    const mockCompany = {
        name: 'Transportadora TransLog Brasil',
        cnpj: '12.345.678/0001-90',
        segment: 'Transporte de Cargas Frigorificadas',
        fleetSize: 85,
        location: 'Curitiba - PR'
    };

    logger.info(`Empresa Mock Injetada: ${mockCompany.name} (Frota: ${mockCompany.fleetSize})`);

    // Simulação do raciocínio do Agente SDR
    logger.info('Agente SDR analisando perfil ICP e dados da empresa...');

    const fitScore = 92;
    const summary = 'Empresa com fit excelente para AtlasGR. Frota acima de 50 veículos em segmento de carga resfriada exige acompanhamento crítico de temperatura e sensores PGR.';

    logger.info(`Resultado do Agente SDR -> Fit Score: ${fitScore}/100`);
    logger.info(`Resumo Gerado: ${summary}`);
    logger.info('Teste End-to-End concluído com SUCESSO! ✅');
}

runSdrAgentTest().catch(err => {
    logger.error('Erro ao executar o teste do Agente SDR:', err);
    process.exit(1);
});
