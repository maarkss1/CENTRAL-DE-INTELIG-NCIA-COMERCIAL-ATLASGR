import re

filepath = r"c:\GitHub\PROSPECTOR-ATLASGR\src\features\intelligence\components\AIDockWidget.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
if 'VoiceRoleplay' not in content:
    content = content.replace(
        "import { Bot, Zap, MessageSquareWarning, Target, FileText, Settings, X, Send, User } from 'lucide-react';",
        "import { Bot, Zap, MessageSquareWarning, Target, FileText, Settings, X, Send, User } from 'lucide-react';\nimport { VoiceRoleplay } from './VoiceRoleplay';"
    )

# 2. Add roleplayMode state
if 'roleplayMode' not in content:
    content = content.replace(
        "const [isDockExpanded, setIsDockExpanded] = useState(false);",
        "const [isDockExpanded, setIsDockExpanded] = useState(false);\n  const [roleplayMode, setRoleplayMode] = useState<'voice'|'text'>('voice');"
    )

# 3. Modify initial text for qualification
content = content.replace(
    "qualification: [{ id: '5', role: 'agent', content: 'Cole o resumo da conversa e extrairei os dados BANT.' }],",
    "qualification: [{ id: '5', role: 'agent', content: 'Informe o segmento ou empresa que você vai ligar e gerarei as melhores perguntas BANT/SPIN.' }],"
)

# 4. Modify the render. If activeTool === 'roleplay' && roleplayMode === 'voice', render VoiceRoleplay instead of the normal window.
render_injection = """
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-96 h-[500px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col z-50 overflow-hidden"
          >
            {activeTool === 'roleplay' && roleplayMode === 'voice' ? (
                <VoiceRoleplay 
                    onClose={() => setActiveTool(null)} 
                    onSwitchToText={() => setRoleplayMode('text')} 
                />
            ) : (
                <>
"""

# We need to replace the start of the motion.div inside AnimatePresence up to the Header comment, and close the fragment after the Input form.
# The original code:
#           <motion.div
#             initial={{ opacity: 0, y: 20, scale: 0.95 }}
#             animate={{ opacity: 1, y: 0, scale: 1 }}
#             exit={{ opacity: 0, y: 20, scale: 0.95 }}
#             className="fixed bottom-24 right-6 w-96 h-[500px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col z-50 overflow-hidden"
#           >
#             {/* Header */}

# and at the end of the form:
#             </div>
#           </motion.div>

content = re.sub(
    r'<motion\.div\s+initial=\{\{ opacity: 0, y: 20, scale: 0\.95 \}\}\s+animate=\{\{ opacity: 1, y: 0, scale: 1 \}\}\s+exit=\{\{ opacity: 0, y: 20, scale: 0\.95 \}\}\s+className="fixed bottom-24 right-6 w-96 h-\[500px\] max-h-\[70vh\] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col z-50 overflow-hidden"\s+>\s+\{\/\* Header \*\/\}',
    render_injection + "            {/* Header */}",
    content
)

# If it's roleplay mode 'text', add a button to switch back to 'voice' in the header.
# Original:
#               <button onClick={() => setActiveTool(null)} className="text-white/80 hover:text-white transition-colors">
#                 <X className="w-5 h-5" />
#               </button>
switch_voice_btn = """
              <div className="flex items-center gap-3">
                {activeTool === 'roleplay' && roleplayMode === 'text' && (
                    <button onClick={() => setRoleplayMode('voice')} className="text-[10px] uppercase font-bold text-white/80 hover:text-white transition-colors">Modo Voz</button>
                )}
                <button onClick={() => setActiveTool(null)} className="text-white/80 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
              </div>
"""

content = re.sub(
    r'<button onClick=\{\(\) => setActiveTool\(null\)\} className="text-white/80 hover:text-white transition-colors">\s*<X className="w-5 h-5" />\s*</button>',
    switch_voice_btn,
    content
)

# And close the fragment at the end of motion.div
content = re.sub(
    r'</form>\s*</div>\s*</motion\.div>',
    r'</form>\n            </div>\n            </>\n            )}\n          </motion.div>',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated AIDockWidget.tsx")
