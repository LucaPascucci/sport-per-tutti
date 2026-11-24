import { InjectionToken } from '@angular/core';
import type { FirebaseOptions } from 'firebase/app';

export interface FirebaseConfig {
  readonly options: FirebaseOptions;
  readonly firestoreDatabaseId: string;
}

/**
 * Configurazione Firebase dell'app. Va fornita esplicitamente in `app.config.ts`.
 * Questo file importa da Firebase solo tipi, per tenere l'SDK fuori dal bundle iniziale.
 */
export const FIREBASE_CONFIG = new InjectionToken<FirebaseConfig>('FIREBASE_CONFIG');

// Configurazione web di Firebase: identificativi pubblici, non segreti.
// La protezione dei dati dipende dalle Firestore Security Rules.
export const firebaseConfig: FirebaseConfig = {
  options: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  firestoreDatabaseId: '',
};
