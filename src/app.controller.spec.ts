import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { DiscordService } from './discord.service';
import { ConfigService } from '@nestjs/config';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockDiscordService = {
      getGuildSummary: jest.fn().mockResolvedValue({
        totalGuilds: 1,
        guilds: [],
        botStatus: 'online',
        uptime: 0,
        activeThreadEvents: 0,
        roleReactionMappings: 0,
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-token'),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('guild summary', () => {
    it('should return guild summary', async () => {
      const result = await appController.getGuildSummary();
      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.message).toContain('Wazabz Discord Bot');
    });
  });
});
