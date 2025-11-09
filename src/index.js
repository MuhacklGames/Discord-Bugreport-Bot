import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, EmbedBuilder, PermissionFlagsBits
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const FORUM_CHANNEL_ID = process.env.FORUM_CHANNEL_ID;
const INTAKE_PARENT_CHANNEL_ID = process.env.INTAKE_PARENT_CHANNEL_ID;
const PANEL_MESSAGE_URL = process.env.PANEL_MESSAGE_URL || null;
const PANEL_TARGET_ID = process.env.PANEL_TARGET_ID || null;
const USE_MC = String(process.env.USE_MESSAGE_CONTENT ?? 'true').toLowerCase() === 'true';

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions];
if (USE_MC) intents.push(GatewayIntentBits.MessageContent);

const client = new Client({
  intents,
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const EMOJI_WHITELIST = new Set((process.env.EMOJI_WHITELIST ?? '').split(',').map(s => s.trim()).filter(Boolean));

const IDS = {
  BTN_OPEN: 'bug_open',
  BTN_CONTINUE: 'btn_continue',
  BTN_VERSION: 'btn_version',
  BTN_RESUME: 'btn_resume',
  SEL_TYPE: 'sel_type',
  SEL_CATEGORY: 'sel_category',
  SEL_IMPACT: 'sel_impact',
  SEL_REPRO: 'sel_repro',
  SEL_SEVERITY: 'sel_severity',
  SEL_MEDIA: 'sel_media',
  MOD_MAIN: 'mod_main',
  MOD_REPRO: 'mod_repro',
  MOD_VERSION: 'mod_version'
};

const BUG_TYPES = [
  { label: 'Gameplay', value: 'Gameplay', emoji: '🎮' },
  { label: 'Visuals',  value: 'Visuals',  emoji: '📹' },
  { label: 'Sound',    value: 'Sound',    emoji: '🔊' },
  { label: 'Progress', value: 'Progress', emoji: '🕹️' }
];

const GAME_CATEGORIES = [
  { label: 'Farming',      value: 'Farming',      emoji: '🧑‍🌾' },
  { label: 'Building',     value: 'Building',     emoji: '🏗️' },
  { label: 'Automation',   value: 'Automation',   emoji: '🤖' },
  { label: 'another Area', value: 'another Area', emoji: '🧭' }
];

const IMPACTS = [
  { value: 'Blocker',  label: 'CRITICAL',  desc: 'Cannot progress further',                        emojis: ['🔺','🔴'] },
  { value: 'Crash',    label: 'CRITICAL',  desc: 'Crash or corrupted progress',                   emojis: ['🔺','❌'] },
  { value: 'Moderate', label: 'MODERATE',  desc: 'Severe issue but progress possible',            emojis: ['🟠'] },
  { value: 'Minor',    label: 'MINOR',     desc: 'Small quirk, not a big limitation',             emojis: ['🟢'] },
  { value: 'Cosmetic', label: 'COSMETIC',  desc: 'Textures/SFX/UI/typos without Gameplay impact', emojis: ['🦢'] }
];

const REPRO = [
  { label: 'Yes', value: 'yes', emojis: ['🚨'] },
  { label: 'No',  value: 'no',  emojis: ['🔥'] }
];

const NET = { LONG_STEP_HINT_MS: 6000, MAX_RETRIES: 4, BASE_DELAY_MS: 600, JITTER_MS: 300 };

const sessions = new Map();
const processed = new Set();

function alreadyProcessed(i) {
  if (processed.has(i.id)) return true;
  processed.add(i.id);
  setTimeout(() => processed.delete(i.id), 60000);
  return false;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const backoff = (a) => NET.BASE_DELAY_MS * Math.pow(2, a) + Math.floor(Math.random() * NET.JITTER_MS);

async function withRetries(label, fn) {
  let lastErr;
  for (let a = 0; a < NET.MAX_RETRIES; a++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.code;
      if (status && status !== 429 && String(status).startsWith('4')) break;
      await sleep(backoff(a));
    }
  }
  console.error(`[withRetries:${label}]`, lastErr);
  throw lastErr;
}

function startWaitTicker(i) {
  let active = true;
  const timer = setTimeout(async () => {
    if (!active) return;
    try {
      const dots = ['.', '..', '...'];
      let t = 0;
      while (active) {
        t = (t + 1) % dots.length;
        await i.editReply({ content: `⏳ Please wait${dots[t]} – slow connection or server load.` }).catch(() => {});
        await sleep(2000);
      }
    } catch {}
  }, NET.LONG_STEP_HINT_MS);
  return () => { active = false; clearTimeout(timer); };
}

async function tryDeferEphemeral(i) {
  try {
    if (!i.deferred && !i.replied) {
      await i.deferReply({ flags: 64 });
      return true;
    }
  } catch {}
  return i.deferred || i.replied;
}

function panelJumpText(label = 'back to the panel') {
  if (PANEL_MESSAGE_URL) return `[${label}](${PANEL_MESSAGE_URL})`;
  if (PANEL_TARGET_ID)   return `<#${PANEL_TARGET_ID}>`;
  return label;
}

const severityText = (n) => (Number(n) <= 3 ? 'not very annoying' : Number(n) <= 6 ? 'somewhat annoying' : 'very annoying');

function buildFinalContent(uid, s) {
  const reproText = s.repro === 'yes' ? 'Yes' : 'No';
  const reproBlock = (s.repro === 'yes' && s.reproSteps) ? `\n🧪 **Reproduction steps (from tester):**\n${s.reproSteps}\n` : '';
  const linksBlock = (s.links?.length) ? `\n🔗 **Additional links**\n${s.links.map(u => `• ${u}`).join('\n')}\n` : '';
  return `### 🐞 ${s.title}

**Tester:** <@${uid}>  
**Type:** ${s.type ?? '-'}  
**Category:** ${s.category ?? '-'}  
**Impact:** ${s.impact ?? '-'}  
**Reproducible:** ${reproText}

📝 **Description:**  
${s.desc}
${reproBlock}
**Severity:** ${s.severity}/10 – ${severityText(s.severity)}  
**Version:** ${s.version ?? '-'}

${linksBlock}—`;
}

function makeBugPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x90E0EF)
    .setTitle('🧩 Bug Reporting Panel — Read Before Submitting')
    .setDescription('Hey Alpha Testers 👋\nHelp us keep the game stable by reporting bugs here!\nPlease follow the steps below so our team can quickly track and fix issues 🧰')
    .addFields(
      {
        name: '🧭 How it works',
        value:
          '1️⃣ Click **“Report Bug”** below.\n' +
          '2️⃣ Select **Bug Type → Category → Impact.**\n' +
          '3️⃣ Add a short **title** and a clear **description.**\n' +
          '4️⃣ Tell us if it’s **reproducible** (and how).\n' +
          '5️⃣ *(Optional)* Post screenshots, clips, or links in a short intake thread.\n' +
          '6️⃣ Enter the **game version** — done!\n\n' +
          'The bot will create a locked thread for our QA & Dev team to review.'
      },
      {
        name: 'Emoji Legend',
        value:
          '**Bug Type**\n' +
          '🎮 Gameplay • 📹 Visuals • 🔊 Sound • 🕹️ Progress\n\n' +
          '**Impact Level**\n' +
          '🔺🔴 Critical — Game-breaking or blocker\n' +
          '🔺❌ Crash — Game crashes or corrupted save\n' +
          '🟠 Moderate — Major issue, still playable\n' +
          '🟢 Minor — Noticeable but not severe\n' +
          '🦢 Cosmetic — Visual/UI/text only\n\n' +
          '**Reproducible**\n' +
          '🚨 Yes • 🔥 No'
      },
      {
        name: 'Notes',
        value:
          '• Please report **one issue per thread.**\n' +
          '• Threads are **read-only** for reporters.\n' +
          '• Reports are auto-tagged with relevant emojis.\n' +
          '• You can dismiss bot pop-ups bottom-right.'
      }
    )
    .setFooter({ text: 'Thanks for helping us polish the game!' });
}

