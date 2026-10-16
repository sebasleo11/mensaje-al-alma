import { isRecipientEmail } from './drafts';

export const LOCAL_DRAFT_KEY = 'alma-draft';
export function readLocalDraft(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(LOCAL_DRAFT_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local draft');
  const draft = value as { version?: unknown; recipient?: unknown; message?: unknown };
  if (typeof draft.message !== 'string' || (draft.recipient !== undefined && typeof draft.recipient !== 'string')) throw new Error('Invalid local draft');
  if (draft.version !== undefined && draft.version !== 1) throw new Error('Unknown local draft version');
  const recipient = typeof draft.recipient === 'string' ? draft.recipient : '';
  return { recipient: isRecipientEmail(recipient) ? recipient : '', message: draft.message, needsEmail: !!recipient && !isRecipientEmail(recipient) };
}

export function writeLocalDraft(storage: Pick<Storage, 'getItem' | 'setItem'>, recipient: string, message: string) {
  const raw = storage.getItem(LOCAL_DRAFT_KEY);
  // Keep a recoverable copy before replacing legacy data, including old names.
  if (raw !== null) {
    const previous = JSON.parse(raw) as { version?: unknown; recipient?: unknown; message?: unknown };
    if (previous.version !== 1 || (typeof previous.recipient === 'string' && !isRecipientEmail(previous.recipient))) {
      const backupKey = `${LOCAL_DRAFT_KEY}-backup`;
      // Only draft fields, even if an old object contains unrelated properties.
      const backup = JSON.stringify({ recipient: previous.recipient, message: previous.message });
      if (storage.getItem(backupKey) === null) storage.setItem(backupKey, backup);
      else if (storage.getItem(backupKey) !== backup) storage.setItem(`${backupKey}-${crypto.randomUUID()}`, backup);
    }
  }
  storage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ version: 1, recipient: recipient.trim(), message }));
}
