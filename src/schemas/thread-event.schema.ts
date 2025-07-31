import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ThreadEventDocument = ThreadEvent & Document;

@Schema({ timestamps: true })
export class ThreadEvent {
  @Prop({ required: true, unique: true })
  threadId: string;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ type: Map, of: [String], default: new Map() })
  reactions: Map<string, string[]>; // emoji -> userIds array

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const ThreadEventSchema = SchemaFactory.createForClass(ThreadEvent);
