# SportPerTutti

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.31.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Deploy e configurazione Firebase

L'app viene pubblicata su GitHub Pages all'indirizzo `https://lucapascucci.github.io/sport-per-tutti/`.
Il workflow `.github/workflows/deploy.yml` parte a ogni push su `main`: esegue i test e, solo se
passano, compila l'app con la configurazione Firebase presa dai secret del repository e la pubblica.

### Secret del repository

Crea questi sette _repository secrets_ in **Settings > Secrets and variables > Actions**, copiando i
valori dalla configurazione web dell'app nella console Firebase:

| Secret                           | Campo Firebase                                    |
| -------------------------------- | ------------------------------------------------- |
| `FIREBASE_API_KEY`               | `apiKey`                                          |
| `FIREBASE_AUTH_DOMAIN`           | `authDomain`                                      |
| `FIREBASE_PROJECT_ID`            | `projectId`                                       |
| `FIREBASE_STORAGE_BUCKET`        | `storageBucket`                                   |
| `FIREBASE_MESSAGING_SENDER_ID`   | `messagingSenderId`                               |
| `FIREBASE_APP_ID`                | `appId`                                           |
| `FIREBASE_FIRESTORE_DATABASE_ID` | ID del database Firestore (`firestoreDatabaseId`) |

Se anche un solo secret manca o è vuoto, il job `build` fallisce con un messaggio che elenca i nomi
mancanti (mai i valori) e il sito già pubblicato resta invariato.

### Attivare GitHub Pages

In **Settings > Pages** imposta **Source** su **GitHub Actions**. Il primo deploy parte al push
successivo su `main`.

### Sviluppo locale con i valori reali

I valori reali in locale stanno in `src/app/core/firebase/firebase-options.local.ts`, un file
ignorato da git. Per crearlo:

```bash
cp src/app/core/firebase/firebase-options.local.ts.example src/app/core/firebase/firebase-options.local.ts
```

Compila i sette valori nel file appena creato (per esempio, per `authDomain` usa il valore
`authDomain` della console Firebase), poi avvia l'app con:

```bash
npm run start:firebase
```

`npm start`, `ng serve`, `npm test` e `npm run build` non usano il file locale e girano anche senza
valori reali, ma in quel caso Firestore non funziona: la pagina `/users` funziona solo con la
configurazione `firebase` (`npm run start:firebase` oppure
`ng build --configuration production,firebase`).

`src/app/core/firebase/firebase-options.ts` è versionato e deve contenere solo stringhe vuote: non
modificarlo mai con valori reali. Un test lo verifica.

### Nota sulla sicurezza

I valori della configurazione web di Firebase finiscono comunque in chiaro nel bundle JavaScript
pubblicato su Pages: sono identificativi pubblici, non segreti. Tenerli fuori dal repository evita
che entrino nella storia git, ma la protezione dei dati dipende dalle Firestore Security Rules e
dalla restrizione della API key (per esempio per HTTP referrer, dalla Google Cloud console), che
restano da configurare.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
