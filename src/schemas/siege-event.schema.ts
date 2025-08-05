import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiegeEventDocument = HydratedDocument<SiegeEvent>;

@Schema()
export class SiegeEvent {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  time: string;

  @Prop()
  tier: string;

  @Prop({ required: true })
  creatorId: string;

  @Prop()
  timestamp: number;

  @Prop({ type: Map, of: [String], default: new Map() })
  principals: Map<string, string[]>; // jobClass -> userIds[]

  @Prop({ type: Map, of: [String], default: new Map() })
  candidates: Map<string, string[]>; // jobClass -> userIds[] (overflow when principal slots are full)

  @Prop({ type: [String], default: [] })
  attendees: string[]; // userIds who reacted with ✅

  @Prop({ type: [String], default: [] })
  notAttending: string[]; // userIds who reacted with ❌

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SiegeEventSchema = SchemaFactory.createForClass(SiegeEvent);
