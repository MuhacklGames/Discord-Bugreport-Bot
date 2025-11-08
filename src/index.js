import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, EmbedBuilder
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const FORUM_CHANNEL_ID      = process.env.FORUM_CHANNEL_ID;
const INTAKE_PARENT_CHANNEL = process.env.INTAKE_PARENT_CHANNEL_ID;
const PANEL_MESSAGE_URL     = process.env.PANEL_MESSAGE_URL || null;
const PANEL_TARGET_ID       = process.env.PANEL_TARGET_ID || null;

const EMOJI_WHITELIST = new Set((process.env.EMOJI_WHITELIST ?? '')
  .split(',').map(s => s.trim()).filter(Boolean));

const IDS = {
  BTN_OPEN: 'open_bug_form',
  SEL_TYPE: 'sel_type',
  SEL_CATEGORY: 'sel_category',
  SEL_IMPACT: 'sel_impact',
  SEL_REPRO: 'sel_repro',
  SEL_SEVERITY: 'sel_severity',
  SEL_MEDIA: 'sel_media',
  MOD_MAIN: 'mod_main',
  MOD_REPRO: 'mod_repro',
  MOD_VERSION: 'mod_version',
  BTN_CONTINUE: 'btn_continue',
  BTN_VERSION: 'btn_version'
};

const BUG_TYPES = [
  { label: 'Gameplay', value: 'gameplay', emoji: '🎮' },
  { label: 'Visuals',  value: 'visuals',  emoji: '📹' },
  { label: 'Sound',    value: 'sound',    emoji: '🔊' },
  { label: 'Progress', value: 'progress', emoji: '🕹️' }
];

const GAME_CATEGORIES = [
  { label: 'Farming',      value: 'Farming',      emoji: '🧑‍🌾' },
  { label: 'Building',     value: 'Building',     emoji: '🏗️' },
  { label: 'Automation',   value: 'Automation',   emoji: '🤖' },
  { label: 'another Area', value: 'another Area', emoji: '🧭' }
];

const IMPACTS = [
  { value:'blocker',  label:'CRITICAL',  desc:'Cannot progress further',                         emojis:['🔺','🔴'] },
  { value:'crash',    label:'CRITICAL',  desc:'Crash or corrupted progress',                    emojis:['🔺','❌'] },
  { value:'moderate', label:'MODERATE',  desc:'Severe issue but progress possible',             emojis:['🟠'] },
  { value:'minor',    label:'MINOR',     desc:'Small quirk, not a big limitation',              emojis:['🟢'] },
  { value:'cosmetic', label:'COSMETIC',  desc:'Textures/SFX/UI/typos without gameplay impact',  emojis:['🦢'] }
];

const REPRO = [
  { label: 'Yes', value: 'yes', emojis:['🚨'] },
  { label: 'No',  value: 'no',  emojis:['🔥'] }
];

const MEDIA_YN = [
  { label: 'Yes, I have media', value: 'yes' },
  { label: 'No, continue without', value: 'no' }
];

const sessions = new Map();

function panelJumpText(label = 'back to the panel') {
  if (PANEL_MESSAGE_URL) return `[${label}](${PANEL_MESSAGE_URL})`;
  if (PANEL_TARGET_ID)   return `<#${PANEL_TARGET_ID}>`;
  return label;
}

const replyEphemeral    = (i, opts) => i.reply({ ...opts, flags: 64 });
const followupEphemeral = (i, opts) => i.followUp({ ...opts, flags: 64 });

async function safeTransition(i, payload) {
  try {
    if (i.deferred || i.replied) return await i.editReply(payload);
    return await i.update(payload);
  } catch {
    try { return await replyEphemeral(i, payload); } catch {}
  }
}

const severityLabel = n =>
  (Number(n) <= 3 ? 'not very annoying' : Number(n) <= 6 ? 'somewhat annoying' : 'very annoying');

function buildFinalContent(uid, s) {
  const reproText = s.repro === 'yes' ? 'Yes' : 'No';
  const sevText = severityLabel(s.severity);

  const linksBlock = (s.links?.length)
    ? `\n🔗 **Additional links**\n${s.links.map(u => `• ${u}`).join('\n')}\n`
    : '';

  const reproBlock = (s.repro === 'yes' && s.reproSteps)
    ? `\n🧪 **Reproduction (from tester):**\n${s.reproSteps}\n`
    : '';

  return (
`### 🐞 ${s.title}

**Tester:** <@${uid}>  
**Type:** ${s.type ?? '-'}  
**Category:** ${s.category ?? '-'}  
**Impact:** ${s.impact ?? '-'}  
**Reproducible:** ${reproText}

📝 **Description:**  
${s.desc}
${reproBlock}
**Severity:** ${s.severity}/10 – ${sevText}  
**Version:** ${s.version ?? '-'}

${linksBlock}—`
  );
}