function stepComponents(s) {
  switch (s.step) {
    case 1: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_TYPE)
        .setPlaceholder('Select the bug type')
        .addOptions(BUG_TYPES.map(o => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setEmoji(o.emoji);
          if (s.type === o.value) opt.setDefault(true);
          return opt;
        }));
      return { text: 'Which **type of bug** do you want to report?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 2: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_CATEGORY)
        .setPlaceholder('Which game category is affected?')
        .addOptions(GAME_CATEGORIES.map(o => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setEmoji(o.emoji);
          if (s.category === o.value) opt.setDefault(true);
          return opt;
        }));
      return { text: 'Select the affected **game category**.', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 3: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_IMPACT)
        .setPlaceholder('How strongly does it affect play?')
        .addOptions(IMPACTS.map(o => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setDescription(o.desc).setValue(o.value).setEmoji(o.emojis[0]);
          if (s.impact === o.value) opt.setDefault(true);
          return opt;
        }));
      return { text: 'How much does this bug impact **your game flow**?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 4: {
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_CONTINUE).setLabel('Enter title & description').setStyle(ButtonStyle.Primary);
      return { text: 'Please enter a **concise title** and a **detailed description**.', components: [new ActionRowBuilder().addComponents(btn)] };
    }
    case 5: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_REPRO)
        .setPlaceholder('Is the bug reproducible?')
        .addOptions(REPRO.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)));
      return { text: 'Could you **reproduce** the bug?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 6: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_SEVERITY)
        .setPlaceholder('How annoying was it? (1–10)')
        .addOptions([...Array(10)].map((_, i) => {
          const val = String(i + 1);
          const opt = new StringSelectMenuOptionBuilder().setLabel(val).setValue(val);
          if (s.severity === val) opt.setDefault(true);
          return opt;
        }));
      return { text: 'How **annoying** was it for you? (1–10)', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 7: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_MEDIA)
        .setPlaceholder('Share screenshots/videos/video links?')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Yes, I have media').setValue('yes'),
          new StringSelectMenuOptionBuilder().setLabel('No, continue without').setValue('no')
        );
      return { text: 'Do you want to share additional **media** to help us understand the bug?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 8: {
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_VERSION).setLabel('Enter version').setStyle(ButtonStyle.Success);
      const note = s.mediaYN === 'yes'
        ? (s.intakeCaptured ? '✅ Intake captured. Click **Enter version**.' : '✉️ A **temporary intake** was opened. Post **ONE** message there (text + media/links). It will **auto-close**. Then click **Enter version**.')
        : 'No intake opened. Continue with **Enter version**.';
      const link = s.intakeThreadId ? `\n🔗 Intake: <#${s.intakeThreadId}>` : '';
      return { text: `${note}${link}`, components: [new ActionRowBuilder().addComponents(btn)] };
    }
    default:
      return { text: 'Done.', components: [] };
  }
}

