import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from './auth-session.service';

const tokenKey = 'vocabapp.token';
const emailKey = 'vocabapp.email';

describe('AuthSessionService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  const create = () => TestBed.inject(AuthSessionService);

  it('tároló nélkül kijelentkezett állapotban indul', () => {
    const session = create();

    expect(session.isLoggedIn()).toBeFalse();
    expect(session.token()).toBeNull();
    expect(session.email()).toBeNull();
    expect(session.expired()).toBeFalse();
  });

  it('a sessionStorage-ból visszaállítja a munkamenetet', () => {
    sessionStorage.setItem(tokenKey, 'abc');
    sessionStorage.setItem(emailKey, 'a@b.hu');

    const session = create();

    expect(session.isLoggedIn()).toBeTrue();
    expect(session.token()).toBe('abc');
    expect(session.email()).toBe('a@b.hu');
  });

  it('a localStorage-ból is visszaállítja, de a sessionStorage előnyt élvez', () => {
    localStorage.setItem(tokenKey, 'local-token');
    expect(create().token()).toBe('local-token');

    sessionStorage.setItem(tokenKey, 'session-token');
    expect(create().token()).toBe('session-token');
  });

  it('a setSession alapból a sessionStorage-ba ír', () => {
    const session = create();

    session.setSession('t1', 'x@y.hu');

    expect(sessionStorage.getItem(tokenKey)).toBe('t1');
    expect(sessionStorage.getItem(emailKey)).toBe('x@y.hu');
    expect(localStorage.getItem(tokenKey)).toBeNull();
    expect(session.isLoggedIn()).toBeTrue();
    expect(session.email()).toBe('x@y.hu');
  });

  it('a „Maradjak bejelentkezve” a localStorage-ba ír és kiüríti a sessionStorage-ot', () => {
    sessionStorage.setItem(tokenKey, 'old');
    const session = create();

    session.setSession('t2', 'x@y.hu', true);

    expect(localStorage.getItem(tokenKey)).toBe('t2');
    expect(localStorage.getItem(emailKey)).toBe('x@y.hu');
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
    expect(session.token()).toBe('t2');
  });

  it('a tárolási hely megmarad, ha a hívó nem ad meg „remember” értéket (pl. jelszócsere után)', () => {
    localStorage.setItem(tokenKey, 'remembered');
    const session = create();

    session.setSession('renewed', 'x@y.hu');

    expect(localStorage.getItem(tokenKey)).toBe('renewed');
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
  });

  it('a clear mindkét tárolót üríti és jelzi a lejáratot', () => {
    const session = create();
    session.setSession('t', 'x@y.hu', true);

    session.clear(true);

    expect(session.isLoggedIn()).toBeFalse();
    expect(session.email()).toBeNull();
    expect(session.expired()).toBeTrue();
    expect(localStorage.getItem(tokenKey)).toBeNull();
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
  });

  it('a clear lejárat nélkül nem jelöli lejártnak, a következő belépés pedig törli a jelzést', () => {
    const session = create();
    session.clear();
    expect(session.expired()).toBeFalse();

    session.clear(true);
    expect(session.expired()).toBeTrue();

    session.setSession('t', 'x@y.hu');
    expect(session.expired()).toBeFalse();
  });

  it('letiltott tárolónál nem dob kivételt, a munkamenet a memóriában él', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'removeItem').and.throwError('blocked');

    const session = create();
    expect(session.isLoggedIn()).toBeFalse();

    expect(() => session.setSession('t', 'x@y.hu')).not.toThrow();
    expect(session.isLoggedIn()).toBeTrue();
    expect(session.email()).toBe('x@y.hu');

    expect(() => session.clear()).not.toThrow();
    expect(session.isLoggedIn()).toBeFalse();
  });
});
