import { inject, Injectable } from '@angular/core';
import { collection, getDocs } from 'firebase/firestore/lite';

import { FIRESTORE } from '../core/firebase/firestore';
import { toUsers } from './to-users';
import { User } from './user.model';
import type { UsersDataSource } from './users-data-source';

/** Legge una volta la collezione Firestore `users`. Gli errori arrivano al chiamante. */
@Injectable({ providedIn: 'root' })
export class FirestoreUsersDataSource implements UsersDataSource {
  private readonly db = inject(FIRESTORE);

  async getUsers(): Promise<User[]> {
    const snapshot = await getDocs(collection(this.db, 'users'));
    return toUsers(snapshot.docs.map((doc) => doc.data()));
  }
}
