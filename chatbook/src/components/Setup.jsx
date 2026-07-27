import { useState } from 'react';
import { Target, Users, Zap, Briefcase } from 'lucide-react';

export default function Setup({ onStart }) {
  const [selectedPersona, setSelectedPersona] = useState('tech_buyer');
  const [difficulty, setDifficulty] = useState('medium');

  const personas = [
    { id: 'tech_buyer', title: 'Tech Buyer B2B', icon: <Zap className="option-icon" size={24} />, desc: 'Focado em ROI e segurança' },
    { id: 'executivo', title: 'C-Level Executivo', icon: <Briefcase className="option-icon" size={24} />, desc: 'Pouco tempo, focado em estratégia' },
    { id: 'pequeno_negocio', title: 'Dono de PME', icon: <Users className="option-icon" size={24} />, desc: 'Preocupado com preço e suporte' }
  ];

  const handleStart = () => {
    onStart({ persona: selectedPersona, difficulty });
  };

  return (
    <div className="setup-screen animate-fade-in">
      <div className="setup-header">
        <h1>Nova Simulação</h1>
        <p>Configure o cenário do seu role-play de vendas</p>
      </div>
      
      <div className="card setup-form">
        <div className="input-group">
          <label className="input-label">Perfil do Cliente Ideal (Persona)</label>
          <div className="options-grid">
            {personas.map(p => (
              <div 
                key={p.id}
                className={`option-card ${selectedPersona === p.id ? 'selected' : ''}`}
                onClick={() => setSelectedPersona(p.id)}
              >
                {p.icon}
                <div style={{ fontWeight: 500, marginTop: '0.5rem', fontSize: '0.9rem' }}>{p.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Nível de Dificuldade</label>
          <select 
            className="input-field" 
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="easy">Fácil (Mais receptivo)</option>
            <option value="medium">Médio (Objeções comuns)</option>
            <option value="hard">Difícil (Cético e resistente)</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleStart} style={{ marginTop: '1rem', padding: '1rem' }}>
          <Target size={20} /> Iniciar Simulação
        </button>
      </div>
    </div>
  );
}
