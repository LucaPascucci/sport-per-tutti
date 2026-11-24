import { toUsers } from './to-users';

describe('toUsers', () => {
  it('scarta gli utenti cancellati (deleted === true)', () => {
    const result = toUsers([
      { id: 1, name: 'A', surname: 'A', mail: '', deleted: true },
      { id: 2, name: 'B', surname: 'B', mail: '' },
      { id: 3, name: 'C', surname: 'C', mail: '', deleted: 'true' },
    ]);

    expect(result.map((u) => u.id)).toEqual([2, 3]);
  });

  it('ordina per cognome e poi per nome, senza distinguere maiuscole', () => {
    const result = toUsers([
      { id: 1, surname: 'rossi', name: 'Mario' },
      { id: 2, surname: 'Bianchi', name: 'Luca' },
      { id: 3, surname: 'Rossi', name: 'Anna' },
      { id: 4, surname: 'bianchi', name: 'Andrea' },
    ]);

    expect(result.map((u) => `${u.surname} ${u.name}`)).toEqual([
      'bianchi Andrea',
      'Bianchi Luca',
      'Rossi Anna',
      'rossi Mario',
    ]);
  });

  it("ignora gli accenti nel confronto e mantiene l'ordine d'ingresso a parità", () => {
    const result = toUsers([
      { id: 1, surname: 'Nicolò', name: 'Ugo' },
      { id: 2, surname: 'Nicolo', name: 'Ugo' },
      { id: 3, surname: 'Abate', name: 'Zeno' },
    ]);

    expect(result.map((u) => u.id)).toEqual([3, 1, 2]);
  });

  it('normalizza i campi mancanti o di tipo errato', () => {
    expect(toUsers([{ id: '7', name: 42 }])).toEqual([
      { id: 7, name: '', surname: '', mail: '', deleted: false, updated_at: null },
    ]);
  });

  it('converte updated_at da Timestamp Firestore o Date', () => {
    const date = new Date(1000);
    const [fromTimestamp, fromDate, fromOther] = toUsers([
      { id: 1, surname: 'A', updated_at: { toDate: () => new Date(0) } },
      { id: 2, surname: 'B', updated_at: date },
      { id: 3, surname: 'C', updated_at: '2024-01-01' },
    ]);

    expect(fromTimestamp.updated_at).toEqual(new Date(0));
    expect(fromDate.updated_at).toBe(date);
    expect(fromOther.updated_at).toBeNull();
  });

  it('scarta i documenti con id non valido', () => {
    const result = toUsers([
      { name: 'x' },
      { id: 'abc' },
      { id: NaN },
      { id: '' },
      null,
      'stringa',
      { id: 5 },
    ]);

    expect(result.map((u) => u.id)).toEqual([5]);
  });

  it('scarta anche id infiniti, null, stringhe di soli spazi e oggetti', () => {
    const result = toUsers([
      { id: Infinity },
      { id: null },
      { id: '   ' },
      { id: { value: 1 } },
      { id: ' 8 ' },
    ]);

    expect(result.map((u) => u.id)).toEqual([8]);
  });
});
