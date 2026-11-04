import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from './auth-session.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: AuthSessionService;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('bejelentkezve Bearer tokent fűz az API-hívásokhoz', () => {
    session.setSession('secret-token', 'a@b.hu');

    http.get('/api/decks').subscribe();

    const request = backend.expectOne('/api/decks');
    expect(request.request.headers.get('Authorization')).toBe('Bearer secret-token');
    request.flush([]);
  });

  it('token nélkül nem küld Authorization fejlécet', () => {
    http.get('/api/decks').subscribe();

    const request = backend.expectOne('/api/decks');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush([]);
  });

  it('nem API-címre nem küldi el a tokent', () => {
    session.setSession('secret-token', 'a@b.hu');

    http.get('https://example.com/data.json').subscribe();

    const request = backend.expectOne('https://example.com/data.json');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
  });

  it('401-re bejelentkezve kijelentkeztet és lejártnak jelöl, a hibát továbbadja', () => {
    session.setSession('expired-token', 'a@b.hu');
    let error: HttpErrorResponse | undefined;

    http.get('/api/decks').subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    backend.expectOne('/api/decks').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(session.isLoggedIn()).toBeFalse();
    expect(session.expired()).toBeTrue();
    expect(error?.status).toBe(401);
  });

  for (const url of ['/api/auth/login', '/api/auth/register', '/api/auth/password']) {
    it(`a(z) ${url} 401-ese hitelesítési hiba, nem jár kijelentkeztetéssel`, () => {
      session.setSession('valid-token', 'a@b.hu');

      http.post(url, {}).subscribe({ error: () => undefined });
      backend.expectOne(url).flush('', { status: 401, statusText: 'Unauthorized' });

      expect(session.isLoggedIn()).toBeTrue();
      expect(session.expired()).toBeFalse();
    });
  }

  it('nem 401-es hibánál nem jelentkeztet ki', () => {
    session.setSession('valid-token', 'a@b.hu');

    http.get('/api/decks').subscribe({ error: () => undefined });
    backend.expectOne('/api/decks').flush('', { status: 500, statusText: 'Server Error' });

    expect(session.isLoggedIn()).toBeTrue();
  });

  it('kijelentkezve a 401 nem állítja lejártra a munkamenetet', () => {
    http.get('/api/decks').subscribe({ error: () => undefined });
    backend.expectOne('/api/decks').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(session.expired()).toBeFalse();
  });

  it('nem API-cím 401-ese sem jelentkeztet ki', () => {
    session.setSession('valid-token', 'a@b.hu');

    http.get('https://example.com/x').subscribe({ error: () => undefined });
    backend.expectOne('https://example.com/x').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(session.isLoggedIn()).toBeTrue();
  });
});
