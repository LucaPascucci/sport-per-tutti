import { User } from './user.model';

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null;
}

function toId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toDate(value: unknown): Date | null {
  if (isRecord(value) && typeof value['toDate'] === 'function') {
    return (value['toDate'] as () => Date)();
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'it', { sensitivity: 'base' });
}

/**
 * Converte i dati grezzi dei documenti Firestore della collezione `users` in `User[]`:
 * scarta i documenti senza un id numerico valido e gli utenti cancellati, poi ordina
 * per cognome e nome (ordinamento stabile).
 */
export function toUsers(raw: readonly unknown[]): User[] {
  const users: User[] = [];
  for (const doc of raw) {
    if (!isRecord(doc)) {
      continue;
    }
    const id = toId(doc['id']);
    if (id === null) {
      continue;
    }
    users.push({
      id,
      name: toText(doc['name']),
      surname: toText(doc['surname']),
      mail: toText(doc['mail']),
      deleted: doc['deleted'] === true,
      updated_at: toDate(doc['updated_at']),
    });
  }
  return users
    .filter((user) => !user.deleted)
    .sort((a, b) => compareText(a.surname, b.surname) || compareText(a.name, b.name));
}
