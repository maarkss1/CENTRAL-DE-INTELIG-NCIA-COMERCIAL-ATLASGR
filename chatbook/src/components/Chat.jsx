import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Flag } from 'lucide-react';

export default function Chat({ config, onFinish }) {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'bot', text: 'Olá. Vi que vocês solicitaram uma reunião. O que exatamente vocês oferecem e por que eu deveria me importar?', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Track metrics for analysis
  const [objectionsEncountered, setObjectionsEncountered] = useState(['preco', 'tempo']);
  const [objectionsHandled, setObjectionsHandled] = useState([]);
  const [qualificationsGained, setQualificationsGained] = useState([]);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: inputValue,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);
    
    // Simulate simple AI response (Mock Engine)
    setTimeout(() => {
      analyzeUserInput(userMsg.text);
      setIsTyping(false);
    }, 1500 + Math.random() * 1000);
  };

  const analyzeUserInput = (text) => {
    const lowerText = text.toLowerCase();
    let botResponse = '';
    
    // Simple rule-based mock engine
    if (lowerText.includes('orçamento') || lowerText.includes('valor') || lowerText.includes('preço')) {
      botResponse = 'Nós temos um budget apertado este trimestre. Quanto isso vai custar?';
      if (!qualificationsGained.includes('Budget')) {
        setQualificationsGained(prev => [...prev, 'Budget']);
      }
    } 
    else if (lowerText.includes('decisão') || lowerText.includes('quem mais') || lowerText.includes('diretor')) {
      botResponse = 'Eu sou o diretor de TI, mas a decisão final passa pelo CFO.';
      if (!qualificationsGained.includes('Authority')) {
        setQualificationsGained(prev => [...prev, 'Authority']);
      }
    }
    else if (lowerText.includes('dor') || lowerText.includes('problema') || lowerText.includes('desafio')) {
      botResponse = 'Nosso maior problema hoje é a lentidão do sistema legado.';
      if (!qualificationsGained.includes('Need')) {
        setQualificationsGained(prev => [...prev, 'Need']);
      }
    }
    else if (lowerText.includes('entender') || lowerText.includes('explicar') || lowerText.includes('sentido')) {
      if (lowerText.includes('caro') || lowerText.includes('custo') || lowerText.includes('valor')) {
          if(!objectionsHandled.includes('preco')) setObjectionsHandled(prev => [...prev, 'preco']);
          botResponse = 'Entendo seu ponto sobre o retorno do investimento. Parece interessante, mas ainda precisamos ver na prática.';
      } else {
         botResponse = 'Faz sentido. Pode me dar mais detalhes de como a implementação funciona? Não temos muito tempo livre da equipe técnica.';
         if(!objectionsHandled.includes('tempo')) setObjectionsHandled(prev => [...prev, 'tempo']);
      }
    }
    else {
      botResponse = 'Certo, mas ainda não vejo como isso se encaixa na nossa operação. Pode ser mais específico?';
    }

    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'bot',
      text: botResponse,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    }]);
  };

  const handleFinish = () => {
    onFinish({
      messagesCount: messages.length,
      qualifications: qualificationsGained,
      objections: {
        encountered: objectionsEncountered,
        handled: objectionsHandled
      }
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container animate-fade-in">
      <div className="chat-header">
        <div className="chat-persona">
          <div className="persona-avatar">
            <Bot size={24} />
          </div>
          <div className="persona-info">
            <h3>{config.persona === 'tech_buyer' ? 'Tech Buyer' : config.persona === 'executivo' ? 'C-Level Executivo' : 'Dono de PME'}</h3>
            <p>Dificuldade: {config.difficulty}</p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleFinish} style={{ padding: '0.5rem 1rem' }}>
          <Flag size={16} /> Finalizar Simulação
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className="message-bubble">
              {msg.text}
              <div className="message-time">{msg.time}</div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="message-wrapper bot">
            <div className="message-bubble" style={{ padding: '0.5rem 1rem' }}>
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea 
          placeholder="Digite sua mensagem (Pressione Enter para enviar)..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={isTyping}
        />
        <button 
          className="btn-send" 
          onClick={handleSend}
          disabled={!inputValue.trim() || isTyping}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}
