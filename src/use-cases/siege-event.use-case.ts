import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SiegeEvent, SiegeEventDocument } from '../schemas/siege-event.schema';
import { JobClass } from '../config/siege.config';

@Injectable()
export class SiegeEventUseCase {
  constructor(
    @InjectModel(SiegeEvent.name)
    private siegeEventModel: Model<SiegeEventDocument>,
  ) {}

  async handleJobSelection(
    siegeEvent: SiegeEventDocument,
    userId: string,
    jobClass: JobClass,
  ): Promise<{
    action: 'added' | 'removed';
    fromRole?: string;
  }> {
    const updatedPrincipals = new Map(siegeEvent.principals);

    // Check if user is in any principal position
    let currentPrincipalRole: string | undefined;
    for (const [role, userIds] of updatedPrincipals) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        currentPrincipalRole = role;
        break;
      }
    }

    const currentPrincipals =
      (updatedPrincipals.get(jobClass) as unknown as string[]) || [];

    // If user is clicking their current position, remove them
    if (currentPrincipalRole === jobClass) {
      const filtered = currentPrincipals.filter((id) => id !== userId);
      updatedPrincipals.set(jobClass, filtered);

      siegeEvent.principals = updatedPrincipals;
      await siegeEvent.save();

      return { action: 'removed' };
    }

    // Remove user from all positions first
    for (const [role, userIds] of updatedPrincipals) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        const filtered = ids.filter((id) => id !== userId);
        updatedPrincipals.set(role, filtered);
      }
    }

    // Add user to the new position (no limit)
    currentPrincipals.push(userId);
    updatedPrincipals.set(jobClass, currentPrincipals);

    siegeEvent.principals = updatedPrincipals;

    // Auto-add to attendees if not already
    if (!siegeEvent.attendees.includes(userId)) {
      siegeEvent.attendees.push(userId);
    }
    // Remove from not attending
    siegeEvent.notAttending = siegeEvent.notAttending.filter(
      (id) => id !== userId,
    );

    await siegeEvent.save();

    return {
      action: 'added',
      fromRole: currentPrincipalRole,
    };
  }

  async createSiegeEvent(
    messageId: string,
    channelId: string,
    date: string,
    time: string,
    tier: string,
    creatorId: string,
    timestamp: number,
  ): Promise<SiegeEventDocument> {
    const siegeEvent = new this.siegeEventModel({
      messageId,
      channelId,
      date,
      time,
      tier,
      creatorId,
      timestamp,
      principals: new Map(),
      attendees: [],
      notAttending: [],
      isActive: true,
    });

    return await siegeEvent.save();
  }

  async getSiegeEvent(messageId: string): Promise<SiegeEventDocument | null> {
    return await this.siegeEventModel.findOne({
      messageId,
      isActive: true,
    });
  }
}
