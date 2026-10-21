import type { ModerationFilters, ModerationStatus } from './moderationTypes';
import { validateModerationFilters } from './moderationValidation';

export interface ModerationFilterDraft {
  status: ModerationStatus;
  from: string;
  to: string;
  dailyRunId: string;
}

export const EMPTY_MODERATION_DRAFT: ModerationFilterDraft = {
  status: 'open',
  from: '',
  to: '',
  dailyRunId: '',
};

export function appliedModerationFilters(draft: ModerationFilterDraft): ModerationFilters {
  return validateModerationFilters({
    status: draft.status,
    from: draft.from || null,
    to: draft.to || null,
    dailyRunId: draft.dailyRunId.trim() || null,
  });
}
