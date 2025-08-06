import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Client,
  GatewayIntentBits,
  Message,
  MessageReaction,
  User,
  ThreadChannel,
  EmbedBuilder,
  REST,
  Routes,
  CommandInteraction,
  Collection,
  Events,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  ChannelType,
  TextChannel,
} from 'discord.js';
import {
  ThreadEvent,
  ThreadEventDocument,
} from './schemas/thread-event.schema';
import {
  RoleReaction,
  RoleReactionDocument,
} from './schemas/role-reaction.schema';
import { SiegeEvent, SiegeEventDocument } from './schemas/siege-event.schema';
import { DungeonRun, DungeonRunDocument } from './schemas/dungeon-run.schema';
import {
  EMOJI_ID_TO_JOB_CLASS,
  ATTENDANCE_EMOJIS,
  EMOJIS,
  EMOJI_IDS,
} from './emoji.constant';
import { SiegeEventUseCase } from './use-cases/siege-event.use-case';
import { JobClass } from './config/siege.config';

interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    discordService?: DiscordService,
  ) => Promise<void>;
}

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client;
  private commands: Collection<string, SlashCommand>;
  private scheduledEvents = new Map<string, NodeJS.Timeout>(); // messageId -> timeout

  constructor(
    private configService: ConfigService,
    @InjectModel(ThreadEvent.name)
    private threadEventModel: Model<ThreadEventDocument>,
    @InjectModel(RoleReaction.name)
    private roleReactionModel: Model<RoleReactionDocument>,
    @InjectModel(SiegeEvent.name)
    private siegeEventModel: Model<SiegeEventDocument>,
    @InjectModel(DungeonRun.name)
    private dungeonRunModel: Model<DungeonRunDocument>,
    private siegeEventUseCase: SiegeEventUseCase,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });
    this.commands = new Collection();
  }

  async onModuleInit() {
    await this.initializeBot();
    await this.loadCommands();
    await this.registerCommands();
  }

  private async initializeBot() {
    try {
      this.setupEventHandlers();

      const token = this.configService.get<string>('DISCORD_BOT_TOKEN');
      if (!token) {
        this.logger.error(
          'DISCORD_BOT_TOKEN not found in environment variables',
        );
        return;
      }

      await this.client.login(token);
    } catch (error) {
      this.logger.error('Failed to initialize Discord bot:', error);
    }
  }

  private setupEventHandlers() {
    this.client.on('ready', () => {
      // Log the invite link with required permissions
      const clientId = this.configService.get<string>('DISCORD_CLIENT_ID');
      if (clientId) {
        // Permissions needed:
        // - Send Messages (2048)
        // - Manage Messages (8192)
        // - Embed Links (16384)
        // - Read Message History (65536)
        // - Add Reactions (64)
        // - Use Slash Commands (2147483648)
        // - Manage Emojis and Stickers (1073741824)
        // - Create Public Threads (34359738368)
        // - Send Messages in Threads (274877906944)
        // const permissions = '1342179392'; // Combined permissions integer
        // const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
      }
    });

    this.client.on('messageReactionAdd', (reaction, user) => {
      // Fetch the reaction if it's partial
      if (reaction.partial) {
        reaction
          .fetch()
          .then((fetchedReaction) => {
            void this.handleReactionAdd(fetchedReaction, user as User);
          })
          .catch((error) => {
            this.logger.error('Failed to fetch reaction:', error);
          });
      } else {
        void this.handleReactionAdd(reaction, user as User);
      }
    });

    this.client.on(Events.MessageReactionRemove, (reaction, user) => {
      // Fetch the reaction if it's partial
      if (reaction.partial) {
        reaction
          .fetch()
          .then((fetchedReaction) => {
            void this.handleReactionRemove(fetchedReaction, user as User);
          })
          .catch((error) => {
            this.logger.error('Failed to fetch reaction:', error);
          });
      } else {
        void this.handleReactionRemove(reaction, user as User);
      }
    });

    this.client.on(Events.MessageCreate, (message) => {
      this.handleMessage(message);
    });

    this.client.on(Events.MessageReactionRemove, () => {
      // TODO: handle message reaction remove
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isChatInputCommand()) {
        void this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        void this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        void this.handleModalSubmit(interaction);
      } else if (interaction.isStringSelectMenu()) {
        void this.handleStringSelectMenu(interaction);
      }
    });
  }

  private async handleReactionAdd(reaction: MessageReaction, user: User) {
    if (user.bot) return;

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name || reaction.emoji.id;
    const userId = user.id;

    if (!emoji) return; // Skip if emoji name is null

    // Handle siege event reactions
    const siegeEvent = await this.siegeEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (siegeEvent) {
      await this.handleSiegeReaction(reaction, user, 'add');
      return; // Skip other handlers for siege events
    }

    // Handle thread event reactions
    const threadEvent = await this.threadEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (threadEvent) {
      await this.handleThreadReaction(messageId, userId, emoji, 'add');
    }

    // Handle role assignment reactions
    const roleReaction = await this.roleReactionModel.findOne({
      emoji,
      isActive: true,
    });
    if (roleReaction && reaction.message.guild?.id) {
      await this.assignRole(reaction.message.guild.id, userId, emoji);
    }
  }

  private async handleReactionRemove(reaction: MessageReaction, user: User) {
    if (user.bot) return;

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name || reaction.emoji.id;
    const userId = user.id;

    if (!emoji) return; // Skip if emoji name is null

    // Handle siege event reactions
    const siegeEvent = await this.siegeEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (siegeEvent) {
      await this.handleSiegeReaction(reaction, user, 'remove');
      return; // Skip other handlers for siege events
    }

    // Handle thread event reactions
    const threadEvent = await this.threadEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (threadEvent) {
      await this.handleThreadReaction(messageId, userId, emoji, 'remove');
    }

    // Handle role removal reactions
    const roleReaction = await this.roleReactionModel.findOne({
      emoji,
      isActive: true,
    });
    if (roleReaction && reaction.message.guild?.id) {
      await this.removeRole(reaction.message.guild.id, userId, emoji);
    }
  }

  private handleMessage(message: Message) {
    if (message.author.bot) return;

    // Handle thread creation commands
  }

  private async loadCommands() {
    try {
      // Import the create-siege command
      const createSiegeCommand = await import(
        './discord-commands/create-siege.command'
      );
      const dungeonRunCommand = await import(
        './discord-commands/dungeon-run.command'
      );
      // Bind the discord service to the command
      const boundCreateSiegeCommand = {
        ...createSiegeCommand.default,
        execute: (interaction: CommandInteraction) =>
          createSiegeCommand.default.execute(
            interaction as ChatInputCommandInteraction,
            this,
          ),
      };
      this.commands.set(
        createSiegeCommand.default.data.name,
        boundCreateSiegeCommand,
      );
      const boundDungeonRunCommand = {
        ...dungeonRunCommand.default,
        execute: (interaction: CommandInteraction) =>
          dungeonRunCommand.default.execute(
            interaction as ChatInputCommandInteraction,
            this,
          ),
      };
      this.commands.set(
        dungeonRunCommand.default.data.name,
        boundDungeonRunCommand,
      );
    } catch (error) {
      this.logger.error('Error loading commands:', error);
    }
  }

  private async registerCommands() {
    try {
      const token = this.configService.get<string>('DISCORD_BOT_TOKEN');
      const clientId = this.configService.get<string>('DISCORD_CLIENT_ID');

      if (!token || !clientId) {
        this.logger.error(
          'DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not found in environment variables',
        );
        return;
      }

      const rest = new REST().setToken(token);
      const commands = Array.from(this.commands.values()).map((command) =>
        command.data.toJSON(),
      );

      await rest.put(Routes.applicationCommands(clientId), { body: commands });
    } catch (error) {
      this.logger.error('Error registering commands:', error);
    }
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const command = this.commands.get(interaction.commandName);
    if (!command) {
      this.logger.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      this.logger.error(
        `Error executing command ${interaction.commandName}:`,
        error,
      );

      const errorMessage = 'There was an error while executing this command!';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private async handleButtonInteraction(interaction: ButtonInteraction) {
    const customIdParts = interaction.customId.split(':');
    const prefix = customIdParts[0];

    if (prefix === 'siege') {
      await this.handleSiegeButtons(interaction);
    } else if (prefix === 'dungeon') {
      await this.handleDungeonButtons(interaction);
    }
  }

  private async handleModalSubmit(interaction: ModalSubmitInteraction) {
    const customIdParts = interaction.customId.split(':');
    const [prefix, action, messageId] = customIdParts;

    if (prefix === 'dungeon' && action === 'itemdrop') {
      await this.handleDungeonItemDropModal(interaction, messageId);
    }
  }

  private async handleStringSelectMenu(
    interaction: StringSelectMenuInteraction,
  ) {
    const customIdParts = interaction.customId.split(':');
    const [prefix, action, messageId] = customIdParts;

    if (prefix === 'dungeon' && action === 'kick') {
      await this.handleDungeonKickSelectMenu(interaction, messageId);
    }
  }

  private async handleSiegeButtons(interaction: ButtonInteraction) {
    const customIdParts = interaction.customId.split(':');

    if (customIdParts.length < 2) {
      this.logger.error(
        `Invalid siege button customId format: ${interaction.customId}`,
      );
      await interaction.reply({
        content: 'Invalid button configuration.',
        ephemeral: true,
      });
      return;
    }

    const [, type, value] = customIdParts;
    const userId = interaction.user.id;
    const messageId = interaction.message.id;

    this.logger.debug(
      `Handling siege button: type=${type}, value=${value}, userId=${userId}, messageId=${messageId}`,
    );

    try {
      const siegeEvent = await this.siegeEventModel.findOne({
        messageId,
        isActive: true,
      });

      if (!siegeEvent) {
        await interaction.reply({
          content: 'This siege event is no longer active.',
          ephemeral: true,
        });
        return;
      }

      if (type === 'attend') {
        await this.handleSiegeAttendanceButton(
          interaction,
          siegeEvent,
          userId,
          value,
        );
      } else if (type === 'job') {
        await this.handleSiegeJobButton(interaction, siegeEvent, userId, value);
      } else if (type === 'close') {
        await this.handleSiegeCloseButton(interaction, siegeEvent, userId);
        return; // Don't update embed after closing
      }

      // Update the embed with new participant data
      await this.updateSiegeEmbedFromButton(interaction, siegeEvent);
    } catch (error) {
      this.logger.error('Error handling siege button interaction:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        customId: interaction.customId,
        userId: interaction.user.id,
        messageId: interaction.message.id,
      });

      // Check if we can still respond to the interaction
      if (interaction.deferred) {
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      }
    }
  }

  private async handleThreadReaction(
    messageId: string,
    userId: string,
    emoji: string,
    action: 'add' | 'remove',
  ) {
    const threadEvent = await this.threadEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (!threadEvent) return;

    // Get current reactions for this emoji
    const currentReactions = threadEvent.reactions.get(emoji) || [];

    if (action === 'add') {
      // Add user if not already in the list
      if (!currentReactions.includes(userId)) {
        currentReactions.push(userId);
        threadEvent.reactions.set(emoji, currentReactions);

        // Add to participants if not already there
        if (!threadEvent.participants.includes(userId)) {
          threadEvent.participants.push(userId);
        }
      }
    } else {
      // Remove user from reactions
      const userIndex = currentReactions.indexOf(userId);
      if (userIndex > -1) {
        currentReactions.splice(userIndex, 1);
        threadEvent.reactions.set(emoji, currentReactions);
      }
    }

    // Save the updated thread event
    await threadEvent.save();
  }

  private async assignRole(guildId: string, userId: string, emoji: string) {
    try {
      const roleReaction = await this.roleReactionModel.findOne({
        emoji,
        isActive: true,
      });
      if (!roleReaction) return;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const member = await guild.members.fetch(userId);
      const role = guild.roles.cache.get(roleReaction.roleId);

      if (member && role) {
        await member.roles.add(role);
      }
    } catch (error) {
      this.logger.error('Error assigning role:', error);
    }
  }

  private async removeRole(guildId: string, userId: string, emoji: string) {
    try {
      const roleReaction = await this.roleReactionModel.findOne({
        emoji,
        isActive: true,
      });
      if (!roleReaction) return;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const member = await guild.members.fetch(userId);
      const role = guild.roles.cache.get(roleReaction.roleId);

      if (member && role) {
        await member.roles.remove(role);
      }
    } catch (error) {
      this.logger.error('Error removing role:', error);
    }
  }

  private async handleCreateEventCommand(message: Message) {
    try {
      // Parse command: !createevent "Title" "Description" "Duration in hours"
      const content = message.content;
      const matches = content.match(
        /!createevent\s+"([^"]+)"\s+"([^"]+)"\s+"?(\d+)"?/,
      );

      if (!matches) {
        await message.reply(
          'Usage: `!createevent "Event Title" "Event Description" "Duration in hours"`',
        );
        return;
      }

      const [, title, description, durationStr] = matches;
      const duration = parseInt(durationStr);

      if (isNaN(duration) || duration <= 0) {
        await message.reply('Duration must be a positive number of hours.');
        return;
      }

      const endTime = new Date(Date.now() + duration * 60 * 60 * 1000);

      await this.createThreadEvent(
        message.channel,
        title,
        description,
        endTime,
      );
      await message.delete(); // Clean up the command message
    } catch (error) {
      this.logger.error('Error handling create event command:', error);
      await message.reply(
        'Failed to create event. Please check the command format.',
      );
    }
  }

  private async createThreadEvent(
    channel: Message['channel'],
    title: string,
    description: string,
    endTime: Date,
  ) {
    try {
      if (!channel || !channel.isTextBased()) return;

      // Create thread
      if (!('threads' in channel)) {
        throw new Error('Channel does not support threads');
      }
      const thread = await (channel as TextChannel).threads.create({
        name: title,
        autoArchiveDuration: 1440, // 24 hours
        type: ChannelType.PublicThread,
      });

      // Create message template with schedule
      const embed = new EmbedBuilder()
        .setTitle(`🎯 ${title}`)
        .setDescription(description)
        .addFields(
          {
            name: '📅 Event End Time',
            value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '⏰ Time Remaining',
            value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`,
            inline: true,
          },
          { name: '👥 Participants', value: '0', inline: true },
        )
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: 'React to participate!' });

      const message = (await thread.send({ embeds: [embed] })) as Message;

      // Add default reaction emojis
      const defaultReactions = ['✅', '❌', '❓'];
      for (const emoji of defaultReactions) {
        await message.react(emoji);
      }

      // Store thread event data in database
      const threadEvent = new this.threadEventModel({
        threadId: thread.id,
        messageId: message.id,
        title,
        description,
        endTime,
        reactions: new Map(),
        participants: [],
        isActive: true,
      });

      await threadEvent.save();

      // Schedule event end
      const timeout = setTimeout(() => {
        void this.endThreadEvent(message.id);
      }, endTime.getTime() - Date.now());

      this.scheduledEvents.set(message.id, timeout);

      return { threadId: thread.id, messageId: message.id };
    } catch (error) {
      this.logger.error('Error creating thread event:', error);
      throw error;
    }
  }

  private async endThreadEvent(messageId: string) {
    const threadEvent = await this.threadEventModel.findOne({
      messageId,
      isActive: true,
    });
    if (!threadEvent) return;

    // Mark event as inactive
    threadEvent.isActive = false;
    await threadEvent.save();

    try {
      // Get the thread and message
      const thread = this.client.channels.cache.get(
        threadEvent.threadId,
      ) as ThreadChannel;
      if (!thread) return;

      const message = await thread.messages.fetch(messageId);
      if (!message) return;

      // Update embed to show final results
      const finalEmbed = new EmbedBuilder()
        .setTitle(`🏁 ${threadEvent.title} - ENDED`)
        .setDescription(threadEvent.description)
        .addFields(
          {
            name: '📅 Event Ended',
            value: `<t:${Math.floor(threadEvent.endTime.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '👥 Total Participants',
            value: threadEvent.participants.length.toString(),
            inline: true,
          },
        )
        .setColor(0xff0000)
        .setTimestamp()
        .setFooter({ text: 'Event has ended' });

      // Add reaction breakdown
      const reactionBreakdown: string[] = [];
      threadEvent.reactions.forEach((users, emoji) => {
        if (users.length > 0) {
          reactionBreakdown.push(`${emoji}: ${users.length}`);
        }
      });

      if (reactionBreakdown.length > 0) {
        finalEmbed.addFields({
          name: '📊 Reaction Summary',
          value: reactionBreakdown.join('\n'),
          inline: false,
        });
      }

      await message.edit({ embeds: [finalEmbed] });

      // Send summary message
      await thread.send(
        `🏁 **Event "${threadEvent.title}" has ended!**\n📊 Total participants: ${threadEvent.participants.length}`,
      );
    } catch (error) {
      this.logger.error('Error ending thread event:', error);
    }

    // Clean up
    this.scheduledEvents.delete(messageId);
  }

  // Public methods for API endpoints
  async createThreadEventFromAPI(
    channelId: string,
    title: string,
    description: string,
    durationHours: number,
  ) {
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error('Channel not found or not text-based');
      }

      const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);
      const result = await this.createThreadEvent(
        channel,
        title,
        description,
        endTime,
      );

      if (!result) {
        throw new Error('Failed to create thread event');
      }

      return {
        threadId: result.threadId,
        messageId: result.messageId,
        success: true,
        endTime: endTime.toISOString(),
      };
    } catch (error) {
      this.logger.error('Error creating thread event:', error);
      throw error;
    }
  }

  async getThreadEventResults(messageId: string) {
    const threadEvent = await this.threadEventModel.findOne({ messageId });
    if (!threadEvent) {
      throw new Error('Thread event not found');
    }

    const reactionSummary: { [key: string]: number } = {};
    threadEvent.reactions.forEach((users, emoji) => {
      reactionSummary[emoji] = users.length;
    });

    return {
      title: threadEvent.title,
      description: threadEvent.description,
      endTime: threadEvent.endTime.toISOString(),
      isActive: threadEvent.isActive,
      totalParticipants: threadEvent.participants.length,
      reactionBreakdown: reactionSummary,
    };
  }

  async getEventParticipants(messageId: string) {
    const threadEvent = await this.threadEventModel.findOne({ messageId });
    if (!threadEvent) {
      throw new Error('Thread event not found');
    }

    const reactionSummary: { [key: string]: number } = {};
    threadEvent.reactions.forEach((users, emoji) => {
      reactionSummary[emoji] = users.length;
    });

    return {
      eventName: threadEvent.title,
      totalParticipants: threadEvent.participants.length,
      reactionBreakdown: reactionSummary,
      isActive: threadEvent.isActive,
      endTime: threadEvent.endTime.toISOString(),
    };
  }

  async setRoleReaction(emoji: string, roleId: string) {
    // Check if mapping already exists
    const existingMapping = await this.roleReactionModel.findOne({ emoji });

    if (existingMapping) {
      // Update existing mapping
      existingMapping.roleId = roleId;
      existingMapping.isActive = true;
      await existingMapping.save();
    } else {
      // Create new mapping
      const newMapping = new this.roleReactionModel({
        emoji,
        roleId,
        isActive: true,
      });
      await newMapping.save();
    }

    return {
      success: true,
      message: `Role reaction mapping set: ${emoji} -> ${roleId}`,
    };
  }

  getChannelData(channelId: string) {
    // This would typically fetch from a database
    // For now, return mock data structure
    return {
      channelId,
      messageCount: 0,
      activeThreads: 0,
      recentActivity: [],
    };
  }

  async getGuildSummary() {
    try {
      if (!this.client.isReady()) {
        throw new Error('Discord client is not ready');
      }

      const guilds = this.client.guilds.cache;
      const guildData: any[] = [];

      for (const [, guild] of guilds) {
        guildData.push({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size,
          createdAt: guild.createdAt.toISOString(),
        });
      }

      // Get counts from database
      const activeThreadEventsCount =
        await this.threadEventModel.countDocuments({ isActive: true });
      const roleReactionMappingsCount =
        await this.roleReactionModel.countDocuments({ isActive: true });

      return {
        totalGuilds: guilds.size,
        guilds: guildData,
        botStatus: this.client.isReady() ? 'online' : 'offline',
        uptime: this.client.uptime,
        activeThreadEvents: activeThreadEventsCount,
        roleReactionMappings: roleReactionMappingsCount,
      };
    } catch (error) {
      this.logger.error('Error getting guild summary:', error);
      throw error;
    }
  }

  // Alias methods for controller compatibility
  async createVoting(channelId: string, title: string, options: string[]) {
    // Convert voting creation to thread event creation
    const description = `Vote for one of the following options:\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
    return await this.createThreadEventFromAPI(
      channelId,
      title,
      description,
      24,
    ); // 24 hour voting period
  }

  async getVotingResults(messageId: string) {
    return this.getThreadEventResults(messageId);
  }

  async createSiegeEvent(
    messageId: string,
    channelId: string,
    date: string,
    time: string,
    tier: string,
    creatorId: string,
    timestamp?: number,
  ) {
    try {
      await this.siegeEventUseCase.createSiegeEvent(
        messageId,
        channelId,
        date,
        time,
        tier,
        creatorId,
        timestamp || 0,
      );
    } catch (error) {
      this.logger.error('Error creating siege event:', error);
    }
  }

  async createDungeonRun(
    messageId: string,
    channelId: string,
    dungeonName: string,
    maxPlayers: number,
    notes: string,
    creatorId: string,
    timestamp?: number,
  ) {
    try {
      const dungeonRun = new this.dungeonRunModel({
        messageId,
        channelId,
        dungeonName,
        maxPlayers,
        notes,
        creatorId,
        timestamp,
        participants: [],
        jobClasses: new Map(),
        itemDrops: [],
        isActive: true,
      });

      await dungeonRun.save();
    } catch (error) {
      this.logger.error('Error creating dungeon run:', error);
    }
  }

  private async handleSiegeReaction(
    reaction: MessageReaction,
    user: User,
    action: 'add' | 'remove',
  ) {
    try {
      const siegeEvent = await this.siegeEventModel.findOne({
        messageId: reaction.message.id,
        isActive: true,
      });
      if (!siegeEvent) return;

      const userId = user.id;
      const emojiName = reaction.emoji.name;
      const emojiId = reaction.emoji.id;
      const guild = reaction.message.guild;
      if (!guild) return;

      // Handle attendance reactions
      if (emojiName === ATTENDANCE_EMOJIS.YES) {
        if (action === 'add') {
          if (!siegeEvent.attendees.includes(userId)) {
            siegeEvent.attendees.push(userId);
            // Remove from not attending if present
            siegeEvent.notAttending = siegeEvent.notAttending.filter(
              (id) => id !== userId,
            );
            // Remove NO reaction if exists
            try {
              const message = reaction.message as Message;
              const noReaction = message.reactions.cache.find(
                (r) => r.emoji.name === ATTENDANCE_EMOJIS.NO,
              );
              if (noReaction) await noReaction.users.remove(userId);
            } catch {
              // Could not remove NO reaction
            }
          }
        } else {
          siegeEvent.attendees = siegeEvent.attendees.filter(
            (id) => id !== userId,
          );
        }
      } else if (emojiName === ATTENDANCE_EMOJIS.NO) {
        if (action === 'add') {
          if (!siegeEvent.notAttending.includes(userId)) {
            siegeEvent.notAttending.push(userId);
            // Remove from attending if present
            siegeEvent.attendees = siegeEvent.attendees.filter(
              (id) => id !== userId,
            );
            // Remove from all principal positions
            const updatedPrincipals = new Map(siegeEvent.principals);
            let previousJobClass: string | null = null;
            for (const [job, userIds] of updatedPrincipals) {
              const ids = userIds as unknown as string[];
              if (ids.includes(userId)) {
                previousJobClass = job;
                updatedPrincipals.set(
                  job,
                  ids.filter((id) => id !== userId),
                );
                if (
                  (updatedPrincipals.get(job) as unknown as string[])
                    ?.length === 0
                ) {
                  updatedPrincipals.delete(job);
                }
              }
            }
            siegeEvent.principals = updatedPrincipals;

            // Remove YES reaction and job class reactions if exist
            try {
              const message = reaction.message as Message;
              const yesReaction = message.reactions.cache.find(
                (r) => r.emoji.name === ATTENDANCE_EMOJIS.YES,
              );
              if (yesReaction) await yesReaction.users.remove(userId);

              // Remove previous job class reaction
              if (previousJobClass) {
                const emojiKey =
                  previousJobClass.toUpperCase() as keyof typeof EMOJI_IDS;
                const jobEmojiId = EMOJI_IDS[emojiKey];
                const jobReaction = message.reactions.cache.find(
                  (r) => r.emoji.id === jobEmojiId,
                );
                if (jobReaction) await jobReaction.users.remove(userId);
              }
            } catch {
              // Could not remove reactions
            }
          }
        } else {
          siegeEvent.notAttending = siegeEvent.notAttending.filter(
            (id) => id !== userId,
          );
        }
      } else {
        // Handle job class reactions by emoji ID
        const jobClass = emojiId ? EMOJI_ID_TO_JOB_CLASS[emojiId] : null;
        if (jobClass) {
          if (action === 'add') {
            // Find and remove previous job class reaction
            const updatedPrincipals = new Map(siegeEvent.principals);
            let previousJobClass: string | null = null;
            for (const [job, userIds] of updatedPrincipals) {
              const ids = userIds as unknown as string[];
              if (ids.includes(userId) && job !== jobClass) {
                previousJobClass = job;
                updatedPrincipals.set(
                  job,
                  ids.filter((id) => id !== userId),
                );
                if (
                  (updatedPrincipals.get(job) as unknown as string[])
                    ?.length === 0
                ) {
                  updatedPrincipals.delete(job);
                }
              }
            }

            // Remove previous job class reaction from Discord
            if (previousJobClass && previousJobClass !== jobClass) {
              try {
                const message = reaction.message as Message;
                const previousEmojiKey =
                  previousJobClass.toUpperCase() as keyof typeof EMOJI_IDS;
                const previousEmojiId = EMOJI_IDS[previousEmojiKey];
                const previousReaction = message.reactions.cache.find(
                  (r) => r.emoji.id === previousEmojiId,
                );
                if (previousReaction)
                  await previousReaction.users.remove(userId);
              } catch {
                // Could not remove previous job reaction
              }
            }

            // Add to new position
            const currentUsers =
              (updatedPrincipals.get(jobClass) as unknown as string[]) || [];
            if (!currentUsers.includes(userId)) {
              currentUsers.push(userId);
              updatedPrincipals.set(jobClass, currentUsers);
            }
            siegeEvent.principals = updatedPrincipals;

            // Auto-add to attendees if not already
            if (!siegeEvent.attendees.includes(userId)) {
              siegeEvent.attendees.push(userId);
              // Also add YES reaction
              try {
                const message = reaction.message as Message;
                await message.react(ATTENDANCE_EMOJIS.YES);
                // Remove NO reaction if exists
                const noReaction = message.reactions.cache.find(
                  (r) => r.emoji.name === ATTENDANCE_EMOJIS.NO,
                );
                if (noReaction) await noReaction.users.remove(userId);
              } catch {
                // Could not manage attendance reactions
              }
            }

            // Remove from not attending
            siegeEvent.notAttending = siegeEvent.notAttending.filter(
              (id) => id !== userId,
            );
          } else {
            // Remove from position
            const updatedPrincipals = new Map(siegeEvent.principals);
            const userIds =
              (updatedPrincipals.get(jobClass) as unknown as string[]) || [];
            if (userIds.includes(userId)) {
              updatedPrincipals.set(
                jobClass,
                userIds.filter((id) => id !== userId),
              );
              if (
                (updatedPrincipals.get(jobClass) as unknown as string[])
                  ?.length === 0
              ) {
                updatedPrincipals.delete(jobClass);
              }
              siegeEvent.principals = updatedPrincipals;
            }
          }
        }
      }

      await siegeEvent.save();

      // Update the embed
      await this.updateSiegeEmbed(
        reaction.message as Message,
        siegeEvent,
        guild,
      );
    } catch (error) {
      this.logger.error('Error handling siege reaction:', error);
    }
  }

  private async updateSiegeEmbed(
    message: Message,
    siegeEvent: SiegeEventDocument,
    guild: NonNullable<Message['guild']>,
  ) {
    try {
      const embed = EmbedBuilder.from(message.embeds[0]);

      // Update principal positions
      const jobClasses = [
        'Blade',
        'Knight',
        'Ranger',
        'Jester',
        'Psykeeper',
        'Elementor',
        'Billposter',
        'Ringmaster',
      ];
      const fields = [
        {
          name: '**PRINCIPAL POSITIONS**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
      ];

      for (const jobClass of jobClasses) {
        const userIds =
          (siegeEvent.principals.get(jobClass) as unknown as string[]) || [];
        let value = '```\n🔹 Empty slot\n```';

        if (userIds.length > 0) {
          const userNames: string[] = [];
          for (const userId of userIds) {
            try {
              const member = await guild.members.fetch(userId);
              const displayName = member.displayName || member.user.username;
              userNames.push(`✅ ${displayName}`);
            } catch {
              userNames.push(`✅ User ${userId}`);
            }
          }
          value = `\`\`\`\n${userNames.join('\n')}\n\`\`\``;
        }

        // Get the corresponding emoji from constants
        const emojiKey = jobClass.toUpperCase() as keyof typeof EMOJIS;
        const emoji = EMOJIS[emojiKey] || '';

        fields.push({
          name: `${emoji} **${jobClass}**`,
          value: value,
          inline: false,
        });
      }

      // Add divider and summary
      fields.push(
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: '📊 **Registration Status**',
          value: `\`\`\`\n✅ Attending: ${siegeEvent.attendees.length}\n❌ Not Attending: ${siegeEvent.notAttending.length}\n\`\`\``,
          inline: false,
        },
      );

      // Add participant lists
      if (
        siegeEvent.attendees.length > 0 ||
        siegeEvent.notAttending.length > 0
      ) {
        fields.push({
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        });

        // Show attending list
        if (siegeEvent.attendees.length > 0) {
          const attendeeNames: string[] = [];
          for (const userId of siegeEvent.attendees) {
            try {
              const member = await guild.members.fetch(userId);
              const name = member.displayName || member.user.username;
              // Check if they have a principal position
              let position = '';
              for (const [job, userIds] of siegeEvent.principals) {
                const ids = userIds as unknown as string[];
                if (ids.includes(userId)) {
                  const emojiKey = job.toUpperCase() as keyof typeof EMOJIS;
                  position = ` ${EMOJIS[emojiKey]}`;
                  break;
                }
              }
              attendeeNames.push(`• ${name}${position}`);
            } catch {
              attendeeNames.push(`• User ${userId}`);
            }
          }

          // Split into chunks if too many attendees
          const chunks: string[] = [];
          for (let i = 0; i < attendeeNames.length; i += 10) {
            chunks.push(attendeeNames.slice(i, i + 10).join('\n'));
          }

          chunks.forEach((chunk, index) => {
            fields.push({
              name: index === 0 ? '✅ **Attending**' : '\u200B',
              value: chunk || 'None',
              inline: false,
            });
          });
        }

        // Show not attending list
        if (siegeEvent.notAttending.length > 0) {
          const notAttendingNames: string[] = [];
          for (const userId of siegeEvent.notAttending) {
            try {
              const member = await guild.members.fetch(userId);
              const name = member.displayName || member.user.username;
              notAttendingNames.push(`• ${name}`);
            } catch {
              notAttendingNames.push(`• User ${userId}`);
            }
          }

          fields.push({
            name: '❌ **Not Attending**',
            value: notAttendingNames.join('\n') || 'None',
            inline: false,
          });
        }
      }

      embed.setFields(fields);
      await message.edit({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error updating siege embed:', error);
    }
  }

  private async handleSiegeAttendanceButton(
    interaction: ButtonInteraction,
    siegeEvent: SiegeEventDocument,
    userId: string,
    value: string,
  ) {
    const isAttending = value === 'yes';

    if (isAttending) {
      // Add to attendees
      if (!siegeEvent.attendees.includes(userId)) {
        siegeEvent.attendees.push(userId);
      }
      // Remove from not attending
      siegeEvent.notAttending = siegeEvent.notAttending.filter(
        (id) => id !== userId,
      );
    } else {
      // Add to not attending
      if (!siegeEvent.notAttending.includes(userId)) {
        siegeEvent.notAttending.push(userId);
      }
      // Remove from attendees
      siegeEvent.attendees = siegeEvent.attendees.filter((id) => id !== userId);
      // Also remove from any principal positions
      for (const [jobClass, userIds] of siegeEvent.principals) {
        const ids = userIds as unknown as string[];
        const filtered = ids.filter((id) => id !== userId);
        if (filtered.length !== ids.length) {
          siegeEvent.principals.set(jobClass, filtered);
        }
      }
    }

    await siegeEvent.save();
    await interaction.deferUpdate();
  }

  private async handleSiegeJobButton(
    interaction: ButtonInteraction,
    siegeEvent: SiegeEventDocument,
    userId: string,
    jobName: string,
  ) {
    const jobClass = (jobName.charAt(0).toUpperCase() +
      jobName.slice(1)) as JobClass;

    await this.siegeEventUseCase.handleJobSelection(
      siegeEvent,
      userId,
      jobClass,
    );

    // Just defer the interaction for all actions
    await interaction.deferUpdate();
  }

  private async handleSiegeCloseButton(
    interaction: ButtonInteraction,
    siegeEvent: SiegeEventDocument,
    userId: string,
  ) {
    // Check if the user is the creator
    if (siegeEvent.creatorId !== userId) {
      await interaction.reply({
        content: 'Only the event creator can close this siege event.',
        ephemeral: true,
      });
      return;
    }

    // Mark the event as inactive
    siegeEvent.isActive = false;
    await siegeEvent.save();

    // Remove all buttons from the message
    const message = interaction.message;
    const embed = EmbedBuilder.from(message.embeds[0]);

    // Add closed status to the embed
    embed.setFooter({
      text: '🔒 Event Closed • Registration has ended',
    });

    // Update the message without any components (buttons)
    await interaction.update({
      embeds: [embed],
      components: [], // This removes all buttons
    });
  }

  private async updateSiegeEmbedFromButton(
    interaction: ButtonInteraction,
    siegeEvent: SiegeEventDocument,
  ) {
    try {
      const message = interaction.message;
      const guild = interaction.guild;
      if (!guild) return;

      const embed = EmbedBuilder.from(message.embeds[0]);

      // Update principal positions
      const jobClasses = [
        'Blade',
        'Knight',
        'Ranger',
        'Jester',
        'Psykeeper',
        'Elementor',
        'Billposter',
        'Ringmaster',
      ];
      const fields = [
        {
          name: '**PRINCIPAL POSITIONS**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
      ];

      for (const jobClass of jobClasses) {
        const userIds =
          (siegeEvent.principals.get(jobClass) as unknown as string[]) || [];
        let value = '```\n🔹 Empty slot\n```';

        if (userIds.length > 0) {
          const userNames: string[] = [];
          for (const userId of userIds) {
            try {
              const member = await guild.members.fetch(userId);
              userNames.push(
                `🔸 ${member.displayName || member.user.username}`,
              );
            } catch {
              userNames.push(`🔸 <@${userId}>`);
            }
          }
          value = '```\n' + userNames.join('\n') + '\n```';
        }

        const emojiKey = jobClass.toUpperCase() as keyof typeof EMOJIS;
        const emoji = EMOJIS[emojiKey] || '';

        fields.push({
          name: `${emoji} **${jobClass}** (${userIds.length})`,
          value,
          inline: false,
        });
      }

      fields.push(
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: '📊 **Registration Status**',
          value: `\`\`\`\n✅ Attending: ${siegeEvent.attendees.length}\n❌ Not Attending: ${siegeEvent.notAttending.length}\n\`\`\``,
          inline: false,
        },
      );

      // Add participant lists
      if (
        siegeEvent.attendees.length > 0 ||
        siegeEvent.notAttending.length > 0
      ) {
        fields.push({
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        });

        // Show attending list
        if (siegeEvent.attendees.length > 0) {
          const attendeeNames: string[] = [];
          for (const userId of siegeEvent.attendees) {
            try {
              const member = await guild.members.fetch(userId);
              const name = member.displayName || member.user.username;
              // Check if they have a principal or candidate position
              let position = '';
              // let isCandidate = false;

              // Check principal positions first
              for (const [job, userIds] of siegeEvent.principals) {
                const ids = userIds as unknown as string[];
                if (ids.includes(userId)) {
                  const emojiKey = job.toUpperCase() as keyof typeof EMOJIS;
                  position = ` ${EMOJIS[emojiKey] || ''}`;
                  break;
                }
              }

              attendeeNames.push(`• ${name}${position}`);
            } catch {
              attendeeNames.push(`• <@${userId}>`);
            }
          }

          fields.push({
            name: '✅ **Attending**',
            value: attendeeNames.join('\n') || 'None',
            inline: false,
          });
        }

        // Show not attending list
        if (siegeEvent.notAttending.length > 0) {
          const notAttendingNames: string[] = [];
          for (const userId of siegeEvent.notAttending) {
            try {
              const member = await guild.members.fetch(userId);
              notAttendingNames.push(
                `• ${member.displayName || member.user.username}`,
              );
            } catch {
              notAttendingNames.push(`• <@${userId}>`);
            }
          }

          fields.push({
            name: '❌ **Not Attending**',
            value: notAttendingNames.join('\n') || 'None',
            inline: false,
          });
        }
      }

      embed.setFields(fields);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error updating siege embed:', error);
    }
  }

  private async handleDungeonButtons(interaction: ButtonInteraction) {
    const customIdParts = interaction.customId.split(':');

    if (customIdParts.length < 2) {
      this.logger.error(
        `Invalid dungeon button customId format: ${interaction.customId}`,
      );
      await interaction.reply({
        content: 'Invalid button configuration.',
        ephemeral: true,
      });
      return;
    }

    const [, type, value] = customIdParts;
    const userId = interaction.user.id;
    const messageId = interaction.message.id;

    this.logger.debug(
      `Handling dungeon button: type=${type}, value=${value}, userId=${userId}, messageId=${messageId}`,
    );

    try {
      const dungeonRun = await this.dungeonRunModel.findOne({
        messageId,
        isActive: true,
      });

      if (!dungeonRun) {
        await interaction.reply({
          content: 'This dungeon run is no longer active.',
          ephemeral: true,
        });
        return;
      }

      if (type === 'join') {
        await this.handleDungeonJoinButton(interaction, dungeonRun, userId);
      } else if (type === 'close') {
        await this.handleDungeonCloseButton(interaction, dungeonRun, userId);
      } else if (type === 'job') {
        await this.handleDungeonJobButton(
          interaction,
          dungeonRun,
          userId,
          value,
        );
      } else if (type === 'itemdrop') {
        await this.handleDungeonItemDropButton(interaction, dungeonRun, userId);
      } else if (type === 'manage') {
        await this.handleDungeonManageButton(interaction, dungeonRun, userId);
      }
    } catch (error) {
      this.logger.error('Error handling dungeon button:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        customId: interaction.customId,
        userId: interaction.user.id,
        messageId: interaction.message.id,
      });

      // Check if we can still respond to the interaction
      if (interaction.deferred) {
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      }
    }
  }

  private async handleDungeonJoinButton(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
    userId: string,
  ) {
    // Defer the interaction first to allow for followup messages
    await interaction.deferUpdate();

    const isJoined = dungeonRun.participants.includes(userId);

    if (isJoined) {
      // Leave the dungeon run
      dungeonRun.participants = dungeonRun.participants.filter(
        (id) => id !== userId,
      );

      // Also remove from all job classes
      for (const [job, users] of dungeonRun.jobClasses) {
        const index = users.indexOf(userId);
        if (index > -1) {
          users.splice(index, 1);
          dungeonRun.jobClasses.set(job, users);
        }
      }

      await dungeonRun.save();

      // Update the embed using deferred method
      await this.updateDungeonEmbedDeferred(interaction, dungeonRun);

      // Then send followup message
      await interaction.followUp({
        content: 'You have left the dungeon run.',
        ephemeral: true,
      });
    } else {
      // Check if full
      if (dungeonRun.participants.length >= dungeonRun.maxPlayers) {
        await interaction.followUp({
          content: 'This dungeon run is full.',
          ephemeral: true,
        });
        return;
      }

      // Join the dungeon run
      dungeonRun.participants.push(userId);
      await dungeonRun.save();

      // Update the embed using deferred method
      await this.updateDungeonEmbedDeferred(interaction, dungeonRun);

      // Then send followup message
      await interaction.followUp({
        content: 'You have joined the dungeon run!',
        ephemeral: true,
      });
    }
  }

  private async handleDungeonCloseButton(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
    userId: string,
  ) {
    // Check if the user is the creator
    if (dungeonRun.creatorId !== userId) {
      await interaction.reply({
        content: 'Only the event creator can close this dungeon run.',
        ephemeral: true,
      });
      return;
    }

    // Mark the event as inactive
    dungeonRun.isActive = false;
    await dungeonRun.save();

    // Remove all buttons from the message
    const message = interaction.message;
    const embed = EmbedBuilder.from(message.embeds[0]);

    // Add closed status to the embed
    embed.setFooter({
      text: '🔒 Event Closed • Dungeon run has ended',
    });

    // Update the message without any components (buttons)
    await interaction.update({
      embeds: [embed],
      components: [], // This removes all buttons
    });
  }

  private async handleDungeonJobButton(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
    userId: string,
    jobClass: string,
  ) {
    // Defer the interaction first to allow for followup messages
    await interaction.deferUpdate();

    // Check if user is already in this job class
    const currentJobUsers = dungeonRun.jobClasses.get(jobClass) || [];
    const isInThisJob = currentJobUsers.includes(userId);

    if (isInThisJob) {
      // Remove user from this job class (toggle off)
      const index = currentJobUsers.indexOf(userId);
      if (index > -1) {
        currentJobUsers.splice(index, 1);
        dungeonRun.jobClasses.set(jobClass, currentJobUsers);
      }

      await dungeonRun.save();
      await this.updateDungeonEmbedDeferred(interaction, dungeonRun);

      await interaction.followUp({
        content: `You have left the ${jobClass} position.`,
        ephemeral: true,
      });
    } else {
      // Check if party is full (only if user is not already in)
      if (!dungeonRun.participants.includes(userId)) {
        if (dungeonRun.participants.length >= dungeonRun.maxPlayers) {
          await interaction.followUp({
            content: 'This dungeon run is full.',
            ephemeral: true,
          });
          return;
        }

        // Auto-add user to participants
        dungeonRun.participants.push(userId);
      }

      // Remove user from all other job classes
      for (const [job, users] of dungeonRun.jobClasses) {
        if (job !== jobClass) {
          const index = users.indexOf(userId);
          if (index > -1) {
            users.splice(index, 1);
            dungeonRun.jobClasses.set(job, users);
          }
        }
      }

      // Add user to the selected job class
      currentJobUsers.push(userId);
      dungeonRun.jobClasses.set(jobClass, currentJobUsers);

      await dungeonRun.save();
      await this.updateDungeonEmbedDeferred(interaction, dungeonRun);

      await interaction.followUp({
        content: `You have joined as ${jobClass}!`,
        ephemeral: true,
      });
    }
  }

  private async handleDungeonItemDropButton(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
    userId: string,
  ) {
    // Check if user is a party member
    if (!dungeonRun.participants.includes(userId)) {
      await interaction.reply({
        content: 'Only party members can record item drops.',
        ephemeral: true,
      });
      return;
    }

    // Create modal for item drop
    const modal = new ModalBuilder()
      .setCustomId(`dungeon:itemdrop:${dungeonRun.messageId}`)
      .setTitle('Record Item Drop');

    // Item drop input
    const itemDropInput = new TextInputBuilder()
      .setCustomId('itemDrop')
      .setLabel('Item Drop Details')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        'Enter item name and who got it\nEx: Legendary Sword - @Player1',
      )
      .setRequired(true);

    // Add input to modal
    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      itemDropInput,
    );
    modal.addComponents(actionRow);

    // Show modal
    await interaction.showModal(modal);
  }

  private async handleDungeonManageButton(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
    userId: string,
  ) {
    // Check if user is the creator
    if (dungeonRun.creatorId !== userId) {
      await interaction.reply({
        content: 'Only the party leader can manage party members.',
        ephemeral: true,
      });
      return;
    }

    // Check if there are participants to manage
    if (dungeonRun.participants.length === 0) {
      await interaction.reply({
        content: 'No party members to manage.',
        ephemeral: true,
      });
      return;
    }

    // Create string select menu with party members
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`dungeon:kick:${dungeonRun.messageId}`)
      .setPlaceholder('Select a member to kick')
      .setMinValues(1)
      .setMaxValues(1);

    // Add party members as options (excluding the creator)
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'Could not fetch guild information.',
        ephemeral: true,
      });
      return;
    }

    for (const participantId of dungeonRun.participants) {
      // Skip the creator
      if (participantId === dungeonRun.creatorId) continue;

      try {
        const member = await guild.members.fetch(participantId);
        selectMenu.addOptions({
          label: member.displayName || member.user.username,
          description: `Kick ${member.user.username} from the party`,
          value: participantId,
        });
      } catch {
        selectMenu.addOptions({
          label: `User ${participantId}`,
          description: `Kick user from the party`,
          value: participantId,
        });
      }
    }

    // Check if there are any members to kick
    if (selectMenu.options.length === 0) {
      await interaction.reply({
        content: 'No party members to manage (you cannot kick yourself).',
        ephemeral: true,
      });
      return;
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    await interaction.reply({
      content: '**Select a party member to kick:**',
      components: [row],
      ephemeral: true,
    });
  }

  private async updateDungeonEmbed(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
  ) {
    try {
      const message = interaction.message;
      const guild = interaction.guild;
      if (!guild) return;

      const embed = EmbedBuilder.from(message.embeds[0]);

      // Update participants field
      let participantsList = '```\n🔹 No participants yet\n```';

      if (dungeonRun.participants.length > 0) {
        const participantNames: string[] = [];
        for (const userId of dungeonRun.participants) {
          try {
            const member = await guild.members.fetch(userId);
            participantNames.push(
              `🔸 ${member.displayName || member.user.username}`,
            );
          } catch {
            participantNames.push(`🔸 <@${userId}>`);
          }
        }
        participantsList = '```\n' + participantNames.join('\n') + '\n```';
      }

      // Job classes to display
      const jobClasses = [
        'blade',
        'knight',
        'ranger',
        'jester',
        'psykeeper',
        'elementor',
        'billposter',
        'ringmaster',
      ];
      const fields = [
        {
          name: '**PARTY COMPOSITION**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
      ];

      // Add job class fields
      for (const jobClass of jobClasses) {
        const jobUsers = dungeonRun.jobClasses.get(jobClass) || [];
        let jobList = '```\n🔹 Empty slots\n```';

        if (jobUsers.length > 0) {
          const userNames: string[] = [];
          for (const userId of jobUsers) {
            try {
              const member = await guild.members.fetch(userId);
              userNames.push(
                `🔸 ${member.displayName || member.user.username}`,
              );
            } catch {
              userNames.push(`🔸 <@${userId}>`);
            }
          }
          jobList = '```\n' + userNames.join('\n') + '\n```';
        }

        const emojiMap: { [key: string]: string } = {
          blade: EMOJIS.BLADE,
          knight: EMOJIS.KNIGHT,
          ranger: EMOJIS.RANGER,
          jester: EMOJIS.JESTER,
          psykeeper: EMOJIS.PSYKEEPER,
          elementor: EMOJIS.ELEMENTOR,
          billposter: EMOJIS.BILLPOSTER,
          ringmaster: EMOJIS.RINGMASTER,
        };

        const emoji = emojiMap[jobClass] || '';

        fields.push({
          name: `${emoji} **${jobClass.charAt(0).toUpperCase() + jobClass.slice(1)}**`,
          value: jobList,
          inline: false,
        });
      }

      // Add separator and total participants
      fields.push(
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: `👥 **Total Participants** (${dungeonRun.participants.length}/${dungeonRun.maxPlayers})`,
          value: participantsList,
          inline: false,
        },
      );

      // Add item drops if any
      if (dungeonRun.itemDrops && dungeonRun.itemDrops.length > 0) {
        let itemDropsList = dungeonRun.itemDrops.join('\n');
        // Limit to last 10 drops if too many
        if (dungeonRun.itemDrops.length > 10) {
          const recentDrops = dungeonRun.itemDrops.slice(-10);
          itemDropsList =
            recentDrops.join('\n') + '\n\n*...and more (showing last 10)*';
        }

        fields.push(
          {
            name: '\u200B',
            value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            inline: false,
          },
          {
            name: '💎 **Item Drops**',
            value: '```\n' + itemDropsList + '\n```',
            inline: false,
          },
        );
      }

      embed.setFields(fields);
      await interaction.update({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error updating dungeon embed:', error);
    }
  }

  private async updateDungeonEmbedDeferred(
    interaction: ButtonInteraction,
    dungeonRun: DungeonRunDocument,
  ) {
    try {
      const message = interaction.message;
      const guild = interaction.guild;
      if (!guild) return;

      const embed = EmbedBuilder.from(message.embeds[0]);

      // Update participants field
      let participantsList = '```\n🔹 No participants yet\n```';

      if (dungeonRun.participants.length > 0) {
        const participantNames: string[] = [];
        for (const userId of dungeonRun.participants) {
          try {
            const member = await guild.members.fetch(userId);
            participantNames.push(
              `🔸 ${member.displayName || member.user.username}`,
            );
          } catch {
            participantNames.push(`🔸 <@${userId}>`);
          }
        }
        participantsList = '```\n' + participantNames.join('\n') + '\n```';
      }

      // Job classes to display
      const jobClasses = [
        'blade',
        'knight',
        'ranger',
        'jester',
        'psykeeper',
        'elementor',
        'billposter',
        'ringmaster',
      ];
      const fields = [
        {
          name: '**PARTY COMPOSITION**',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
      ];

      // Add job class fields
      for (const jobClass of jobClasses) {
        const jobUsers = dungeonRun.jobClasses.get(jobClass) || [];
        let jobList = '```\n🔹 Empty slots\n```';

        if (jobUsers.length > 0) {
          const userNames: string[] = [];
          for (const userId of jobUsers) {
            try {
              const member = await guild.members.fetch(userId);
              userNames.push(
                `🔸 ${member.displayName || member.user.username}`,
              );
            } catch {
              userNames.push(`🔸 <@${userId}>`);
            }
          }
          jobList = '```\n' + userNames.join('\n') + '\n```';
        }

        const emojiMap: { [key: string]: string } = {
          blade: EMOJIS.BLADE,
          knight: EMOJIS.KNIGHT,
          ranger: EMOJIS.RANGER,
          jester: EMOJIS.JESTER,
          psykeeper: EMOJIS.PSYKEEPER,
          elementor: EMOJIS.ELEMENTOR,
          billposter: EMOJIS.BILLPOSTER,
          ringmaster: EMOJIS.RINGMASTER,
        };

        const emoji = emojiMap[jobClass] || '';

        fields.push({
          name: `${emoji} **${jobClass.charAt(0).toUpperCase() + jobClass.slice(1)}**`,
          value: jobList,
          inline: false,
        });
      }

      // Add separator and total participants
      fields.push(
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: `👥 **Total Participants** (${dungeonRun.participants.length}/${dungeonRun.maxPlayers})`,
          value: participantsList,
          inline: false,
        },
      );

      // Add item drops if any
      if (dungeonRun.itemDrops && dungeonRun.itemDrops.length > 0) {
        let itemDropsList = dungeonRun.itemDrops.join('\n');
        // Limit to last 10 drops if too many
        if (dungeonRun.itemDrops.length > 10) {
          const recentDrops = dungeonRun.itemDrops.slice(-10);
          itemDropsList =
            recentDrops.join('\n') + '\n\n*...and more (showing last 10)*';
        }

        fields.push(
          {
            name: '\u200B',
            value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            inline: false,
          },
          {
            name: '💎 **Item Drops**',
            value: '```\n' + itemDropsList + '\n```',
            inline: false,
          },
        );
      }

      embed.setFields(fields);
      // When interaction is deferred, edit the message directly
      await interaction.message.edit({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error updating dungeon embed:', error);
    }
  }

  private async handleDungeonItemDropModal(
    interaction: ModalSubmitInteraction,
    messageId: string,
  ) {
    try {
      // Get the dungeon run
      const dungeonRun = await this.dungeonRunModel.findOne({
        messageId,
        isActive: true,
      });

      if (!dungeonRun) {
        await interaction.reply({
          content: 'This dungeon run is no longer active.',
          ephemeral: true,
        });
        return;
      }

      // Get item drop input
      const itemDropText = interaction.fields.getTextInputValue('itemDrop');

      // Add timestamp to the item drop
      const timestamp = new Date().toLocaleString();
      const newItemDrop = `[${timestamp}] ${itemDropText}`;

      // Initialize itemDrops array if it doesn't exist
      if (!dungeonRun.itemDrops) {
        dungeonRun.itemDrops = [];
      }

      // Add the new item drop
      dungeonRun.itemDrops.push(newItemDrop);

      // Save changes
      await dungeonRun.save();

      // Update the embed
      const message = await interaction.channel?.messages.fetch(messageId);
      if (message) {
        // Create a proper update for the message
        const embed = EmbedBuilder.from(message.embeds[0]);

        // Rebuild all fields
        const guild = interaction.guild;
        if (!guild) {
          await interaction.reply({
            content: 'Could not update the message.',
            ephemeral: true,
          });
          return;
        }

        // Get participants list
        let participantsList = '```\n🔹 No participants yet\n```';
        if (dungeonRun.participants.length > 0) {
          const participantNames: string[] = [];
          for (const userId of dungeonRun.participants) {
            try {
              const member = await guild.members.fetch(userId);
              participantNames.push(
                `🔸 ${member.displayName || member.user.username}`,
              );
            } catch {
              participantNames.push(`🔸 <@${userId}>`);
            }
          }
          participantsList = '```\n' + participantNames.join('\n') + '\n```';
        }

        // Job classes to display
        const jobClasses = [
          'blade',
          'knight',
          'ranger',
          'jester',
          'psykeeper',
          'elementor',
          'billposter',
          'ringmaster',
        ];
        const fields = [
          {
            name: '**PARTY COMPOSITION**',
            value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            inline: false,
          },
        ];

        // Add job class fields
        for (const jobClass of jobClasses) {
          const jobUsers = dungeonRun.jobClasses.get(jobClass) || [];
          let jobList = '```\n🔹 Empty slots\n```';

          if (jobUsers.length > 0) {
            const userNames: string[] = [];
            for (const userId of jobUsers) {
              try {
                const member = await guild.members.fetch(userId);
                userNames.push(
                  `🔸 ${member.displayName || member.user.username}`,
                );
              } catch {
                userNames.push(`🔸 <@${userId}>`);
              }
            }
            jobList = '```\n' + userNames.join('\n') + '\n```';
          }

          const emojiMap: { [key: string]: string } = {
            blade: EMOJIS.BLADE,
            knight: EMOJIS.KNIGHT,
            ranger: EMOJIS.RANGER,
            jester: EMOJIS.JESTER,
            psykeeper: EMOJIS.PSYKEEPER,
            elementor: EMOJIS.ELEMENTOR,
            billposter: EMOJIS.BILLPOSTER,
            ringmaster: EMOJIS.RINGMASTER,
          };

          const emoji = emojiMap[jobClass] || '';

          fields.push({
            name: `${emoji} **${jobClass.charAt(0).toUpperCase() + jobClass.slice(1)}**`,
            value: jobList,
            inline: false,
          });
        }

        // Add separator and total participants
        fields.push(
          {
            name: '\u200B',
            value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            inline: false,
          },
          {
            name: `👥 **Total Participants** (${dungeonRun.participants.length}/${dungeonRun.maxPlayers})`,
            value: participantsList,
            inline: false,
          },
        );

        // Add item drops if any
        if (dungeonRun.itemDrops && dungeonRun.itemDrops.length > 0) {
          let itemDropsList = dungeonRun.itemDrops.join('\n');
          // Limit to last 10 drops if too many
          if (dungeonRun.itemDrops.length > 10) {
            const recentDrops = dungeonRun.itemDrops.slice(-10);
            itemDropsList =
              recentDrops.join('\n') + '\n\n*...and more (showing last 10)*';
          }

          fields.push(
            {
              name: '\u200B',
              value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
              inline: false,
            },
            {
              name: '💎 **Item Drops**',
              value: '```\n' + itemDropsList + '\n```',
              inline: false,
            },
          );
        }

        embed.setFields(fields);
        await message.edit({ embeds: [embed] });
      }

      // Send confirmation
      await interaction.reply({
        content: '💎 Item drop recorded successfully!',
        ephemeral: true,
      });
    } catch (error) {
      this.logger.error('Error handling dungeon item drop modal:', error);
      await interaction.reply({
        content: 'An error occurred while recording the item drop.',
        ephemeral: true,
      });
    }
  }

  private async handleDungeonKickSelectMenu(
    interaction: StringSelectMenuInteraction,
    messageId: string,
  ) {
    try {
      // Get the dungeon run
      const dungeonRun = await this.dungeonRunModel.findOne({
        messageId,
        isActive: true,
      });

      if (!dungeonRun) {
        await interaction.reply({
          content: 'This dungeon run is no longer active.',
          ephemeral: true,
        });
        return;
      }

      // Get the selected user ID to kick
      const userIdToKick = interaction.values[0];

      // Remove user from participants
      dungeonRun.participants = dungeonRun.participants.filter(
        (id) => id !== userIdToKick,
      );

      // Remove user from all job classes
      for (const [job, users] of dungeonRun.jobClasses) {
        const index = users.indexOf(userIdToKick);
        if (index > -1) {
          users.splice(index, 1);
          dungeonRun.jobClasses.set(job, users);
        }
      }

      // Save changes
      await dungeonRun.save();

      // Get the original message
      const message = await interaction.channel?.messages.fetch(messageId);
      if (!message) {
        await interaction.reply({
          content: 'Could not find the original message.',
          ephemeral: true,
        });
        return;
      }

      // Update the embed directly by editing the message
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({
          content: 'Could not update the message.',
          ephemeral: true,
        });
        return;
      }

      // Update the dungeon embed by manually reconstructing it
      await this.updateDungeonEmbedFromMessage(message, dungeonRun, guild);

      // Send confirmation
      const kickedMember = await interaction.guild?.members
        .fetch(userIdToKick)
        .catch(() => null);
      const kickedName =
        kickedMember?.displayName ||
        kickedMember?.user.username ||
        `User ${userIdToKick}`;

      await interaction.reply({
        content: `✅ Successfully kicked **${kickedName}** from the party.`,
        ephemeral: true,
      });
    } catch (error) {
      this.logger.error('Error handling dungeon kick select menu:', error);
      await interaction.reply({
        content: 'An error occurred while kicking the member.',
        ephemeral: true,
      });
    }
  }

  private async updateDungeonEmbedFromMessage(
    message: Message,
    dungeonRun: DungeonRunDocument,
    guild: NonNullable<Message['guild']>,
  ) {
    const embed = EmbedBuilder.from(message.embeds[0]);

    // Update participants field
    let participantsList = '```\n🔹 No participants yet\n```';

    if (dungeonRun.participants.length > 0) {
      const participantNames: string[] = [];
      for (const userId of dungeonRun.participants) {
        try {
          const member = await guild.members.fetch(userId);
          participantNames.push(
            `🔸 ${member.displayName || member.user.username}`,
          );
        } catch {
          participantNames.push(`🔸 <@${userId}>`);
        }
      }
      participantsList = '```\n' + participantNames.join('\n') + '\n```';
    }

    // Job classes to display
    const jobClasses = [
      'blade',
      'knight',
      'ranger',
      'jester',
      'psykeeper',
      'elementor',
      'billposter',
      'ringmaster',
    ];
    const fields = [
      {
        name: '**PARTY COMPOSITION**',
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        inline: false,
      },
    ];

    // Add job class fields
    for (const jobClass of jobClasses) {
      const jobUsers = dungeonRun.jobClasses.get(jobClass) || [];
      let jobList = '```\n🔹 Empty slots\n```';

      if (jobUsers.length > 0) {
        const userNames: string[] = [];
        for (const userId of jobUsers) {
          try {
            const member = await guild.members.fetch(userId);
            userNames.push(`🔸 ${member.displayName || member.user.username}`);
          } catch {
            userNames.push(`🔸 <@${userId}>`);
          }
        }
        jobList = '```\n' + userNames.join('\n') + '\n```';
      }

      const emojiMap: { [key: string]: string } = {
        blade: EMOJIS.BLADE,
        knight: EMOJIS.KNIGHT,
        ranger: EMOJIS.RANGER,
        jester: EMOJIS.JESTER,
        psykeeper: EMOJIS.PSYKEEPER,
        elementor: EMOJIS.ELEMENTOR,
        billposter: EMOJIS.BILLPOSTER,
        ringmaster: EMOJIS.RINGMASTER,
      };

      const emoji = emojiMap[jobClass] || '';

      fields.push({
        name: `${emoji} **${jobClass.charAt(0).toUpperCase() + jobClass.slice(1)}**`,
        value: jobList,
        inline: false,
      });
    }

    // Add separator and total participants
    fields.push(
      {
        name: '\u200B',
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        inline: false,
      },
      {
        name: `👥 **Total Participants** (${dungeonRun.participants.length}/${dungeonRun.maxPlayers})`,
        value: participantsList,
        inline: false,
      },
    );

    // Add item drops if any
    if (dungeonRun.itemDrops && dungeonRun.itemDrops.length > 0) {
      let itemDropsList = dungeonRun.itemDrops.join('\n');
      // Limit to last 10 drops if too many
      if (dungeonRun.itemDrops.length > 10) {
        const recentDrops = dungeonRun.itemDrops.slice(-10);
        itemDropsList =
          recentDrops.join('\n') + '\n\n*...and more (showing last 10)*';
      }

      fields.push(
        {
          name: '\u200B',
          value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          inline: false,
        },
        {
          name: '💎 **Item Drops**',
          value: '```\n' + itemDropsList + '\n```',
          inline: false,
        },
      );
    }

    embed.setFields(fields);
    await message.edit({ embeds: [embed] });
  }

  private extractUserId(input: string): string | null {
    // Extract from mention format <@123456789>
    const mentionMatch = input.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      return mentionMatch[1];
    }

    // Check if it's already a valid Discord ID (17-19 digit number)
    if (/^\d{17,19}$/.test(input)) {
      return input;
    }

    return null;
  }
}
