import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { DiscordService } from './discord.service';
import { ThreadEvent, ThreadEventSchema } from './schemas/thread-event.schema';
import {
  RoleReaction,
  RoleReactionSchema,
} from './schemas/role-reaction.schema';
import { SiegeEvent, SiegeEventSchema } from './schemas/siege-event.schema';
import { DungeonRun, DungeonRunSchema } from './schemas/dungeon-run.schema';
import { SiegeEventUseCase } from './use-cases/siege-event.use-case';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/wazabz-discord-bot',
    ),
    MongooseModule.forFeature([
      { name: ThreadEvent.name, schema: ThreadEventSchema },
      { name: RoleReaction.name, schema: RoleReactionSchema },
      { name: SiegeEvent.name, schema: SiegeEventSchema },
      { name: DungeonRun.name, schema: DungeonRunSchema },
    ]),
  ],
  controllers: [AppController],
  providers: [DiscordService, SiegeEventUseCase],
})
export class AppModule {}
