import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SiegeEvent, SiegeEventDocument } from '../schemas/siege-event.schema';
import { SIEGE_CONFIG, JobClass } from '../config/siege.config';

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
    action:
      | 'added'
      | 'removed'
      | 'moved_to_candidate'
      | 'promoted_from_candidate';
    fromRole?: string;
  }> {
    const maxSlots = SIEGE_CONFIG.JOB_CLASS_MAX_SLOTS[jobClass];
    const updatedPrincipals = new Map(siegeEvent.principals);
    const updatedCandidates = new Map(siegeEvent.candidates);

    // Check if user is in any principal position
    let currentPrincipalRole: string | undefined;
    for (const [role, userIds] of updatedPrincipals) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        currentPrincipalRole = role;
        break;
      }
    }

    // Check if user is in any candidate position
    let currentCandidateRole: string | undefined;
    for (const [role, userIds] of updatedCandidates) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        currentCandidateRole = role;
        break;
      }
    }

    const currentPrincipals =
      (updatedPrincipals.get(jobClass) as unknown as string[]) || [];
    const currentCandidates =
      (updatedCandidates.get(jobClass) as unknown as string[]) || [];

    // If user is clicking their current principal position, remove them
    if (currentPrincipalRole === jobClass) {
      const filtered = currentPrincipals.filter((id) => id !== userId);
      updatedPrincipals.set(jobClass, filtered);

      // Promote first candidate if exists
      if (currentCandidates.length > 0) {
        const promotedUserId = currentCandidates[0];
        filtered.push(promotedUserId);
        updatedPrincipals.set(jobClass, filtered);

        const newCandidates = currentCandidates.slice(1);
        updatedCandidates.set(jobClass, newCandidates);
      }

      siegeEvent.principals = updatedPrincipals;
      siegeEvent.candidates = updatedCandidates;
      await siegeEvent.save();

      return { action: 'removed' };
    }

    // If user is clicking their current candidate position, remove them
    if (currentCandidateRole === jobClass) {
      const filtered = currentCandidates.filter((id) => id !== userId);
      updatedCandidates.set(jobClass, filtered);

      siegeEvent.candidates = updatedCandidates;
      await siegeEvent.save();

      return { action: 'removed' };
    }

    // Remove user from all positions first
    for (const [role, userIds] of updatedPrincipals) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        const filtered = ids.filter((id) => id !== userId);
        updatedPrincipals.set(role, filtered);

        // Promote candidate for the vacated position
        const candidates =
          (updatedCandidates.get(role) as unknown as string[]) || [];
        if (candidates.length > 0) {
          const promotedUserId = candidates[0];
          filtered.push(promotedUserId);
          updatedPrincipals.set(role, filtered);

          const newCandidates = candidates.slice(1);
          updatedCandidates.set(role, newCandidates);
        }
      }
    }

    for (const [role, userIds] of updatedCandidates) {
      const ids = userIds as unknown as string[];
      if (ids.includes(userId)) {
        const filtered = ids.filter((id) => id !== userId);
        updatedCandidates.set(role, filtered);
      }
    }

    // Try to add user to the new position
    if (currentPrincipals.length < maxSlots) {
      // Add as principal
      currentPrincipals.push(userId);
      updatedPrincipals.set(jobClass, currentPrincipals);

      siegeEvent.principals = updatedPrincipals;
      siegeEvent.candidates = updatedCandidates;

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
        fromRole: currentPrincipalRole || currentCandidateRole,
      };
    } else {
      // Add as candidate
      currentCandidates.push(userId);
      updatedCandidates.set(jobClass, currentCandidates);

      siegeEvent.principals = updatedPrincipals;
      siegeEvent.candidates = updatedCandidates;

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
        action: 'moved_to_candidate',
        fromRole: currentPrincipalRole || currentCandidateRole,
      };
    }
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
      candidates: new Map(),
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
