import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationBanner, NotificationVariant } from './notification-banner';

describe('NotificationBanner', () => {
  let fixture: ComponentFixture<NotificationBanner>;

  async function render(variant?: NotificationVariant): Promise<HTMLElement> {
    fixture = TestBed.createComponent(NotificationBanner);
    fixture.componentRef.setInput('message', 'Testo');
    if (variant !== undefined) {
      fixture.componentRef.setInput('variant', variant);
    }
    await fixture.whenStable();
    const root = (fixture.nativeElement as HTMLElement).firstElementChild;
    expect(root).not.toBeNull();
    return root as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NotificationBanner] }).compileComponents();
  });

  it('variante error: role="alert" e testo del messaggio', async () => {
    const root = await render('error');

    expect(root.getAttribute('role')).toBe('alert');
    expect(root.textContent?.trim()).toBe('Testo');
  });

  it('variante warning: role="alert"', async () => {
    const root = await render('warning');

    expect(root.getAttribute('role')).toBe('alert');
  });

  it('variante info (default): role="status"', async () => {
    const root = await render();

    expect(root.getAttribute('role')).toBe('status');
  });

  it('variante success: role="status"', async () => {
    const root = await render('success');

    expect(root.getAttribute('role')).toBe('status');
  });

  it('applica classi diverse per ogni variante', async () => {
    const variants: NotificationVariant[] = ['info', 'success', 'warning', 'error'];
    const classes = new Set<string>();
    for (const variant of variants) {
      const root = await render(variant);
      classes.add(root.getAttribute('class') ?? '');
    }

    expect(classes.size).toBe(variants.length);
  });

  it('classe diversa tra error e info (default)', async () => {
    const info = (await render()).getAttribute('class');
    const error = (await render('error')).getAttribute('class');

    expect(info).toBeTruthy();
    expect(error).not.toBe(info);
  });

  it('è persistente: non contiene pulsanti di chiusura', async () => {
    const root = await render('error');

    expect(root.querySelector('button')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });
});
