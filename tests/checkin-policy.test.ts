import assert from 'node:assert/strict';
import { nextCheckinAction, DAY_MS } from '../lib/checkin/policy';
export async function verifyCheckinPolicy() {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const at = (days: number) => new Date(t0.getTime() + days * DAY_MS);
  const base = { lastCheckinAt: t0, reminderStage: 0, lastReminderAt: null as Date | null, releasedAt: null as Date | null };
  assert.deepEqual(nextCheckinAction(base, at(22)), { type: 'none' });
  assert.deepEqual(nextCheckinAction(base, at(23)), { type: 'remind', stage: 1 });
  // A stalled scheduler never fires everything at once: one reminder per run, spaced.
  assert.deepEqual(nextCheckinAction(base, at(200)), { type: 'remind', stage: 1 });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 1, lastReminderAt: at(199) }, at(200)), { type: 'none' });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 1, lastReminderAt: at(23) }, at(200)), { type: 'remind', stage: 2 });
  // Never releases before all four reminders, a last week of warning, and day 51.
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 3, lastReminderAt: at(37) }, at(60)), { type: 'remind', stage: 4 });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 4, lastReminderAt: at(44) }, at(50)), { type: 'none' });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 4, lastReminderAt: at(48) }, at(52)), { type: 'none' });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 4, lastReminderAt: at(44) }, at(52)), { type: 'release' });
  assert.deepEqual(nextCheckinAction({ ...base, reminderStage: 4, lastReminderAt: at(44), releasedAt: at(52) }, at(90)), { type: 'none' });
  console.log('OK: política de signo de vida: recordatorios espaciados, sin liberar antes de día 51 ni sin aviso final.');
}
