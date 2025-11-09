import 'dotenv/config';
import { REST, Routes, PermissionFlagsBits, ApplicationCommandOptionType } from 'discord.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function getAppId() {
  const app = await rest.get(Routes.oauth2CurrentApplication());
  return app.id;
}

const commands = [
  {
    name: 'post_panel',
    description: 'Admin: Postet im Forum einen Leitfaden-Thread mit Button „Bug melden“',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'text',
        description: 'Text für den Leitfaden-Starterpost',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ]
  }
];

(async () => {
  const appId = await getAppId();
  await rest.put(
    Routes.applicationGuildCommands(appId, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✔ Admin-Command /post_panel deployed.');
})();