function stepComponents(s){
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
          const opt = new StringSelectMenuOptionBuilder()
            .setLabel(o.label).setDescription(o.desc).setValue(o.value).setEmoji(o.emojis[0]);
          if (s.impact === o.value) opt.setDefault(true);
          return opt;
        }));
      return { text: 'How much does this bug impact **game flow**?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 4: {
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_CONTINUE).setLabel('Enter title & description').setStyle(ButtonStyle.Primary);
      return { text: 'Please enter a **concise title** and a **detailed description**.', components: [new ActionRowBuilder().addComponents(btn)] };
    }
    case 5: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SEL_REPRO)
        .setPlaceholder('Is the bug reproducible?')
        .addOptions(REPRO.map(o => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value);
          if (s.repro === o.value) opt.setDefault(true);
          return opt;
        }));
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
        .addOptions(MEDIA_YN.map(o => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value);
          if (s.mediaYN === o.value) opt.setDefault(true);
          return opt;
        }));
      return { text: 'Do you want to share **media** to help us understand the bug?', components: [new ActionRowBuilder().addComponents(menu)] };
    }
    case 8: {
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_VERSION).setLabel('Enter version').setStyle(ButtonStyle.Success);
      const note = s.mediaYN === 'yes'
        ? (s.intakeCaptured
            ? `✅ Intake captured. Click **Enter version**.`
            : `✉️ A **temporary intake** was opened. Post **ONE** message there (text + media/links). It will **auto-close**. Then click **Enter version**.`)
        : `No intake opened. Continue with **Enter version**.`;
      const link = s.intakeThreadId ? `\n🔗 Intake: <#${s.intakeThreadId}>` : '';
      return { text: `${note}${link}`, components: [new ActionRowBuilder().addComponents(btn)] };
    }
    case 9: {
      const btn = new ButtonBuilder().setCustomId(IDS.BTN_VERSION).setLabel('Enter version').setStyle(ButtonStyle.Primary);
      return { text: 'Finally: Which **game version** was affected?', components: [new ActionRowBuilder().addComponents(btn)] };
    }
    default:
      return { text: 'Done.', components: [] };
  }
}

client.once('clientReady', () => console.log(`✅ Bot online as ${client.user.tag}`));

client.on('interactionCreate', async (i) => {
  try {
    if (!i.isButton() || i.customId !== IDS.BTN_OPEN) return;
    const s = {
      step: 1, files: [], links: [],
      intakeCaptured: false,
      posting: false, threadId: null, finalized: false
    };
    sessions.set(i.user.id, s);
    const { text, components } = stepComponents(s);
    await replyEphemeral(i, { content: text, components });
  } catch (e) { console.error('BTN_OPEN error', e); }
});

