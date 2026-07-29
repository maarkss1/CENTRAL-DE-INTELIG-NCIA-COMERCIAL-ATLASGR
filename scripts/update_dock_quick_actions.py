import re

filepath = r"c:\GitHub\PROSPECTOR-ATLASGR\src\features\intelligence\components\AIDockWidget.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Define QUICK_ACTIONS at the top
quick_actions_code = """
const QUICK_ACTIONS: Record<string, string[]> = {
  copilot: ["Gerar e-mail frio para Diretoria", "Sugerir cadência de follow-up", "Criar pitch elevator de 30s"],
  groq: ["Análise de concorrentes locais", "Resuma os dados do cliente", "Melhorar tom de voz do e-mail"],
  objections: ["Tá muito caro", "Já temos contrato com fornecedor", "A matriz não deixa trocar", "Não temos tempo para implantação"],
  qualification: ["Gerar script BANT completo", "Gerar perguntas SPIN", "Quais as dores clássicas desse segmento?"],
  playbook: ["Regras de ICP de Logística", "O que a GR aprova/reprova?", "Níveis de maturidade do cliente"]
};
"""
if "QUICK_ACTIONS" not in content:
    content = content.replace(
        "export function AIDockWidget() {",
        quick_actions_code + "\nexport function AIDockWidget() {"
    )

# 2. Refactor handleSend to sendMessage
handle_send_regex = r"const handleSend = async \(e: React\.FormEvent\) => \{.*?(?=const tools = \[)"
# We need a robust extraction.
# The original handleSend starts with `const handleSend = async (e: React.FormEvent) => {` and ends before `const tools = [`.

old_handle_send = """  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTool || !inputs[activeTool].trim() || isLoading) return;

    const userText = inputs[activeTool];
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    
    // Atualiza estado local
    setMessages(prev => ({
        ...prev,
        [activeTool]: [...(prev[activeTool] || []), userMsg]
    }));
    
    setInputs(prev => ({ ...prev, [activeTool]: '' }));
    setIsLoading(true);

    try {
        // Mapeia ferramenta para endpoint
        let endpoint = '/api/agent/chat';
        if (activeTool === 'groq') endpoint = '/api/agent/groq';
        if (activeTool === 'roleplay') endpoint = '/api/agent/roleplay';
        if (activeTool === 'qualification') endpoint = '/api/agent/qualification';
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                message: userText,
                tool: activeTool,
                history: (messages[activeTool] || []).slice(-10).map((message) => ({
                    role: message.role === 'agent' ? 'assistant' : 'user',
                    content: message.content,
                })),
            })
        });
        const data = await res.json();

        const replyText = res.ok && data.success
            ? data.reply
            : data.error || 'Não foi possível processar a solicitação.';
        
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: replyText }]
        }));
    } catch {
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: 'Não foi possível conectar ao motor de IA. Tente novamente.' }]
        }));
    } finally {
        setIsLoading(false);
    }
  };"""

new_send_message = """  const sendMessage = async (text: string) => {
    if (!activeTool || !text.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    
    setMessages(prev => ({
        ...prev,
        [activeTool]: [...(prev[activeTool] || []), userMsg]
    }));
    
    setInputs(prev => ({ ...prev, [activeTool]: '' }));
    setIsLoading(true);

    try {
        let endpoint = '/api/agent/chat';
        if (activeTool === 'groq') endpoint = '/api/agent/groq';
        if (activeTool === 'roleplay') endpoint = '/api/agent/roleplay';
        if (activeTool === 'qualification') endpoint = '/api/agent/qualification';
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                message: text,
                tool: activeTool,
                history: (messages[activeTool] || []).slice(-10).map((message) => ({
                    role: message.role === 'agent' ? 'assistant' : 'user',
                    content: message.content,
                })),
            })
        });
        const data = await res.json();

        const replyText = res.ok && data.success
            ? data.reply
            : data.error || 'Não foi possível processar a solicitação.';
        
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: replyText }]
        }));
    } catch {
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: 'Não foi possível conectar ao motor de IA. Tente novamente.' }]
        }));
    } finally {
        setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTool && inputs[activeTool]) {
       await sendMessage(inputs[activeTool]);
    }
  };"""

content = content.replace(old_handle_send, new_send_message)

# 3. Modify UI to render quick actions
old_map = """              {messages[activeTool]?.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : `${activeToolData.color} bg-opacity-20 text-white`}`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : activeToolData.icon}
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-gray-200 rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}"""

new_map = """              {messages[activeTool]?.map((msg, idx) => (
                <div key={msg.id} className="flex flex-col gap-2">
                    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : `${activeToolData.color} bg-opacity-20 text-white`}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : activeToolData.icon}
                      </div>
                      <div className={`p-3 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-gray-200 rounded-tl-none'}`}>
                        {msg.content}
                      </div>
                    </div>
                    {/* Render Quick Actions */}
                    {idx === 0 && messages[activeTool].length === 1 && QUICK_ACTIONS[activeTool] && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                            {QUICK_ACTIONS[activeTool].map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(action)}
                                    className={`text-[10px] font-semibold border ${activeToolData.color.replace('bg-', 'border-').replace('500', '400')} ${activeToolData.color.replace('bg-', 'text-').replace('500', '400')} bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-full transition-colors text-left`}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              ))}"""

content = content.replace(old_map, new_map)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated AIDockWidget.tsx with Quick Actions!")
