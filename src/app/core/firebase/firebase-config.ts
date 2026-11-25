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