client.once('ready', () => console.log(`✅ BugBot online as ${client.user.tag}`));

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() || !['post_panel','post_bug_panel'].includes(i.commandName)) return;
  try {
    await i.deferReply({ flags: 64 });
    if (!FORUM_CHANNEL_ID) return await i.editReply('❌ FORUM_CHANNEL_ID missing in `.env`.');
    const forum = await client.channels.fetch(FORUM_CHANNEL_ID).catch(() => null);
    if (!forum || forum.type !== ChannelType.GuildForum) return await i.editReply('❌ Bug forum not found or wrong channel type.');
    const me = i.guild.members.me;
    const perms = forum.permissionsFor(me);
    const need = [
      'ViewChannel',
      'SendMessages',
      ('CreatePosts' in PermissionFlagsBits ? 'CreatePosts' : 'CreatePublicThreads'),
      'SendMessagesInThreads',
      'ManageThreads',
      'ReadMessageHistory'
    ];
    const missing = need.filter(p => !perms?.has(PermissionFlagsBits[p]));
    if (missing.length) return await i.editReply('❌ Missing forum permissions:\n• ' + missing.join('\n• '));
    const openBtn = new ButtonBuilder().setCustomId(IDS.BTN_OPEN).setLabel('Report Bug').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(openBtn);
    const embed = makeBugPanelEmbed();
    const thread = await withRetries('panel_create', async () => forum.threads.create({
      name: '🐞 Bug Reporting — Guide',
      message: { embeds: [embed], components: [row] },
      reason: 'Bug panel'
    }));
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (starter?.url) console.log('Panel URL:', starter.url);
    await i.editReply({ content: `✅ Panel created: <#${thread.id}>` });
  } catch (err) {
    console.error('post_panel error', err);
    if (i.deferred || i.replied) await i.editReply('❌ Failed to post bug panel. Check permissions and logs.');
    else await i.reply({ content: '❌ Failed to post bug panel.', flags: 64 });
  }
});

