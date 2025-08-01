import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  InteractionCallbackResource,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { DiscordService } from '../discord.service';
import { EMOJIS, EMOJI_IDS } from '../emoji.constant';

export default {
  data: new SlashCommandBuilder()
    .setName('dungeon-run')
    .setDescription('Create a dungeon run event')
    .addStringOption((option) =>
      option
        .setName('dungeon')
        .setDescription('Name of the dungeon')
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('party-size')
        .setDescription('Party size for the dungeon run')
        .setRequired(false)
        .addChoices(
          { name: '8 Players', value: 8 },
          { name: '24 Players', value: 24 },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Date of the dungeon run (e.g., 2024-01-15)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('Time of the dungeon run (e.g., 20:00)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setDescription('Timezone of the dungeon run')
        .setRequired(false)
        .addChoices(
          { name: 'Bangkok (GMT+7)', value: 'Asia/Bangkok' },
          { name: 'Manila (GMT+8)', value: 'Asia/Manila' },
          { name: 'Tokyo (GMT+9)', value: 'Asia/Tokyo' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('notes')
        .setDescription('Additional notes or requirements')
        .setRequired(false),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    discordService?: DiscordService,
  ) {
    // Get command arguments
    const dungeonName = interaction.options.get('dungeon')?.value as string;
    const partySize = (interaction.options.get('party-size')?.value as number) || 8;
    const date = interaction.options.get('date')?.value as string;
    const time = interaction.options.get('time')?.value as string;
    const timezone = interaction.options.get('timezone')?.value as string || 'Asia/Bangkok';
    const notes = interaction.options.get('notes')?.value as string;

    console.log('Dungeon run command executed by:', interaction.user.tag);

    // Convert date and time to timestamp
    let timestamp = 0;
    
    if (date && time) {
      // Static timezone offsets
      const timezoneOffsets: { [key: string]: number } = {
        'Asia/Bangkok': 7,    // GMT+7
        'Asia/Manila': 8,     // GMT+8
        'Asia/Tokyo': 9,      // GMT+9
      };
      
      // Parse the user's input
      const [year, month, day] = date.split('-').map(Number);
      const [hours, minutes] = time.split(':').map(Number);
      
      // Get the offset for the selected timezone
      const offsetHours = timezoneOffsets[timezone] || 7; // Default to Bangkok
      
      // Create a UTC timestamp by subtracting the timezone offset
      const utcHours = hours - offsetHours;
      
      // Create the date in UTC
      const utcDate = new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0));
      timestamp = Math.floor(utcDate.getTime() / 1000);
    }

    // Create embed for dungeon run event
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Dungeon Run: ${dungeonName}`)
      .setDescription(
        `${timestamp ? `📅 **Date & Time:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n` : ''}👥 **Party Size:** ${partySize} players\n${
          notes ? `📝 **Notes:** ${notes}\n\n` : '\n'
        }**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n**How to Join:**\n• Click the **Join** button to reserve your spot\n• Click your job class button to select your role\n• Party leader can manage participants\n\n**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**`,
      )
      .addFields(
        {
          name: '**PARTY COMPOSITION**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: `${EMOJIS.BLADE} **Blade**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.KNIGHT} **Knight**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.RANGER} **Ranger**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.JESTER} **Jester**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.PSYKEEPER} **Psykeeper**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.ELEMENTOR} **Elementor**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.BILLPOSTER} **Billposter**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.RINGMASTER} **Ringmaster**`,
          value: '```\n🔹 Empty slots\n```',
          inline: false,
        },
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: '👥 **Total Participants** (0/' + partySize + ')',
          value: '```\n🔹 No participants yet\n```',
          inline: false,
        },
      )
      .setColor(0x00ff00)
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.tag} • Select your job class!`,
      });

    // Create control buttons
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dungeon:join')
        .setLabel('Join Party')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('dungeon:itemdrop')
        .setLabel('Item Drop')
        .setEmoji('💎')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dungeon:manage')
        .setLabel('Manage Party')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:close')
        .setLabel('Close Event')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
    );

    // Create job class buttons (row 1)
    const jobClassRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dungeon:job:blade')
        .setLabel('Blade')
        .setEmoji(EMOJI_IDS.BLADE)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:knight')
        .setLabel('Knight')
        .setEmoji(EMOJI_IDS.KNIGHT)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:ranger')
        .setLabel('Ranger')
        .setEmoji(EMOJI_IDS.RANGER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:jester')
        .setLabel('Jester')
        .setEmoji(EMOJI_IDS.JESTER)
        .setStyle(ButtonStyle.Secondary),
    );

    // Create job class buttons (row 2)
    const jobClassRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dungeon:job:psykeeper')
        .setLabel('Psykeeper')
        .setEmoji(EMOJI_IDS.PSYKEEPER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:elementor')
        .setLabel('Elementor')
        .setEmoji(EMOJI_IDS.ELEMENTOR)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:billposter')
        .setLabel('Billposter')
        .setEmoji(EMOJI_IDS.BILLPOSTER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:job:ringmaster')
        .setLabel('Ringmaster')
        .setEmoji(EMOJI_IDS.RINGMASTER)
        .setStyle(ButtonStyle.Secondary),
    );

    // Create a response with the embed and buttons
    const response = await interaction.reply({
      embeds: [embed],
      components: [controlRow, jobClassRow1, jobClassRow2],
      withResponse: true,
    });
    const { message } = response.resource as InteractionCallbackResource;
    if (!message) {
      console.error('Failed to get message from interaction response');
      return;
    }

    // Store dungeon run event in database if discordService is available
    if (discordService) {
      await discordService.createDungeonRun(
        message.id,
        message.channel.id,
        dungeonName,
        partySize,
        notes || '',
        interaction.user.id,
        timestamp,
      );
    }
  },
};