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
import { EMOJIS, EMOJI_IDS, ATTENDANCE_EMOJIS } from '../emoji.constant';

export default {
  data: new SlashCommandBuilder()
    .setName('create-siege')
    .setDescription('Create a siege event')
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Date of the siege (e.g., 2024-01-15)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('Time of the siege (e.g., 20:00)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setDescription('Timezone of the siege')
        .setRequired(false)
        .addChoices(
          { name: 'Bangkok (GMT+7)', value: 'Asia/Bangkok' },
          { name: 'Manila (GMT+8)', value: 'Asia/Manila' },
          { name: 'Tokyo (GMT+9)', value: 'Asia/Tokyo' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('siege-tier')
        .setDescription('Optional siege tier (e.g., 60, 80)')
        .setRequired(false),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    discordService?: DiscordService,
  ) {
    // Get command arguments
    const date = interaction.options.get('date')?.value as string;
    const time = interaction.options.get('time')?.value as string;
    const timezone = interaction.options.get('timezone')?.value as string || 'Asia/Bangkok';
    const siegeTier = interaction.options.get('siege-tier')?.value as string;

    console.log('Create siege command executed by:', interaction.user.tag);

    // Convert date and time to timestamp
    // The user inputs date/time in their selected timezone
    // We need to interpret this as a time in that timezone and convert to UTC timestamp
    
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
    // If the timezone is GMT+7 and user enters 20:00, the UTC time is 13:00
    const utcHours = hours - offsetHours;
    
    // Create the date in UTC
    const utcDate = new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0));
    const timestamp = Math.floor(utcDate.getTime() / 1000);

    // Create embed for siege event
    const embed = new EmbedBuilder()
      .setTitle(
        `<:crown:1400309866983067670>  Guild Siege Event ${siegeTier ? `- ${siegeTier}` : ''}`,
      )
      .setDescription(
        `📅 **Date & Time:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n\n**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n**📋 How to Register:**\n• Click ${ATTENDANCE_EMOJIS.YES} **Attending** button if you're attending\n• Click ${ATTENDANCE_EMOJIS.NO} **Not Attending** button if you can't make it\n• Click your job class button to claim a position\n\n**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**`,
      )
      .addFields(
        {
          name: '**PRINCIPAL POSITIONS**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: `${EMOJIS.BLADE} **Blade**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.KNIGHT} **Knight**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.RANGER} **Ranger**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.JESTER} **Jester**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.PSYKEEPER} **Psykeeper**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.ELEMENTOR} **Elementor**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.BILLPOSTER} **Billposter**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: `${EMOJIS.RINGMASTER} **Ringmaster**`,
          value: '```\n🔹 Empty slot\n```',
          inline: false,
        },
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: '📊 **Registration Status**',
          value: '```\n✅ Attending: 0\n❌ Not Attending: 0\n```',
          inline: false,
        },
      )
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({
        text: '⚔️ Siege Event Registration • Click buttons to participate!',
      });

    // Create attendance buttons
    const attendanceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('siege:attend:yes')
        .setLabel('Attending')
        .setEmoji(ATTENDANCE_EMOJIS.YES)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('siege:attend:no')
        .setLabel('Not Attending')
        .setEmoji(ATTENDANCE_EMOJIS.NO)
        .setStyle(ButtonStyle.Danger),
    );

    // Create job class buttons (row 1)
    const jobClassRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('siege:job:blade')
        .setLabel('Blade')
        .setEmoji(EMOJI_IDS.BLADE)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:knight')
        .setLabel('Knight')
        .setEmoji(EMOJI_IDS.KNIGHT)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:ranger')
        .setLabel('Ranger')
        .setEmoji(EMOJI_IDS.RANGER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:jester')
        .setLabel('Jester')
        .setEmoji(EMOJI_IDS.JESTER)
        .setStyle(ButtonStyle.Secondary),
    );

    // Create job class buttons (row 2)
    const jobClassRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('siege:job:psykeeper')
        .setLabel('Psykeeper')
        .setEmoji(EMOJI_IDS.PSYKEEPER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:elementor')
        .setLabel('Elementor')
        .setEmoji(EMOJI_IDS.ELEMENTOR)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:billposter')
        .setLabel('Billposter')
        .setEmoji(EMOJI_IDS.BILLPOSTER)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('siege:job:ringmaster')
        .setLabel('Ringmaster')
        .setEmoji(EMOJI_IDS.RINGMASTER)
        .setStyle(ButtonStyle.Secondary),
    );

    // Create control buttons row with close button
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('siege:close')
        .setLabel('Close Event')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
    );

    // Create a response with the embed and buttons
    const response = await interaction.reply({
      embeds: [embed],
      components: [attendanceRow, jobClassRow1, jobClassRow2, controlRow],
      withResponse: true,
    });
    const { message } = response.resource as InteractionCallbackResource;
    if (!message) {
      console.error('Failed to get message from interaction response');
      return;
    }

    // Store siege event in database if discordService is available
    if (discordService) {
      await discordService.createSiegeEvent(
        message.id,
        message.channel.id,
        date,
        time,
        siegeTier || '',
        interaction.user.id,
        timestamp,
      );
    }
  },
};
