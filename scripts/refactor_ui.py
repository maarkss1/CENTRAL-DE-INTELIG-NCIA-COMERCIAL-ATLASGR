import re
import os

# 1. Update AIDockWidget.tsx
dock_path = os.path.join("src", "features", "intelligence", "components", "AIDockWidget.tsx")
with open(dock_path, 'r', encoding='utf-8') as f:
    dock_content = f.read()

# Remove roleplay from tools
# { id: 'roleplay', icon: <User className="w-5 h-5" />, label: 'Roleplay', color: 'bg-fuchsia-500' },
dock_content = re.sub(r"\{\s*id:\s*'roleplay'.*?\},?\s*", "", dock_content)
# Remove roleplay import
dock_content = re.sub(r"import\s*\{\s*VoiceRoleplay\s*\}\s*from\s*'./VoiceRoleplay';\s*", "", dock_content)
# Remove voice roleplay condition in AnimatePresence
# {activeTool === 'roleplay' && roleplayMode === 'voice' ? ( ... ) : ( <> ... </> )}
# This is a bit tricky to regex, let's just do a string replacement for the exact structure or simpler regex
# Actually, the activeTool === 'roleplay' block is inside a motion.div
# I will use a robust python regex to extract and replace the roleplay condition.
# But it's easier to just use the multi_replace_file_content tool directly for AIDockWidget.tsx if needed. Let's do it here:

# Quick patch for AIDockWidget
old_roleplay_render = """            {activeTool === 'roleplay' && roleplayMode === 'voice' ? (
                <VoiceRoleplay 
                    onClose={() => setActiveTool(null)} 
                    onSwitchToText={() => setRoleplayMode('text')} 
                />
            ) : (
                <>"""

new_roleplay_render = """            {
                <>"""

dock_content = dock_content.replace(old_roleplay_render, new_roleplay_render)
dock_content = dock_content.replace("</>\n            )}", "")

# Also remove the text switch button
text_btn = """                {activeTool === 'roleplay' && roleplayMode === 'text' && (
                    <button onClick={() => setRoleplayMode('voice')} className="text-[10px] uppercase font-bold text-white/80 hover:text-white transition-colors">Modo Voz</button>
                )}"""
dock_content = dock_content.replace(text_btn, "")

with open(dock_path, 'w', encoding='utf-8') as f:
    f.write(dock_content)


# 2. Update SinglePageDashboard.tsx
dash_path = os.path.join("src", "features", "dashboard", "components", "SinglePageDashboard.tsx")
with open(dash_path, 'r', encoding='utf-8') as f:
    dash_content = f.read()

# Import VoiceRoleplay
if "import { VoiceRoleplay }" not in dash_content:
    dash_content = dash_content.replace(
        "import { AiToolBuilder }",
        "import { VoiceRoleplay } from '../../intelligence/components/VoiceRoleplay';\nimport { AiToolBuilder }"
    )

# Change rendering of roleplay
old_roleplay_active = "{activeTool === 'roleplay' && <ChatbookHub />}"
new_roleplay_active = "{activeTool === 'roleplay' && <div className=\"h-[600px] max-w-4xl mx-auto w-full\"><VoiceRoleplay onClose={handleGoBack} onSwitchToText={() => {}} /></div>}"
dash_content = dash_content.replace(old_roleplay_active, new_roleplay_active)

# Decrease card sizes and paddings
# For main company cards: min-h-[480px] -> min-h-[360px]
dash_content = dash_content.replace("min-h-[480px]", "min-h-[360px]")
# For company cards padding: p-10 md:p-12 -> p-8 md:p-10
dash_content = dash_content.replace("p-10 md:p-12", "p-8 md:p-10")

# For AppleToolCard padding and min height
# p-6 md:p-8 -> p-5 md:p-6
# min-h-[280px] -> min-h-[220px]
dash_content = dash_content.replace("p-6 md:p-8", "p-5 md:p-6")
dash_content = dash_content.replace("min-h-[280px]", "min-h-[220px]")

# For AppleToolCard h3 and icon size
# h-8 -> h-6, w-8 -> w-6 in tool cards: We can't globally replace w-8 h-8 because it might affect other things.
# I'll just change the icon container in AppleToolCard
icon_container_old = "[&_svg]:w-7 [&_svg]:h-7"
icon_container_new = "[&_svg]:w-6 [&_svg]:h-6"
dash_content = dash_content.replace(icon_container_old, icon_container_new)
dash_content = dash_content.replace("text-lg md:text-xl", "text-base md:text-lg")

with open(dash_path, 'w', encoding='utf-8') as f:
    f.write(dash_content)

print("UI refactor applied.")
