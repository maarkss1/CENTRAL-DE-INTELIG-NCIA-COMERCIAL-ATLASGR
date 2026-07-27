import { BarChart3, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export default function Analysis({ results, onRestart }) {
  
  // Calculate Scores
  const bantCriteria = ['Budget', 'Authority', 'Need', 'Timeline'];
  const qualsGot = results.qualifications || [];
  
  const objEnc = results.objections?.encountered || [];
  const objHand = results.objections?.handled || [];
  
  const qualScore = (qualsGot.length / bantCriteria.length) * 100;
  const objScore = objEnc.length > 0 ? (objHand.length / objEnc.length) * 100 : 100;
  
  const finalScore = Math.round((qualScore + objScore) / 2);
  
  const getScoreClass = (score) => {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  };

  return (
    <div className="analysis-container">
      <div className="analysis-header">
        <h1 style={{ marginBottom: '0.5rem' }}>Análise da Simulação</h1>
        <p>Confira seu desempenho nesta sessão de role-play</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Score de Desempenho Global</h3>
        <div className={`score-circle ${getScoreClass(finalScore)} animate-fade-in`}>
          {finalScore}
        </div>
        <p style={{ textAlign: 'center', maxWidth: '600px', color: 'var(--text-muted)' }}>
          {finalScore >= 80 ? 'Excelente abordagem! Você soube qualificar o lead e contornou as objeções com maestria.' :
           finalScore >= 50 ? 'Bom trabalho, mas há espaço para melhoria. Tente aprofundar mais nas necessidades do cliente.' :
           'Sua abordagem precisa de ajustes. Foco em não rebater objeções diretamente e em qualificar melhor o perfil.'}
        </p>
      </div>

      <div className="analysis-grid">
        {/* Matriz de Qualificação */}
        <div className="matrix-card animate-fade-in animate-delay-1">
          <div className="matrix-header">
            <BarChart3 size={20} color="var(--primary)" />
            Matriz de Qualificação (BANT)
          </div>
          <div className="matrix-list">
            {bantCriteria.map(crit => {
              const achieved = qualsGot.includes(crit);
              return (
                <div key={crit} className="matrix-item">
                  <div className="matrix-item-info">
                    <span className="matrix-item-title">{crit}</span>
                    <span className="matrix-item-desc">
                      {crit === 'Budget' && 'Identificou orçamento'}
                      {crit === 'Authority' && 'Mapeou os decisores'}
                      {crit === 'Need' && 'Extraiu as dores reais'}
                      {crit === 'Timeline' && 'Definiu urgência/prazo'}
                    </span>
                  </div>
                  <div className={`badge ${achieved ? 'success' : 'error'}`}>
                    {achieved ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Matriz de Objeções */}
        <div className="matrix-card animate-fade-in animate-delay-2">
          <div className="matrix-header">
            <AlertCircle size={20} color="var(--warning)" />
            Matriz de Objeções
          </div>
          <div className="matrix-list">
            {objEnc.map(obj => {
              const handled = objHand.includes(obj);
              return (
                <div key={obj} className="matrix-item">
                  <div className="matrix-item-info">
                    <span className="matrix-item-title" style={{ textTransform: 'capitalize' }}>Objeção de {obj}</span>
                    <span className="matrix-item-desc">
                      {handled ? 'Contornada com sucesso' : 'Não foi resolvida adequadamente'}
                    </span>
                  </div>
                  <div className={`badge ${handled ? 'success' : 'error'}`}>
                    {handled ? 'Resolvido' : 'Falhou'}
                  </div>
                </div>
              );
            })}
            {objEnc.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhuma objeção levantada na simulação.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={onRestart} style={{ padding: '1rem 2rem' }}>
          <RefreshCw size={20} /> Nova Simulação
        </button>
      </div>
    </div>
  );
}