client.on('interactionCreate', async (i) => {
  if (!i.isStringSelectMenu()) return;
  const s = sessions.get(i.user.id); if (!s || s.finalized) return;

  try {
    if (i.customId === IDS.SEL_TYPE && s.step === 1) {
      s.type = i.values[0]; s.step = 2;
      const { text, components } = stepComponents(s);
      return safeTransition(i, { content: text, components });
    }
    if (i.customId === IDS.SEL_CATEGORY && s.step === 2) {
      s.category = i.values[0]; s.step = 3;
      const { text, components } = stepComponents(s);
      return safeTransition(i, { content: text, components });
    }
    if (i.customId === IDS.SEL_IMPACT && s.step === 3) {
      s.impact = i.values[0]; s.step = 4;
      const { text, components } = stepComponents(s);
      return safeTransition(i, { content: text, components });
    }
    if (i.customId === IDS.SEL_REPRO && s.step === 5) {
      s.repro = i.values[0];
      if (s.repro === 'yes') {
        const modal = new ModalBuilder().setCustomId(IDS.MOD_REPRO).setTitle('Reproduction');
        const field = new TextInputBuilder()
          .setCustomId('repro')
          .setLabel('How did you reproduce this bug?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(field));
        try { return await i.showModal(modal); } catch (err) {
          if (err?.code !== 10062) console.error('showModal REPRO error', err);
          return;
        }
      } else {
        s.step = 6;
        const { text, components } = stepComponents(s);
        return safeTransition(i, { content: text, components });
      }
    }
    if (i.customId === IDS.SEL_SEVERITY && s.step === 6) {
      s.severity = i.values[0]; s.step = 7;
      const { text, components } = stepComponents(s);
      return safeTransition(i, { content: text, components });
    }
    if (i.customId === IDS.SEL_MEDIA && s.step === 7) {
      s.mediaYN = i.values[0];
      try { await i.deferUpdate(); } catch {}

      if (s.mediaYN === 'yes') {
        const parent = await i.guild.channels.fetch(INTAKE_PARENT_CHANNEL).catch(()=>null);
        if (!parent) {
          s.step = 8;
          const { text, components } = stepComponents(s);
          return i.editReply({ content: '❌ INTAKE_PARENT_CHANNEL_ID is invalid.\n' + text, components });
        }

        let t;
        try {
          t = await parent.threads.create({
            name: `Intake – ${s.title || 'Bug Report'}`.slice(0, 80),
            type: ChannelType.PrivateThread,
            autoArchiveDuration: 1440,
            invitable: false,
            reason: `Intake for ${i.user.tag}`
          });
        } catch {
          t = await parent.threads.create({
            name: `Intake – ${s.title || 'Bug Report'}`.slice(0, 80),
            type: ChannelType.PublicThread,
            autoArchiveDuration: 1440,
            reason: `Intake (fallback) for ${i.user.tag}`
          });
        }
        await t.members.add(i.user.id).catch(()=>{});
        s.intakeThreadId = t.id;

        const info = new EmbedBuilder()
          .setTitle('Temporary Intake')
          .setDescription(
            'Please post **ONE** message with your description **and** screenshots/videos/links.\n'
            + 'The intake will **auto-close** after the first message.\n\n'
            + `Then go ${panelJumpText()} and click **Enter version**.`
          );
        await t.send({ content: `<@${i.user.id}>`, embeds: [info] });
      }

      s.step = 8;
      const { text, components } = stepComponents(s);
      return i.editReply({ content: text, components });
    }
  } catch (err) {
    console.error('select error', err);
    if (!i.deferred && !i.replied) {
      await replyEphemeral(i, { content: '❌ Selection failed.' }).catch(()=>{});
    }
  }
});

client.on('interactionCreate', async (i) => {
  const s = sessions.get(i.user.id); if (!s || s.finalized) return;

  try {
    if (i.isButton() && i.customId === IDS.BTN_CONTINUE && s.step === 4) {
      const modal = new ModalBuilder().setCustomId(IDS.MOD_MAIN).setTitle('Bug Details');
      const title = new TextInputBuilder().setCustomId('title').setLabel('Short bug title').setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true);
      const desc  = new TextInputBuilder().setCustomId('desc').setLabel('Detailed description').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(desc),
      );
      try { return await i.showModal(modal); } catch (err) {
        if (err?.code !== 10062) console.error('showModal MAIN error', err);
        return;
      }
    }

    if (i.isButton() && i.customId === IDS.BTN_VERSION && (s.step === 8 || s.step === 9)) {
      const modal = new ModalBuilder().setCustomId(IDS.MOD_VERSION).setTitle('Version');
      const ver = new TextInputBuilder().setCustomId('ver').setLabel('Game version (e.g., v 0.0.16)').setStyle(TextInputStyle.Short).setMaxLength(20).setPlaceholder('v 0.0.16').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(ver));
      try { return await i.showModal(modal); } catch (err) {
        if (err?.code !== 10062) console.error('showModal VERSION error', err);
        return;
      }
    }
  } catch (e) {
    console.error('button error', e);
  }
});

