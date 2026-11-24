import { Injectable } from '@angular/core';

import { FirestoreUsersDataSource } from './firestore-users-data-source';
import { User } from './user.model';

/**
 * Sorgente degli utenti usata dalla pagina. L'implementazione di default legge da Firestore;
 * i test la sostituiscono con `{ provide: UsersDataSource, useValue: fake }`.
 */
@Injectable({ providedIn: 'root', useExisting: FirestoreUsersDataSource })
export abstract class UsersDataSource {
  abstract getUsers(): Promise<User[]>;
}
