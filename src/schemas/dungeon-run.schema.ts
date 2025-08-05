import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DungeonRunDocument = HydratedDocument<DungeonRun>;

@Schema()
export class DungeonRun {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ required: true })
  dungeonName: string;

  @Prop({ required: true })
  maxPlayers: number;

  @Prop()
  notes: string;

  @Prop({ required: true })
  creatorId: string;

  @Prop()
  timestamp: number;

  @Prop({ type: [String], default: [] })
  participants: string[]; // userIds who joined

  @Prop({ type: Map, of: [String], default: new Map() })
  jobClasses: Map<string, string[]>; // jobClass -> userIds[]

  @Prop({ type: [String], default: [] })
  itemDrops: string[]; // Array of item drop records with timestamps

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const DungeonRunSchema = SchemaFactory.createForClass(DungeonRun);
