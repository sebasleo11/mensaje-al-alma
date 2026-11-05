/** Proof-of-life policy. Days are counted from the owner's last explicit confirmation. */
export const DAY_MS = 86_400_000;
export const REMINDER_DAYS = [23, 30, 37, 44] as const; // one week before the monthly due date, then weekly
export const LAPSE_DAYS = 51; // three weeks after the due date
export const MIN_REMINDER_GAP_DAYS = 3;
export const MIN_LAST_WARNING_DAYS = 7; // release never happens right after the final reminder

export type CheckinAction = { type: 'none' } | { type: 'remind'; stage: number } | { type: 'release' };
type State = { lastCheckinAt: Date; reminderStage: number; lastReminderAt: Date | null; releasedAt: Date | null };

export function daysSince(date: Date, now: Date) { return (now.getTime() - date.getTime()) / DAY_MS; }
export function dueAt(lastCheckinAt: Date) { return new Date(lastCheckinAt.getTime() + 30 * DAY_MS); }

/** One action per run, so a stalled scheduler catches up gradually instead of firing every reminder and the release at once. */
export function nextCheckinAction(state: State, now: Date): CheckinAction {
  if (state.releasedAt) return { type: 'none' };
  const elapsed = daysSince(state.lastCheckinAt, now);
  const sinceReminder = state.lastReminderAt ? daysSince(state.lastReminderAt, now) : Infinity;
  if (state.reminderStage < REMINDER_DAYS.length) {
    if (elapsed >= REMINDER_DAYS[state.reminderStage] && sinceReminder >= MIN_REMINDER_GAP_DAYS) return { type: 'remind', stage: state.reminderStage + 1 };
    return { type: 'none' };
  }
  return elapsed >= LAPSE_DAYS && sinceReminder >= MIN_LAST_WARNING_DAYS ? { type: 'release' } : { type: 'none' };
}
