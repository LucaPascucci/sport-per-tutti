import { inject, InjectionToken } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore/lite';

import { FIREBASE_CONFIG } from './firebase-config';

/**
 * Istanza Firestore (lite) del database configurato in `FIREBASE_CONFIG`.
 * Contiene import di valore da Firebase: va importato solo da codice caricato in lazy.
 */
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () => {
    const { options, firestoreDatabaseId } = inject(FIREBASE_CONFIG);
    const app = getApps().length ? getApp() : initializeApp(options);
    return getFirestore(app, firestoreDatabaseId);
  },
});
