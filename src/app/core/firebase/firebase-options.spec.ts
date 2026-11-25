import { firebaseConfig } from './firebase-options';

describe('firebaseConfig versionato', () => {
  it('contiene solo valori vuoti: i valori reali stanno nel file locale o nei secret', () => {
    expect(firebaseConfig).toEqual({
      options: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
      },
      firestoreDatabaseId: '',
    });
  });
});
