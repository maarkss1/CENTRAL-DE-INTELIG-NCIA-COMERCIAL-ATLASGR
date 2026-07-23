with open("src/features/dashboard/components/Dashboard.tsx", "r") as f:
    content = f.read()

content = content.replace(", IconCpu, IconDatabase, IconFlame, IconSliders, IconCalendar, IconDollar, IconWrench, IconLandmark, IconUserPlus, IconClipboard, IconChat, IconBot}", "  IconCpu, IconDatabase, IconFlame, IconSliders, IconCalendar, IconDollar, IconWrench, IconLandmark, IconUserPlus, IconClipboard, IconChat, IconBot\n}")

with open("src/features/dashboard/components/Dashboard.tsx", "w") as f:
    f.write(content)
