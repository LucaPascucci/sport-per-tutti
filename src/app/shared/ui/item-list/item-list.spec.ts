import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemList, ListItem } from './item-list';

describe('ItemList', () => {
  let fixture: ComponentFixture<ItemList>;
  let element: HTMLElement;

  async function render(inputs: {
    items: readonly ListItem[];
    emptyMessage?: string;
    ariaLabel?: string;
  }): Promise<void> {
    fixture = TestBed.createComponent(ItemList);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ItemList] }).compileComponents();
  });

  it('rende un <li> per elemento, con il sottotitolo solo se presente', async () => {
    await render({
      items: [
        { id: 1, title: 'A', subtitle: 'a@x.it' },
        { id: 2, title: 'B' },
      ],
    });

    const items = element.querySelectorAll('ul > li');
    expect(element.querySelectorAll('ul').length).toBe(1);
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('A');
    expect(items[0].textContent).toContain('a@x.it');
    expect(items[0].querySelectorAll('p').length).toBe(2);
    expect(items[1].textContent).toContain('B');
    expect(items[1].querySelectorAll('p').length).toBe(1);
  });

  it('mostra il messaggio vuoto di default al posto della lista', async () => {
    await render({ items: [] });

    expect(element.querySelector('ul')).toBeNull();
    expect(element.textContent?.trim()).toBe('Non ci sono elementi da mostrare');
  });

  it('mostra il messaggio vuoto configurato', async () => {
    await render({ items: [], emptyMessage: 'Vuoto' });

    expect(element.querySelector('ul')).toBeNull();
    expect(element.textContent?.trim()).toBe('Vuoto');
  });

  it('applica aria-label alla lista', async () => {
    await render({ items: [{ id: 1, title: 'A' }], ariaLabel: 'Elenco utenti' });

    expect(element.querySelector('ul')?.getAttribute('aria-label')).toBe('Elenco utenti');
  });

  it('consente di spezzare titoli e sottotitoli lunghi senza spazi', async () => {
    // jsdom non calcola il layout: il test protegge solo la presenza della classe.
    const longMail = `${'a'.repeat(60)}@${'b'.repeat(40)}.example.com`;
    await render({ items: [{ id: 1, title: 'X'.repeat(80), subtitle: longMail }] });

    const item = element.querySelector('ul > li');
    expect(item?.classList.contains('wrap-anywhere')).toBe(true);
    expect(item?.textContent).toContain(longMail);
  });

  it('non mette aria-label se non configurato', async () => {
    await render({ items: [{ id: 1, title: 'A' }] });

    expect(element.querySelector('ul')?.hasAttribute('aria-label')).toBe(false);
  });
});
