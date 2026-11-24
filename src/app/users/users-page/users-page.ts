import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ItemList, ListItem } from '../../shared/ui/item-list/item-list';
import { NotificationBanner } from '../../shared/ui/notification-banner/notification-banner';
import { User } from '../user.model';
import { UsersDataSource } from '../users-data-source';

type UsersPageStatus = 'loading' | 'ready' | 'error';

export function toListItem(user: User): ListItem {
  const title = `${user.surname} ${user.name}`.trim();
  return {
    id: user.id,
    title: title || 'Utente senza nome',
    subtitle: user.mail || undefined,
  };
}

@Component({
  selector: 'app-users-page',
  imports: [ItemList, NotificationBanner],
  templateUrl: './users-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  protected readonly status = signal<UsersPageStatus>('loading');
  private readonly users = signal<readonly User[]>([]);
  protected readonly items = computed<ListItem[]>(() => this.users().map(toListItem));

  constructor() {
    inject(UsersDataSource)
      .getUsers()
      .then(
        (users) => {
          this.users.set(users);
          this.status.set('ready');
        },
        (err: unknown) => {
          console.error('Errore durante il recupero degli utenti', err);
          this.status.set('error');
        },
      );
  }
}
