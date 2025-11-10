# 🐞 Muhackl Games — Discord Bug Report Bot

A structured, user-friendly **Bug Report Bot** for your Discord community.  
Players follow a guided flow to report issues directly into your **bug forum channel** — clean, complete, and consistent.  
It’s built with the same Alpine precision and playful “🐮 Muh” tone as our Feedback Bot.

---

## 🎯 Why this bot

- 🧭 **Step-by-step bug reporting flow**
- 📎 **Optional media intake** (auto-closes after first post)
- 🧱 **Clear, formatted bug threads** in your Discord forum
- 🔒 **Locked posts** to keep reports tidy
- 🚀 **Resilient** to slow connections or Discord hiccups
- 💬 **Emoji language** for instant type/severity recognition  
  _(critical = 🔺🔴, minor = 🟢, cosmetic = 🦢 …)_

> 🏔️ _Goal:_ clean, readable, consistent reports — like fresh snow on Zugspitze.

---

## 🧰 Requirements

- **Node.js 18+** (recommend: Node 20)
- A Discord **bot** created in the [Developer Portal](https://discord.com/developers/applications)
- One **Forum Channel** for bug reports
- One **Text Channel** for temporary “intake threads”

---

## ⚙️ Setup 


```bash
1️⃣ Clone & install
git clone https://github.com/MuhacklGames/Discord-Bugreport-Bot.git
cd Discord-Bugreport-Bot
npm install
2️⃣ Configure .env
Create .env (or copy from .env.example) and fill:

env
Copy Code
DISCORD_TOKEN=your_bot_token
GUILD_ID=your_server_id
FORUM_CHANNEL_ID=forum_channel_id
INTAKE_PARENT_CHANNEL_ID=text_channel_id
PANEL_MESSAGE_URL=     # optional: direct link to the bot's panel message
PANEL_TARGET_ID=       # optional fallback (channel/thread id)
EMOJI_WHITELIST=🔺,🔴,❌,🟠,🟢,🦢,🎮,📹,🔊,🕹️,🚨,🔥 #customisable to your needs
USE_MESSAGE_CONTENT=true
🧱 Discord Setup
Bot permissions
In the Developer Portal → Bot → Privileged Gateway Intents

Enable Message Content Intent if you want the bot to detect URLs in intake posts.

In Discord, grant the bot:

View Channels

Send Messages

Send Messages in Threads

Create Public/Private Threads

Manage Threads

Read Message History

Channel permissions
Channel	Permissions Needed	Purpose
Bug Forum	View, Create Posts/Threads, Manage Threads	Create & lock bug reports
Intake Text Channel	View, Create Private Threads	Temporary uploads (media/screenshots)

🚀 Deployment
Register command
bash
Copy Code
npm run deploy
Adds the /post_bug_panel command to your server.

Start the bot
bash
Code kopieren
npm run dev
Create the bug panel
In Discord, run:

bash
Copy Code
/post_bug_panel
→ This creates the Bug Reporting Panel thread with a Report Bug button.

🐛 Bug Report Flow (for players)
1️⃣ Click Report Bug
2️⃣ Select Bug Type → Category → Impact
3️⃣ Enter Title & Description
4️⃣ Indicate if it’s Reproducible (and add steps if yes)
5️⃣ (Optional) Add media (images, clips, or links)
6️⃣ Enter the game version
7️⃣ The bot posts a locked bug thread with emojis & markdown formatting

Example thread:

yaml
Copy Code
### 🐞 Player character stuck on fence

Tester: @User
Type: Gameplay
Category: Building
Impact: Moderate
Reproducible: Yes

📝 Description:
Character clips through the fence and cannot move.

🧪 Reproduction steps:
1. Build fence near rock
2. Jump onto top
3. Get stuck

Severity: 5/10 – somewhat annoying
Version: v0.0.16
🧀 Styling notes
Emoji taxonomy

Types: 🎮 Gameplay • 📹 Visuals • 🔊 Sound • 🕹️ Progress

Impact: 🔺🔴 Critical • 🟠 Moderate • 🟢 Minor • 🦢 Cosmetic

Reproducible: 🚨 Yes • 🔥 No

Tone: clear, short, professional — never overwhelming.
Visuals: Use Alpine-inspired colors in embeds (#90E0EF light blue for clarity).
Footer: subtle thanks, not noise — we’re Bavarian, not loud 😉

🧩 Customizing
Inside src/index.js:

Update the arrays BUG_TYPES, GAME_CATEGORIES, and IMPACTS to match your projects.

Edit makeBugPanelEmbed() for panel color, text, or branding.

Adjust buildFinalContent() if you want different markdown formatting.

📦 Scripts
Command	Description
npm run deploy	Registers /post_bug_panel
npm run dev	Starts the bot

🗂️ Folder Structure
pgsql
Copy Code
discord-bugreport-bot/
├─ .gitignore
├─ .env.example
├─ package.json
├─ README.md
└─ src/
   ├─ deploy-commands.js
   └─ index.js
🧭 Developer Notes
To allow media intake, ensure your “intake” text channel supports private threads.

“Back to panel” hints jump to PANEL_MESSAGE_URL (copy link of the bot’s message).

Bug threads are auto-locked, pinned, and emoji-reacted based on severity/type.

The bot gracefully handles slow pings or delayed responses.

📜 License
MIT License © 2025 Muhackl Games
Crafted in Bavaria 🏔️ with precision, coffee, and a proud “Muh”.
