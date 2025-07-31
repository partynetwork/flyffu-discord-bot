import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleReactionDocument = RoleReaction & Document;

@Schema({ timestamps: true })
export class RoleReaction {
  @Prop({ required: true, unique: true })
  emoji: string;

  @Prop({ required: true })
  roleId: string;

  @Prop()
  guildId?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const RoleReactionSchema = SchemaFactory.createForClass(RoleReaction);
