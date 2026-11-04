import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AuthSessionService } from './auth-session.service';

/** A sablont nem rajzoljuk ki (a lazy nézetek hívásai nélkül): a komponens logikáját példányként vizsgáljuk. */
describe('AppComponent (logika)', () => {
  let backend: HttpTestingController;
  let session: AuthSessionService;
  let app: AppComponent;

  const loose = () => app as unknown as Record<string, unknown> & AppComponent;

  const tokenFor = (sub: string) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${encode({ alg: 'HS256' })}.${encode({ sub })}.signature`;
  };

  const profile = (overrides: Record<string, unknown> = {}) => ({
    email: 'anna@test.hu',
    username: 'anna',
    displayName: 'Anna',
    hasAvatar: false,
    studyDayStreak: 3,
    ...overrides,
  });

  const settings = (overrides: Record<string, unknown> = {}) => ({
    dailyNewCardGoal: 20,
    minimumAnswerSeconds: 0,
    automaticAiCheck: true,
    acceptHungarianParaphrase: false,
    acceptPartialMeaningMatch: true,
    acceptEnglishSynonyms: false,
    repeatMistakes: true,
    requireAppealReason: true,
    reuseSavedExamples: true,
    savedLevelPolicy: 'exact',
    generateAlternateDefinitions: true,
    leechThreshold: 6,
    aiFillBatchSize: 5,
    aiFillDailyLimit: 100,
    aiFillRemainingToday: 90,
    exampleLevel: 'B1',
    aiModel: 'google/gemini-3.6-flash',
    timeZoneId: 'Europe/Budapest',
    ...overrides,
  });

  const models = { default: 'google/gemini-3.6-flash', models: [{ id: 'google/gemini-3.6-flash', label: 'Gemini' }, { id: 'openai/gpt-5-mini', label: 'GPT' }] };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
    app = TestBed.runInInjectionContext(() => new AppComponent());
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  /** Betölti a tanulási beállításokat, hogy a mentés engedélyezett legyen. */
  const loadSettings = (values: Record<string, unknown> = {}) => {
    app.loadStudySettings();
    backend.expectOne('/api/study/settings').flush(settings(values));
    backend.expectOne('/api/ai/models').flush(models);
  };

  describe('belépés és regisztráció', () => {
    it('hiányzó email vagy jelszó esetén nem küld kérést', () => {
      app.submit();
      expect(app.errorMessage).toBe('Add meg az emailt és a jelszót.');

      app.email = 'a@b.hu';
      app.submit();
      expect(app.errorMessage).toBe('Add meg az emailt és a jelszót.');
      backend.expectNone('/api/auth/login');
    });

    for (const [label, change, message] of [
      ['érvénytelen email', (a: AppComponent) => (a.email = 'nem-email'), 'Ez nem tűnik érvényes email címnek.'],
      ['rövid jelszó', (a: AppComponent) => (a.password = 'rovid1'), 'A jelszó legalább 8 karakter legyen.'],
      ['rossz felhasználónév', (a: AppComponent) => (a.registerUsername = 'a b'), 'A felhasználónév 3–30 karakter, angol betű, szám, pont, kötőjel és aláhúzás lehet.'],
      ['eltérő jelszavak', (a: AppComponent) => (a.passwordConfirm = 'Masik1234'), 'A két jelszó nem egyezik.'],
      ['foglalt email', (a: AppComponent) => (a.emailTaken = true), 'Ezzel az email címmel már van fiók.'],
      ['foglalt felhasználónév', (a: AppComponent) => (a.usernameTaken = true), 'Ez a felhasználónév már foglalt.'],
    ] as Array<[string, (a: AppComponent) => void, string]>) {
      it(`regisztrációnál ${label} esetén helyi hibát jelez`, () => {
        app.mode = 'register';
        app.email = 'anna@test.hu';
        app.registerUsername = 'anna';
        app.password = 'Jelszo1234';
        app.passwordConfirm = 'Jelszo1234';
        change(app);

        app.submit();

        expect(app.errorMessage).toBe(message);
        backend.expectNone('/api/auth/register');
      });
    }

    it('sikeres belépés után menti a munkamenetet, törli a jelszót és betölti a profilt', () => {
      app.email = '  anna@test.hu ';
      app.password = 'Jelszo1234';

      app.submit();
      expect(app.isSubmitting).toBeTrue();
      const login = backend.expectOne('/api/auth/login');
      expect(login.request.body).toEqual({ email: 'anna@test.hu', password: 'Jelszo1234' });
      login.flush({ token: tokenFor('42'), email: 'anna@test.hu' });

      expect(app.isSubmitting).toBeFalse();
      expect(app.password).toBe('');
      expect(session.isLoggedIn()).toBeTrue();
      expect(session.email()).toBe('anna@test.hu');
      expect(sessionStorage.getItem('vocabapp.token')).not.toBeNull();
      backend.expectOne('/api/auth/profile').flush(profile());
      expect(app.savedDisplayName).toBe('Anna');
    });

    it('a „Maradjak bejelentkezve” a tartós tárolóba ír', () => {
      app.email = 'anna@test.hu';
      app.password = 'Jelszo1234';
      app.rememberMe = true;

      app.submit();
      backend.expectOne('/api/auth/login').flush({ token: tokenFor('1'), email: 'anna@test.hu' });
      backend.expectOne('/api/auth/profile').flush(profile());

      expect(localStorage.getItem('vocabapp.token')).not.toBeNull();
      expect(sessionStorage.getItem('vocabapp.token')).toBeNull();
    });

    it('hibás belépésnél a „Hibás email vagy jelszó.” üzenetet mutatja', () => {
      app.email = 'anna@test.hu';
      app.password = 'rossz';

      app.submit();
      backend.expectOne('/api/auth/login').flush({ title: 'Hibás email vagy jelszó.' }, { status: 401, statusText: 'Unauthorized' });

      expect(app.errorMessage).toBe('Hibás email vagy jelszó.');
      expect(app.isSubmitting).toBeFalse();
      expect(session.isLoggedIn()).toBeFalse();
    });

    it('a szerver magyar hibacímét megjeleníti, címtelen hibánál általános szöveget', () => {
      app.email = 'anna@test.hu';
      app.password = 'Jelszo1234';

      app.submit();
      backend.expectOne('/api/auth/login').flush({ title: 'Valami baj van.' }, { status: 400, statusText: 'Bad Request' });
      expect(app.errorMessage).toBe('Valami baj van.');

      app.submit();
      backend.expectOne('/api/auth/login').flush('', { status: 500, statusText: 'Server Error' });
      expect(app.errorMessage).toBe('Nem sikerült, próbáld újra.');
    });

    it('a regisztráció a felhasználónevet is elküldi', () => {
      app.mode = 'register';
      app.email = 'anna@test.hu';
      app.registerUsername = ' anna.k ';
      app.password = 'Jelszo1234';
      app.passwordConfirm = 'Jelszo1234';

      app.submit();
      const register = backend.expectOne('/api/auth/register');
      expect(register.request.body).toEqual({ email: 'anna@test.hu', username: 'anna.k', password: 'Jelszo1234' });
      register.flush({ token: tokenFor('7'), email: 'anna@test.hu' });
      backend.expectOne('/api/auth/profile').flush(profile());

      expect(app.registerUsername).toBe('');
      expect(session.isLoggedIn()).toBeTrue();
    });

    it('a 409-es regisztrációs hiba után újra ellenőrzi a foglaltságot', fakeAsync(() => {
      app.mode = 'register';
      app.email = 'anna@test.hu';
      app.registerUsername = 'anna';
      app.password = 'Jelszo1234';
      app.passwordConfirm = 'Jelszo1234';

      app.submit();
      backend.expectOne('/api/auth/register').flush({ title: 'Ez az email cím már regisztrálva van.' }, { status: 409, statusText: 'Conflict' });
      expect(app.errorMessage).toBe('Ez az email cím már regisztrálva van.');

      tick(400);
      backend.expectOne(request => request.url === '/api/auth/availability').flush({ emailTaken: true, usernameTaken: false });
      expect(app.emailTaken).toBeTrue();
      flush();
    }));
  });

  describe('foglaltság-ellenőrzés', () => {
    const availability = () => backend.expectOne(request => request.url === '/api/auth/availability');

    it('csak regisztráció módban fut', fakeAsync(() => {
      app.email = 'anna@test.hu';

      app.onRegisterFieldChange();
      tick(1000);

      backend.expectNone('/api/auth/availability');
      expect(app.emailTaken).toBeFalse();
    }));

    it('gépelés után 400 ms-mal, csak az érvényes mezőkkel kérdez', fakeAsync(() => {
      app.mode = 'register';
      app.email = 'anna@test.hu';
      app.registerUsername = 'a'; // túl rövid: nem kerül a kérésbe

      app.onRegisterFieldChange();
      tick(399);
      backend.expectNone('/api/auth/availability');
      tick(1);

      const request = availability();
      expect(request.request.params.get('email')).toBe('anna@test.hu');
      expect(request.request.params.has('username')).toBeFalse();
      request.flush({ emailTaken: false, usernameTaken: null });
    }));

    it('új gépelés eldobja a függő kérést (csak az utolsó megy el)', fakeAsync(() => {
      app.mode = 'register';
      app.registerUsername = 'anna';
      app.onRegisterFieldChange();
      tick(200);
      app.registerUsername = 'annabella';
      app.onRegisterFieldChange();
      tick(400);

      const request = availability();
      expect(request.request.params.get('username')).toBe('annabella');
      request.flush({ emailTaken: null, usernameTaken: true });
      expect(app.usernameTaken).toBeTrue();
    }));

    it('a régebbi, később érkező válasz nem írja felül az újabbat', fakeAsync(() => {
      app.mode = 'register';
      app.registerUsername = 'anna';
      app.onRegisterFieldChange();
      tick(400);
      const first = availability();

      app.registerUsername = 'annabella';
      app.onRegisterFieldChange();
      tick(400);
      const second = availability();

      second.flush({ emailTaken: null, usernameTaken: false });
      first.flush({ emailTaken: null, usernameTaken: true });

      expect(app.usernameTaken).toBeFalse();
    }));

    it('hibás ellenőrzésnél nem jelöl semmit foglaltnak', fakeAsync(() => {
      app.mode = 'register';
      app.email = 'anna@test.hu';
      app.onRegisterFieldChange();
      tick(400);

      availability().flush('', { status: 500, statusText: 'Server Error' });

      expect(app.emailTaken).toBeFalse();
    }));

    it('módváltáskor törli a foglaltsági jelzést és a megerősítő jelszót', fakeAsync(() => {
      app.mode = 'register';
      app.emailTaken = true;
      app.passwordConfirm = 'x';
      app.errorMessage = 'hiba';

      app.setMode('login');

      expect(app.mode).toBe('login');
      expect(app.emailTaken).toBeFalse();
      expect(app.passwordConfirm).toBe('');
      expect(app.errorMessage).toBeNull();
      flush();
    }));
  });

  describe('kijelentkezés és navigáció', () => {
    it('a kijelentkezés törli a munkamenetet és a profilt, és a belépés fülre vált', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      app.mode = 'register';
      app.password = 'titok';
      app.view = 'stats';

      app.logout();

      expect(session.isLoggedIn()).toBeFalse();
      expect(app.password).toBe('');
      expect(app.mode).toBe('login');
      expect(app.view).toBe('study');
      expect(app.profileEmail).toBeNull();
    });

    it('401 miatti kényszerkijelentkezésnél is takarít a komponens', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      TestBed.flushEffects();
      app.view = 'stats';
      app.username = 'anna';

      session.clear(true);
      TestBed.flushEffects();

      expect(app.view).toBe('study');
      expect(app.username).toBe('');
    });

    it('be nem mentett beillesztés mellett a Paklik nézet elhagyása megerősítést kér', () => {
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
      app.view = 'decks';
      (loose() as unknown as { decksView: { hasUnsavedPaste: boolean } }).decksView = { hasUnsavedPaste: true };

      app.goTo('stats');
      expect(confirmSpy).toHaveBeenCalled();
      expect(app.view).toBe('decks');

      confirmSpy.and.returnValue(true);
      app.goTo('stats');
      expect(app.view).toBe('stats');
    });

    it('a Paklik nézetbe lépés és a mentetlen sor nélküli elhagyás nem kér megerősítést', () => {
      const confirmSpy = spyOn(window, 'confirm');
      app.view = 'decks';

      app.goTo('grammar');
      app.goTo('decks');

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(app.view).toBe('decks');
    });

    it('a goTo bezárja a fiókmenüt és elengedi a kijelölt paklit', () => {
      app.menuOpen = true;
      app.studyDeckId = 5;

      app.goTo('composition');

      expect(app.menuOpen).toBeFalse();
      expect(app.studyDeckId).toBeNull();
    });

    it('a studyDeck a Tanulás nézetre vált az adott pakli kiválasztásával', () => {
      app.studyDeck(9);

      expect(app.view).toBe('study');
      expect(app.studyDeckId).toBe(9);
    });

    it('a profil nézet újratölti a profilt, a beállítások nézet a tanulási beállításokat', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      app.goTo('profile');
      expect(app.view).toBe('profile');
      backend.expectOne('/api/auth/profile').flush(profile());

      app.goTo('settings');
      expect(app.view).toBe('settings');
      backend.expectOne('/api/study/settings').flush(settings());
      backend.expectOne('/api/ai/models').flush(models);
    });

    it('a fiókmenü az Escape-re és a mellé kattintásra bezárul, a gomb kattintása nyitja', () => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      app.toggleMenu(event);
      expect(app.menuOpen).toBeTrue();
      expect(event.stopPropagation).toHaveBeenCalled();

      app.onEscape();
      expect(app.menuOpen).toBeFalse();

      app.menuOpen = true;
      app.closeMenu();
      expect(app.menuOpen).toBeFalse();
    });

    it('a kezdőbetű a megjelenített névből, az emailből vagy kérdőjelből jön', () => {
      expect(app.initial()).toBe('?');

      session.setSession(tokenFor('1'), 'zoltan@test.hu');
      expect(app.initial()).toBe('Z');

      app.savedDisplayName = 'ősz Elemér';
      expect(app.initial()).toBe('Ő');
    });
  });

  describe('profil', () => {
    it('betölti a profil adatait, és avatar esetén a token azonosítójából képcímet készít', () => {
      session.setSession(tokenFor('42'), 'anna@test.hu');

      app.openProfile();
      backend.expectOne('/api/auth/profile').flush(profile({ hasAvatar: true }));

      expect(app.profileEmail).toBe('anna@test.hu');
      expect(app.username).toBe('anna');
      expect(app.studyDayStreak).toBe(3);
      expect(app.hasAvatar).toBeTrue();
      expect(app.avatarUrl).toMatch(/^\/api\/auth\/avatar\/42\?v=\d+$/);
    });

    it('avatar nélkül vagy érvénytelen tokennél nincs képcím', () => {
      session.setSession(tokenFor('42'), 'anna@test.hu');
      app.openProfile();
      backend.expectOne('/api/auth/profile').flush(profile({ hasAvatar: false }));
      expect(app.avatarUrl).toBeNull();

      session.setSession('nem-jwt', 'anna@test.hu');
      app.openProfile();
      backend.expectOne('/api/auth/profile').flush(profile({ hasAvatar: true }));
      expect(app.avatarUrl).toBeNull();
    });

    it('hibás profil-betöltésnél nullázza az avatart és a sorozatot', () => {
      session.setSession(tokenFor('42'), 'anna@test.hu');
      app.studyDayStreak = 9;
      app.openProfile();

      backend.expectOne('/api/auth/profile').flush('', { status: 500, statusText: 'Server Error' });

      expect(app.studyDayStreak).toBe(0);
      expect(app.avatarUrl).toBeNull();
    });

    it('a felhasználónevet küldés előtt ellenőrzi', () => {
      app.username = 'a b';

      app.saveUsername();

      expect(app.profileError).toContain('3–30 karakter');
      backend.expectNone('/api/auth/profile/username');
    });

    it('sikeres névmentés után üzenetet ír és újratölt', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      app.username = ' uj.nev ';

      app.saveUsername();
      const request = backend.expectOne('/api/auth/profile/username');
      expect(request.request.body).toEqual({ username: 'uj.nev' });
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(app.profileMessage).toBe('A felhasználónév mentve.');
      expect(app.isSavingUsername).toBeFalse();
      backend.expectOne('/api/auth/profile').flush(profile());
    });

    it('a szerver hibacímét mutatja, ha a név foglalt', () => {
      app.username = 'foglalt';

      app.saveUsername();
      backend.expectOne('/api/auth/profile/username').flush({ title: 'Ez a felhasználónév már foglalt.' }, { status: 409, statusText: 'Conflict' });

      expect(app.profileError).toBe('Ez a felhasználónév már foglalt.');
    });

    it('a megjelenített név mentése és hibája', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      app.displayName = 'Anna K.';

      app.saveDisplayName();
      backend.expectOne('/api/auth/profile').flush(null, { status: 204, statusText: 'No Content' });
      expect(app.profileMessage).toBe('A megjelenített név mentve.');
      backend.expectOne('/api/auth/profile').flush(profile());

      app.saveDisplayName();
      backend.expectOne('/api/auth/profile').flush('', { status: 500, statusText: 'Server Error' });
      expect(app.profileError).toBe('A név mentése sikertelen.');
    });

    it('a profilkép feltöltése: 1 MB fölött elutasítja, egyébként multipart kérést küld', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');
      const input = (file?: File) => ({ target: { files: file ? [file] : [], value: 'x' } }) as unknown as Event;

      app.uploadAvatar(input());
      backend.expectNone('/api/auth/avatar');

      app.uploadAvatar(input(new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' })));
      expect(app.profileError).toBe('Csak JPEG, PNG vagy WebP kép tölthető fel, legfeljebb 1 MB.');
      backend.expectNone('/api/auth/avatar');

      app.uploadAvatar(input(new File([new Uint8Array(10)], 'ok.png', { type: 'image/png' })));
      const upload = backend.expectOne('/api/auth/avatar');
      expect(upload.request.method).toBe('PUT');
      expect(upload.request.body instanceof FormData).toBeTrue();
      upload.flush(null, { status: 204, statusText: 'No Content' });
      expect(app.profileMessage).toBe('A profilkép feltöltve.');
      backend.expectOne('/api/auth/profile').flush(profile({ hasAvatar: true }));
    });

    it('a profilkép törlése', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');

      app.deleteAvatar();
      backend.expectOne('/api/auth/avatar').flush(null, { status: 204, statusText: 'No Content' });

      expect(app.profileMessage).toBe('A profilkép törölve.');
      backend.expectOne('/api/auth/profile').flush(profile());
    });

    it('jelszócsere után az új tokent használja, és ugyanabban a tárolóban marad', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu', true);
      app.currentPassword = 'Regi12345';
      app.newPassword = 'Uj123456';
      const newToken = tokenFor('1') + 'x';

      app.changePassword();
      const request = backend.expectOne('/api/auth/password');
      expect(request.request.body).toEqual({ currentPassword: 'Regi12345', newPassword: 'Uj123456' });
      request.flush({ token: newToken, email: 'anna@test.hu' });

      expect(session.token()).toBe(newToken);
      expect(localStorage.getItem('vocabapp.token')).toBe(newToken);
      expect(app.profileMessage).toBe('A jelszó megváltozott.');
      expect(app.currentPassword).toBe('');
      expect(app.newPassword).toBe('');
    });

    it('hibás jelenlegi jelszónál a szerver üzenetét mutatja és belépve marad', () => {
      session.setSession(tokenFor('1'), 'anna@test.hu');

      app.changePassword();
      backend.expectOne('/api/auth/password').flush({ title: 'Hibás jelszó.' }, { status: 400, statusText: 'Bad Request' });

      expect(app.profileError).toBe('Hibás jelszó.');
      expect(session.isLoggedIn()).toBeTrue();
    });

    it('a fiók törlése megerősítés nélkül nem történik meg', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      app.deleteSlide = 80;

      app.deleteAccount();

      expect(app.deleteSlide).toBe(0);
      backend.expectNone('/api/auth/account');
    });

    it('megerősített fióktörlés után kijelentkeztet', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      session.setSession(tokenFor('1'), 'anna@test.hu');

      app.deleteAccount();
      backend.expectOne('/api/auth/account').flush(null, { status: 204, statusText: 'No Content' });

      expect(session.isLoggedIn()).toBeFalse();
      expect(app.isDeletingAccount).toBeFalse();
    });

    it('sikertelen fióktörlésnél belépve marad és hibát jelez', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      session.setSession(tokenFor('1'), 'anna@test.hu');

      app.deleteAccount();
      backend.expectOne('/api/auth/account').flush('', { status: 500, statusText: 'Server Error' });

      expect(session.isLoggedIn()).toBeTrue();
      expect(app.profileError).toBe('A fiók törlése sikertelen.');
    });

    it('a törlés-csúszka értéke számmá alakul, érvénytelen érték nullára esik', () => {
      app.onDeleteSlide({ target: { value: '75' } } as unknown as Event);
      expect(app.deleteSlide).toBe(75);

      app.onDeleteSlide({ target: { value: 'abc' } } as unknown as Event);
      expect(app.deleteSlide).toBe(0);
    });
  });

  describe('tanulási beállítások', () => {
    it('betöltéskor minden mezőt átvesz és engedélyezi a mentést', () => {
      loadSettings({
        dailyNewCardGoal: 12,
        minimumAnswerSeconds: 3,
        acceptEnglishSynonyms: true,
        savedLevelPolicy: 'noHarder',
        leechThreshold: 9,
        aiFillRemainingToday: 40,
        exampleLevel: 'C1',
        aiModel: 'openai/gpt-5-mini',
        timeZoneId: 'America/New_York',
      });

      expect(app.studySettingsLoaded).toBeTrue();
      expect(app.isLoadingStudySettings).toBeFalse();
      expect(app.dailyNewCardGoal).toBe(12);
      expect(app.minimumAnswerSeconds).toBe(3);
      expect(app.acceptEnglishSynonyms).toBeTrue();
      expect(app.allowOtherSavedLevels).toBeTrue();
      expect(app.savedLevelPolicy).toBe('noHarder');
      expect(app.leechThreshold).toBe(9);
      expect(app.aiFillRemainingToday).toBe(40);
      expect(app.exampleLevel).toBe('C1');
      expect(app.aiModel).toBe('openai/gpt-5-mini');
      expect(app.timeZoneId).toBe('America/New_York');
      expect(app.aiModels.length).toBe(2);
    });

    it('az „exact” szabály a „más szintek” kapcsolót kikapcsolja', () => {
      loadSettings({ savedLevelPolicy: 'exact' });

      expect(app.allowOtherSavedLevels).toBeFalse();
    });

    it('a listában nem szereplő mentett modellt választhatóvá teszi', () => {
      loadSettings({ aiModel: 'retired/model' });

      expect(app.aiModels.map(model => model.id)).toContain('retired/model');
    });

    it('betöltési hibánál hibaüzenetet mutat és a mentés tiltott marad', () => {
      app.loadStudySettings();
      backend.expectOne('/api/study/settings').flush('', { status: 500, statusText: 'Server Error' });

      expect(app.profileError).toBe('A tanulási beállítások betöltése sikertelen.');
      expect(app.studySettingsLoaded).toBeFalse();
    });

    it('a régebbi, később érkező betöltési válasz nem írja felül az újabbat', () => {
      app.loadStudySettings();
      const first = backend.expectOne('/api/study/settings');
      app.loadStudySettings();
      const second = backend.expectOne('/api/study/settings');

      second.flush(settings({ dailyNewCardGoal: 50 }));
      first.flush(settings({ dailyNewCardGoal: 1 }));
      backend.match('/api/ai/models').forEach(request => request.flush(models));

      expect(app.dailyNewCardGoal).toBe(50);
    });

    it('betöltés előtt a mentés nem küld kérést', () => {
      app.saveStudySettings();

      backend.expectNone('/api/study/settings');
      expect(app.isSavingStudySettings).toBeFalse();
    });

    for (const [label, change, message] of [
      ['napi cél', (a: AppComponent) => (a.dailyNewCardGoal = 101), 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.'],
      ['negatív napi cél', (a: AppComponent) => (a.dailyNewCardGoal = -1), 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.'],
      ['tört napi cél', (a: AppComponent) => (a.dailyNewCardGoal = 2.5), 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.'],
      ['minimum idő', (a: AppComponent) => (a.minimumAnswerSeconds = 121), 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.'],
      ['üres minimum idő', (a: AppComponent) => (a.minimumAnswerSeconds = null), 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.'],
      ['nehéz szó küszöb', (a: AppComponent) => (a.leechThreshold = 1), 'A nehéz szó küszöbe 2–50 hiba lehet.'],
      ['csomagméret', (a: AppComponent) => (a.aiFillBatchSize = 11), 'Az MI-kitöltés csomagmérete 1 és 10 között lehet.'],
      ['mondatszint', (a: AppComponent) => (a.exampleLevel = 'D1'), 'A mondatszint A1, A2, B1, B2, C1 vagy C2 lehet.'],
      ['modell', (a: AppComponent) => (a.aiModel = 'nincs/ilyen'), 'Válassz a listában szereplő modellek közül.'],
    ] as Array<[string, (a: AppComponent) => void, string]>) {
      it(`érvénytelen ${label} esetén helyben elutasítja a mentést`, () => {
        loadSettings();
        change(app);

        app.saveStudySettings();

        expect(app.profileError).toBe(message);
        backend.expectNone('/api/study/settings');
      });
    }

    it('a mentés a teljes beállításcsomagot elküldi, és a választ visszaírja', () => {
      loadSettings();
      app.dailyNewCardGoal = 15;
      app.allowOtherSavedLevels = true;
      app.savedLevelPolicy = 'noEasier';
      app.aiModel = 'openai/gpt-5-mini';

      app.saveStudySettings();
      const request = backend.expectOne('/api/study/settings');
      expect(request.request.method).toBe('PUT');
      expect(Object.keys(request.request.body as object).sort()).toEqual([
        'acceptEnglishSynonyms',
        'acceptHungarianParaphrase',
        'acceptPartialMeaningMatch',
        'aiFillBatchSize',
        'aiModel',
        'automaticAiCheck',
        'dailyNewCardGoal',
        'exampleLevel',
        'generateAlternateDefinitions',
        'leechThreshold',
        'minimumAnswerSeconds',
        'repeatMistakes',
        'requireAppealReason',
        'reuseSavedExamples',
        'savedLevelPolicy',
        'timeZoneId',
      ]);
      expect((request.request.body as Record<string, unknown>)['savedLevelPolicy']).toBe('noEasier');
      expect((request.request.body as Record<string, unknown>)['dailyNewCardGoal']).toBe(15);
      request.flush(settings({ dailyNewCardGoal: 15, savedLevelPolicy: 'noEasier', aiModel: 'openai/gpt-5-mini' }));

      expect(app.profileMessage).toBe('A tanulási beállítások mentve.');
      expect(app.isSavingStudySettings).toBeFalse();
      expect(app.dailyNewCardGoal).toBe(15);
    });

    it('a „más szintek” kapcsoló nélkül mindig az „exact” szabályt küldi', () => {
      loadSettings();
      app.allowOtherSavedLevels = false;
      app.savedLevelPolicy = 'all';

      app.saveStudySettings();

      const request = backend.expectOne('/api/study/settings');
      expect((request.request.body as Record<string, unknown>)['savedLevelPolicy']).toBe('exact');
      request.flush(settings());
    });

    it('érvénytelen szint-szabályt nem enged menteni', () => {
      loadSettings();
      app.allowOtherSavedLevels = true;
      (app as unknown as { savedLevelPolicy: string }).savedLevelPolicy = 'bogus';

      app.saveStudySettings();

      expect(app.profileError).toBe('Válassz a három lehetőség közül.');
      backend.expectNone('/api/study/settings');
    });

    it('mentési hibánál a szerver üzenetét mutatja', () => {
      loadSettings();

      app.saveStudySettings();
      backend.expectOne('/api/study/settings').flush({ title: 'A mondatszint érvénytelen.' }, { status: 400, statusText: 'Bad Request' });

      expect(app.profileError).toBe('A mondatszint érvénytelen.');
    });

    it('futó mentés közben nem indít másodikat', () => {
      loadSettings();

      app.saveStudySettings();
      app.saveStudySettings();

      expect(backend.match('/api/study/settings').length).toBe(1);
    });

    it('kijelentkezés után az előző fiók beállításai nem menthetők', () => {
      loadSettings();
      session.setSession(tokenFor('1'), 'anna@test.hu');

      app.logout();
      app.saveStudySettings();

      expect(app.studySettingsLoaded).toBeFalse();
      backend.expectNone('/api/study/settings');
    });

    it('a modelllistát csak egyszer kéri le', () => {
      loadSettings();

      app.loadStudySettings();
      backend.expectOne('/api/study/settings').flush(settings());

      backend.expectNone('/api/ai/models');
      expect(app.aiModels.length).toBe(2);
    });

    it('a modelllista hibájánál a kiválasztott modell választható marad', () => {
      app.loadStudySettings();
      backend.expectOne('/api/study/settings').flush(settings({ aiModel: 'google/gemini-3.6-flash' }));
      backend.expectOne('/api/ai/models').flush('', { status: 500, statusText: 'Server Error' });

      expect(app.aiModels.map(model => model.id)).toEqual(['google/gemini-3.6-flash']);
    });
  });
});