client.on('interactionCreate', async (i) => {
  try {
    if (!i.isButton() || i.customId !== IDS.BTN_OPEN) return;
    if (alreadyProcessed(i)) return;
    const deferred = await tryDeferEphemeral(i);
    const stopTicker = startWaitTicker(i);
    const s = { step: 1, files: [], links: [], intakeCaptured: false, posting: false, threadId: null, finalized: false };
    sessions.set(i.user.id, s);
    const first = stepComponents(s);
    if (deferred) await i.editReply({ content: first.text, components: first.components });
    else await i.reply({ content: first.text, components: first.components, flags: 64 });
    stopTicker();
  } catch (err) {
    console.error('BTN_OPEN error', err);
    try {
      if (i.deferred || i.replied) await i.editReply({ content: '❌ Unexpected error. Please try again.' });
      else await i.reply({ content: '❌ Unexpected error. Please try again.', flags: 64 });
    } catch {}
  }
});

client.on('interactionCreate', async (i) => {
  if (!i.isStringSelectMenu()) return;
  const s = sessions.get(i.user.id);
  if (!s || s.finalized) return;
  try {
    if (i.customId === IDS.SEL_REPRO && s.step === 5) {
      s.repro = i.values[0];
      if (s.repro === 'yes') {
        const modal = new ModalBuilder().setCustomId(IDS.MOD_REPRO).setTitle('Reproduction');
        const field = new TextInputBuilder().setCustomId('repro').setLabel('How did you reproduce this bug?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        await i.showModal(modal.addComponents(new ActionRowBuilder().addComponents(field)));
        return;
      }
      s.step = 6;
      const nxt = stepComponents(s);
      await i.update({ content: nxt.text, components: nxt.components });
      return;
    }
    if (i.customId === IDS.SEL_TYPE && s.step === 1) {
      s.type = i.values[0]; s.step = 2;
      const { text, components } = stepComponents(s);
      await i.update({ content: text, components });
      return;
    }
    if (i.customId === IDS.SEL_CATEGORY && s.step === 2) {
      s.category = i.values[0]; s.step = 3;
      const { text, components } = stepComponents(s);
      await i.update({ content: text, components });
      return;
    }
    if (i.customId === IDS.SEL_IMPACT && s.step === 3) {
      s.impact = i.values[0]; s.step = 4;
      const { text, components } = stepComponents(s);
      await i.update({ content: text, components });
      return;
    }
    if (i.customId === IDS.SEL_SEVERITY && s.step === 6) {
      s.severity = i.values[0]; s.step = 7;
      const { text, components } = stepComponents(s);
      await i.update({ content: text, components });
      return;
    }
    if (i.customId === IDS.SEL_MEDIA && s.step === 7) {
      s.mediaYN = i.values[0];
      let intakeOK = false;
      let intakeId = null;
      let noteText = 'No intake opened. Continue with **Enter version**.';
      let debugHint = '';
      if (s.mediaYN === 'yes') {
        const parent = await client.channels.fetch(INTAKE_PARENT_CHANNEL_ID).catch(() => null);
        if (!parent) {
          debugHint = ' (parent channel not found; check INTAKE_PARENT_CHANNEL_ID)';
        } else {
          const me = parent.guild.members.me;
          const perms = parent.permissionsFor(me);
          const canPrivate = perms?.has(PermissionFlagsBits.CreatePrivateThreads);
          const canPublic  = perms?.has(PermissionFlagsBits.CreatePublicThreads);
          try {
            if (canPrivate) {
              const t = await parent.threads.create({
                name: `Intake – ${s.title || 'Bug Report'}`.slice(0, 80),
                type: ChannelType.PrivateThread,
                autoArchiveDuration: 1440,
                invitable: false,
                reason: `Intake for ${i.user.tag}`
              });
              await t.members.add(i.user.id).catch(() => {});
              intakeOK = true; intakeId = t.id;
            } else if (canPublic) {
              const t = await parent.threads.create({
                name: `Intake – ${s.title || 'Bug Report'}`.slice(0, 80),
                type: ChannelType.PublicThread,
                autoArchiveDuration: 1440,
                reason: `Intake (fallback) for ${i.user.tag}`
              });
              await t.members.add(i.user.id).catch(() => {});
              intakeOK = true; intakeId = t.id;
            } else {
              debugHint = ' (missing CreatePrivateThreads/CreatePublicThreads in intake channel)';
            }
          } catch (e) {
            console.error('intake create error', e);
            debugHint = ` (${e?.code || e?.message || 'create error'})`;
          }
        }
        if (intakeOK) {
          s.intakeThreadId = intakeId;
          const info = new EmbedBuilder()
            .setTitle('Temporary Intake')
            .setDescription(
              'Please post **ONE** message with your description **and** screenshots/videos/links.\n' +
              'The intake will **auto-close** after the first message.\n\n' +
              `Then go ${panelJumpText()} and click **Enter version**.`
            );
          try {
            const ch = await client.channels.fetch(intakeId).catch(() => null);
            if (ch) await ch.send({ content: `<@${i.user.id}>`, embeds: [info] });
          } catch {}
          noteText = '✉️ A **temporary intake** was opened. Post **ONE** message there (text + media/links). It will **auto-close**. Then click **Enter version**.';
        } else {
          console.warn('Intake NOT opened' + debugHint);
          s.intakeThreadId = null;
        }
      }
      s.step = 8;
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_VERSION).setLabel('Enter version').setStyle(ButtonStyle.Success);
      const link = s.intakeThreadId ? `\n🔗 Intake: <#${s.intakeThreadId}>` : '';
      await i.update({ content: `${noteText}${link}`, components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }
  } catch (err) {
    console.error('select error', err);
    try { await i.followUp({ content: '❌ Selection failed.', flags: 64 }); } catch {}
  }
});

client.on('interactionCreate', async (i) => {
  const s = sessions.get(i.user.id); if (!s || s.finalized) return;
  try {
    if (i.isButton() && i.customId === IDS.BTN_CONTINUE && s.step === 4) {
      const modal = new ModalBuilder().setCustomId(IDS.MOD_MAIN).setTitle('Bug Details');
      const title = new TextInputBuilder().setCustomId('title').setLabel('Short bug title').setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true);
      const desc  = new TextInputBuilder().setCustomId('desc').setLabel('Detailed description').setStyle(TextInputStyle.Paragraph).setRequired(true);
      await i.showModal(modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(desc)
      ));
      return;
    }
    if (i.isButton() && i.customId === IDS.BTN_VERSION && s.step === 8) {
      const modal = new ModalBuilder().setCustomId(IDS.MOD_VERSION).setTitle('Version');
      const ver = new TextInputBuilder().setCustomId('ver').setLabel('Game version (e.g., v 0.0.16)').setStyle(TextInputStyle.Short).setMaxLength(20).setPlaceholder('v 0.0.16').setRequired(true);
      await i.showModal(modal.addComponents(new ActionRowBuilder().addComponents(ver)));
      return;
    }
    if (i.isButton() && i.customId === IDS.BTN_RESUME) {
      const deferred = await tryDeferEphemeral(i);
      const stopTicker = startWaitTicker(i);
      const { text, components } = stepComponents(s);
      if (deferred) await i.editReply({ content: text, components });
      else await i.reply({ content: text, components, flags: 64 });
      stopTicker();
      return;
    }
  } catch {}
});

