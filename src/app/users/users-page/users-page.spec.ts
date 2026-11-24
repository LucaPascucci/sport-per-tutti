import { ComponentFixture, TestBed } from '@angular/core/testing';

import { User } from '../user.model';
import { UsersDataSource } from '../users-data-source';
import { UsersPage } from './users-page';

const EMPTY_MESSAGE = 'Non ci sono elementi da mostrare';
const ERROR_MESSAGE = 'Errore durante il recupero dei dati';
const LOADING_MESSAGE = 'Caricamento in corso...';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function user(id: number, name: string, surname: string, mail: string): User {
  return { id, name, surname, mail, deleted: false, updated_at: null };
}

describe('UsersPage', () => {
  let fixture: ComponentFixture<UsersPage>;
  let element: HTMLElement;

  async function render(getUsers: () => Promise<User[]>): Promise<void> {
    TestBed.configureTestingModule({
      imports: [UsersPage],
      providers: [{ provide: UsersDataSource, useValue: { getUsers } }],
    });
    fixture = TestBed.createComponent(UsersPage);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mostra sempre il titolo Utenti', async () => {
    await render(() => Promise.resolve([]));

    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Utenti');
  });

  it("mostra solo l'indicatore di caricamento finché i dati non arrivano", async () => {
    const pending = deferred<User[]>();
    await render(() => pending.promise);

    const status = element.querySelector('[role="status"]');
    expect(status?.textContent?.trim()).toBe(LOADING_MESSAGE);
    expect(element.querySelector('ul')).toBeNull();
    expect(element.textContent).not.toContain(EMPTY_MESSAGE);
    expect(element.querySelector('[role="alert"]')).toBeNull();

    pending.resolve([]);
    await pending.promise;
    await fixture.whenStable();

    expect(element.textContent).not.toContain(LOADING_MESSAGE);
  });

  it("mostra la lista degli utenti nell'ordine ricevuto", async () => {
    await render(() =>
      Promise.resolve([
        user(1, 'Mario', 'Rossi', 'mario.rossi@example.com'),
        user(2, 'Anna', 'Verdi', 'anna.verdi@example.com'),
      ]),
    );

    const list = element.querySelector('ul');
    const items = element.querySelectorAll('ul > li');
    expect(list?.getAttribute('aria-label')).toBe('Elenco utenti');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Rossi Mario');
    expect(items[0].textContent).toContain('mario.rossi@example.com');
    expect(items[1].textContent).toContain('Verdi Anna');
    expect(items[1].textContent).toContain('anna.verdi@example.com');
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.textContent).not.toContain(LOADING_MESSAGE);
    expect(element.textContent).not.toContain(EMPTY_MESSAGE);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('mostra "Utente senza nome" e nessun sottotitolo per utenti senza dati', async () => {
    await render(() => Promise.resolve([user(3, '', '  ', '')]));

    const items = element.querySelectorAll('ul > li');
    expect(items.length).toBe(1);
    expect(items[0].textContent?.trim()).toBe('Utente senza nome');
    expect(items[0].querySelectorAll('p').length).toBe(1);
  });

  it('mostra il messaggio vuoto se non ci sono utenti', async () => {
    await render(() => Promise.resolve([]));

    expect(element.textContent).toContain(EMPTY_MESSAGE);
    expect(element.querySelector('ul')).toBeNull();
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.textContent).not.toContain(LOADING_MESSAGE);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('mostra la notifica di errore se il recupero fallisce', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(() => Promise.reject(new Error('permission-denied')));

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBe(ERROR_MESSAGE);
    expect(element.querySelector('ul')).toBeNull();
    expect(element.textContent).not.toContain(EMPTY_MESSAGE);
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.textContent).not.toContain(LOADING_MESSAGE);
    expect(element.textContent).not.toContain('permission-denied');
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('mostra la notifica di errore anche se il rifiuto non è un Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(() => Promise.reject('boom'));

    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(ERROR_MESSAGE);
  });

  it('la notifica di errore resta visibile dopo 60 secondi', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(() => Promise.reject(new Error('unavailable')));
    expect(element.querySelector('[role="alert"]')).not.toBeNull();

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(ERROR_MESSAGE);
    expect(element.querySelector('button')).toBeNull();
  });
});
