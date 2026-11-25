import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { FIREBASE_CONFIG } from './core/firebase/firebase-config';
import { firebaseConfig } from './core/firebase/firebase-options';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: FIREBASE_CONFIG, useValue: firebaseConfig },
  ],
};
