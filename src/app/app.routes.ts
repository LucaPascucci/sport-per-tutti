import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'users',
    title: 'Utenti',
    loadComponent: () => import('./users/users-page/users-page').then((m) => m.UsersPage),
  },
];