client.on('interactionCreate', async (i) => {
  if (!i.isModalSubmit()) return;
  if (alreadyProcessed(i)) return;
  const s = sessions.get(i.user.id); if (!s) return;
  try {
    if (!(i.deferred || i.replied)) await i.deferReply({ flags: 64 });
    if (i.customId === IDS.MOD_MAIN && s.step === 4) {
      s.title = i.fields.getTextInputValue('title');
      s.desc  = i.fields.getTextInputValue('desc');
      s.step  = 5;
      const nxt = stepComponents(s);
      await i.editReply({ content: nxt.text, components: nxt.components });
      return;
    }
    if (i.customId === IDS.MOD_REPRO && s.step === 5 && s.repro === 'yes') {
      s.reproSteps = i.fields.getTextInputValue('repro');
      s.step = 6;
      const nxt = stepComponents(s);
      await i.editReply({ content: nxt.text, components: nxt.components });
      return;
    }
    if (i.customId === IDS.MOD_VERSION && s.step === 8) {
      if (s.posting || s.finalized) {
        await i.editReply({ content: s.threadId ? `✔ Bug report already exists: <#${s.threadId}>` : '⏳ Your report is being created …' });
        await i.followUp({ content: '✔ You can now **dismiss** these bot messages (bottom-right).', flags: 64 });
        return;
      }
      s.posting = true;
      const stopTicker = startWaitTicker(i);
      s.version = i.fields.getTextInputValue('ver');
      const forum = await client.channels.fetch(FORUM_CHANNEL_ID).catch(() => null);
      if (!forum || forum.type !== ChannelType.GuildForum) {
        await i.editReply('❌ Bug forum not available. Check FORUM_CHANNEL_ID.');
        s.posting = false;
        return;
      }
      const typeObj = BUG_TYPES.find(t => t.value === s.type);
      const impactObj = IMPACTS.find(x => x.value === s.impact);
      const catObj = GAME_CATEGORIES.find(c => c.value === s.category);
      const typeEmoji = typeObj?.emoji ?? '🐞';
      const catEmoji = catObj?.emoji ?? '';
      const category = s.category ?? 'General';
      const impactTxt = (impactObj?.label || 'UNKNOWN').toUpperCase();
      const threadName = `${typeEmoji}${catEmoji ? ' ' + catEmoji : ''} | Bug-Report | ${category} – ${s.title} [${impactTxt}]`.slice(0, 90);
      const filesToAttach = (s.files || []).slice(0, 10);
      const thread = await forum.threads.create({
        name: threadName,
        message: { content: buildFinalContent(i.user.id, s), files: filesToAttach },
        reason: `Bug report by ${i.user.tag}`
      });
      s.threadId = thread.id;
      try { await thread.setLocked(true); } catch {}
      try { await thread.setArchived(false); } catch {}
      const starter = await thread.fetchStarterMessage().catch(() => null);
      const eType = typeObj?.emoji;
      const eImp = IMPACTS.find(x => x.value === s.impact)?.emojis ?? [];
      const eRepro = REPRO.find(x => x.value === s.repro)?.emojis ?? [];
      const reacts = [eType, ...eImp, ...eRepro].filter(Boolean);
      if (starter) {
        for (const e of reacts) { try { await starter.react(e); } catch {} }
        try { await starter.pin(); } catch {}
      }
      s.posting = false; s.finalized = true;
      await i.editReply({
        content: `✔ Bug report created: <#${s.threadId}>`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open report').setURL(`https://discord.com/channels/${i.guildId}/${s.threadId}`)
        )]
      });
      await i.followUp({ content: '✔ All set. You can now **dismiss** these bot messages (bottom-right).', flags: 64 });
      stopTicker();
    }
  } catch (err) {
    console.error('modal error', err);
    try { await i.editReply({ content: '❌ Unexpected error on modal submit. Please try again.' }); } catch {}
  }
});

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.channel.isThread()) return;
    const entry = [...sessions].find(([, v]) => v.intakeThreadId === msg.channel.id && !v.finalized);
    if (!entry) return;
    const s = entry[1];
    if (s.intakeCaptured) { try { await msg.delete().catch(() => {}); } catch {} return; }
    s.files = [];
    s.links = [];
    if (msg.attachments?.size) msg.attachments.forEach(a => s.files.push({ attachment: a.url, name: a.name }));
    if (USE_MC) {
      const found = msg.content?.match(/\bhttps?:\/\/\S+/gi) || [];
      s.links.push(...found);
    }
    s.intakeCaptured = true;
    try {
      await msg.channel.send({ content: `✅ Thanks! Intake captured.\n↩️ Go ${panelJumpText()} and click **Enter version**.` });
      await msg.channel.setLocked(true).catch(() => {});
      await msg.channel.setArchived(true).catch(() => {});
    } catch {}
  } catch {}
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const key = reaction.emoji.id ? reaction.emoji.id : reaction.emoji.name;
    if (!EMOJI_WHITELIST.has(key)) await reaction.users.remove(user.id).catch(() => {});
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  if (reason?.code === 10062) return;
  console.error('unhandledRejection:', reason);
});
client.on('error', (e) => console.error('client error:', e));

client.login(TOKEN);
