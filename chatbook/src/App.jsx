import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import './App.css';

import Setup from './components/Setup';
import Chat from './components/Chat';
import Analysis from './components/Analysis';

function App() {
  const [currentScreen, setCurrentScreen] = useState('setup'); // setup, chat, analysis
  const [simConfig, setSimConfig] = useState(null);
  const [simResults, setSimResults] = useState(null);

  const handleStartSimulation = (config) => {
    setSimConfig(config);
    setCurrentScreen('chat');
  };

  const handleFinishSimulation = (results) => {
    setSimResults(results);
    setCurrentScreen('analysis');
  };

  const handleRestart = () => {
    setSimConfig(null);
    setSimResults(null);
    setCurrentScreen('setup');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo">
          <BookOpen className="logo-icon" size={28} />
          <span>Chatbook</span>
        </div>
        <div className="nav-actions">
           {currentScreen !== 'setup' && (
             <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={handleRestart}>
               Sair da Simulação
             </button>
           )}
        </div>
      </nav>

      <main className="main-content">
        {currentScreen === 'setup' && <Setup onStart={handleStartSimulation} />}
        {currentScreen === 'chat' && <Chat config={simConfig} onFinish={handleFinishSimulation} />}
        {currentScreen === 'analysis' && <Analysis results={simResults} onRestart={handleRestart} />}
      </main>
    </div>
  );
}

export default App;