client.on('interactionCreate', async (i) => {
  const s = sessions.get(i.user.id); if (!s) return;
  if (!i.isModalSubmit()) return;

  try {
    if (i.customId === IDS.MOD_MAIN && s.step === 4) {
      s.title = i.fields.getTextInputValue('title');
      s.desc  = i.fields.getTextInputValue('desc');
      s.step  = 5;
      const { text, components } = stepComponents(s);
      return replyEphemeral(i, { content: text, components });
    }

    if (i.customId === IDS.MOD_REPRO && s.step === 5 && s.repro === 'yes') {
      s.reproSteps = i.fields.getTextInputValue('repro');
      s.step = 6;
      const { text, components } = stepComponents(s);
      return replyEphemeral(i, { content: text, components });
    }

    if (i.customId === IDS.MOD_VERSION && (s.step === 8 || s.step === 9)) {
      if (s.posting || s.finalized) {
        return replyEphemeral(i, {
          content: s.threadId
            ? `ℹ️ Your report already exists: <#${s.threadId}>`
            : '⏳ Your report is being created …'
        });
      }
      s.posting = true;

      await i.deferReply({ flags: 64 });
      s.version = i.fields.getTextInputValue('ver');

      const typeObj   = BUG_TYPES.find(t => t.value === s.type);
      const impactObj = IMPACTS.find(x => x.value === s.impact);
      const catObj    = GAME_CATEGORIES.find(c => c.value === s.category);
      const typeEmoji = typeObj?.emoji ?? '🐞';
      const catEmoji  = catObj?.emoji ?? '';
      const category  = s.category ?? 'General';
      const impactTxt = (impactObj?.label || 'UNKNOWN').toUpperCase();
      const threadName = `${typeEmoji}${catEmoji ? ' ' + catEmoji : ''} | Bug-Report | ${category} – ${s.title} [${impactTxt}]`.slice(0, 90);

      const forum = await i.guild.channels.fetch(FORUM_CHANNEL_ID);

      if (s.threadId) {
        s.posting = false; s.finalized = true;
        await i.editReply({
          content: `✔ Bug report already exists: <#${s.threadId}>`,
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open report').setURL(`https://discord.com/channels/${i.guildId}/${s.threadId}`)
          )]
        });
        await followupEphemeral(i, { content: '✔ You can now **dismiss** these bot messages (bottom-right).' });
        return;
      }

      const filesToAttach = (s.files || []).slice(0, 10);
      const thread = await forum.threads.create({
        name: threadName,
        message: {
          content: buildFinalContent(i.user.id, s),
          files: filesToAttach
        },
        reason: `Bug report by ${i.user.tag}`
      });
      s.threadId = thread.id;

      try { await thread.setLocked(true); } catch {}
      try { await thread.setArchived(false); } catch {}

      const starter = await thread.fetchStarterMessage().catch(() => null);
      const eType  = typeObj?.emoji;
      const eImp   = IMPACTS.find(x => x.value === s.impact)?.emojis ?? [];
      const eRepro = REPRO.find(x => x.value === s.repro)?.emojis ?? [];
      const all = [eType, ...eImp, ...eRepro].filter(Boolean);
      if (starter) {
        for (const e of all) { try { await starter.react(e); } catch {} }
        try { await starter.pin(); } catch {}
      }

      s.posting = false; s.finalized = true;

      await i.editReply({
        content: `✔ Bug report created: <#${s.threadId}>`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open report').setURL(`https://discord.com/channels/${i.guildId}/${s.threadId}`)
        )]
      });
      await followupEphemeral(i, { content: '✔ Report created. You can now **dismiss** these bot messages (bottom-right).' });
    }
  } catch (e) {
    console.error('modal submit error', e);
  }
});

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.channel.isThread()) return;

    const entry = [...sessions].find(([, v]) => v.intakeThreadId === msg.channel.id && !v.finalized);
    if (!entry) return;

    const s = entry[1];
    if (s.intakeCaptured) { try { await msg.delete().catch(()=>{}); } catch {} return; }

    s.files = [];
    s.links = [];

    if (msg.attachments?.size) {
      msg.attachments.forEach(a => s.files.push({ attachment: a.url, name: a.name }));
    }
    const found = msg.content?.match(/\bhttps?:\/\/\S+/gi) || [];
    s.links.push(...found);

    s.intakeCaptured = true;
    try {
      await msg.channel.send({
        content: `✅ Thanks! Intake captured.\n↩️ Go ${panelJumpText()} and click **Enter version**.`
      });
      await msg.channel.setLocked(true).catch(()=>{});
      await msg.channel.setArchived(true).catch(()=>{});
    } catch {}
  } catch (e) {
    console.error('intake error', e);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const key = reaction.emoji.id ? reaction.emoji.id : reaction.emoji.name;
    if (!EMOJI_WHITELIST.has(key)) {
      await reaction.users.remove(user.id).catch(()=>{});
    }
  } catch (e) {
    console.error('reaction filter error:', e);
  }
});

process.on('unhandledRejection', (reason) => {
  if (reason?.code === 10062) return;
  console.error('unhandledRejection:', reason);
});
client.on('error', (e) => console.error('client error:', e));

client.login(process.env.DISCORD_TOKEN);
