import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';
import { UsersDataSource } from './users/users-data-source';

describe('routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: UsersDataSource, useValue: { getUsers: () => Promise.resolve([]) } },
      ],
    });
  });

  it('/users rende la pagina utenti e imposta il titolo del documento', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users');
    await harness.fixture.whenStable();

    const element = harness.routeNativeElement as HTMLElement;
    expect(element.tagName.toLowerCase()).toBe('app-users-page');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Utenti');
    expect(TestBed.inject(Title).getTitle()).toBe('Utenti');
  });
});
