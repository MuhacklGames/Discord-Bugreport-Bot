# Muhackl Games – Discord Bug Report Bot

A guided bug-report flow for Discord that:

- Walks a tester through required fields (type, category, impact, title, description, reproducible, severity, version)
- Optionally opens a temporary **intake thread** for one media message (screenshots/videos/links)
- Creates a **Forum Thread** post with a clean, formatted summary
- Reacts with emojis based on selections
- Locks the report thread so users can’t write in it
- Filters reactions to an allow-list

## Requirements

- Node.js 18+ (LTS recommended)
- A Discord bot with the following **bot permissions** on the server:
  - View Channels
  - Send Messages
  - Add Reactions
  - Manage Messages (optional, for reaction filtering)
  - Create Public Threads
  - Create Private Threads
  - Send Messages in Threads
  - Manage Threads
  - Attach Files
- The bot must be invited with scopes: `bot applications.commands`

## Install

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

## Configure `.env`

Create a `.env` in the project root:

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN

# Forum channel where final bug reports are created
FORUM_CHANNEL_ID=123456789012345678

# A normal text channel under which temporary intake threads will be created
INTAKE_PARENT_CHANNEL_ID=234567890123456789

# Optional: link back to your panel message or its channel as a fallback
PANEL_MESSAGE_URL=https://discord.com/channels/<guild>/<channel>/<message>
PANEL_TARGET_ID=345678901234567890

# Optional: only allow these emoji reactions on report posts
EMOJI_WHITELIST=🎮,📹,🔊,🕹️,🔺,🔴,❌,🟠,🟢,🦢,🚨,🔥
```

## Start

```bash
npm run dev
# or
node src/index.js
```

## Create the panel message

Post a message in your chosen channel with one button that has:

- Label: e.g. **“Report bug”**
- `custom_id`: **`open_bug_form`** (required)

Example (if you post via code):

```js
new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('open_bug_form')
    .setStyle(ButtonStyle.Primary)
    .setLabel('Report bug')
)
```

Users click the button to start the step-by-step flow via ephemeral messages.

## Flow

1. **Type** (Gameplay / Visuals / Sound / Progress)  
2. **Category** (Farming / Building / Automation / another Area)  
3. **Impact** (CRITICAL / MODERATE / MINOR / COSMETIC with descriptions)  
4. **Title & Description** (modal)  
5. **Reproducible?** (Yes/No) → if **Yes**, a modal requests reproduction steps  
6. **Severity (1–10)**  
7. **Share media?** (Yes/No)  
   - If **Yes**, a temporary **intake thread** opens; user posts **ONE** message with media/links; the intake auto-locks  
8. **Version** (modal)  
9. A **Forum Thread** is created with the compiled report, starter post gets emoji reactions and is pinned

## Notes

- Ephemeral messages **cannot be deleted** later by bots. Users can dismiss them (bottom-right “Dismiss message”).  
- The bot **locks** the new Forum Thread so users can’t write in the report thread. Adjust forum permissions as you need.  
- If `EMOJI_WHITELIST` is set, any other reactions in report threads will be removed by the bot.

## Troubleshooting

- **“This interaction failed.”** — Usually the button’s `custom_id` is wrong or the bot timed out. Ensure the panel button uses `open_bug_form`.  
- **Missing Access / 403** — The bot lacks one of the required thread or message permissions in the target channels.  
- **Unknown interaction (10062)** — Discord did not receive a response in time. This build defers and replies ephemerally to minimize the issue.

## Customize

- Edit lists in `src/index.js` to change types, categories, labels, or emojis.  
- Tweak the forum post layout inside `buildFinalContent()`.

---

© Muhackl Games. MIT-style use permitted; remove branding if you fork for a generic use case.
