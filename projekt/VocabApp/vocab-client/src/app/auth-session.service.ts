import { Injectable, signal } from '@angular/core';

const tokenKey = 'vocabapp.token';
const emailKey = 'vocabapp.email';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  readonly email = signal<string | null>(sessionStorage.getItem(emailKey));
  readonly isLoggedIn = signal(sessionStorage.getItem(tokenKey) !== null);
  // Igaz, ha a munkamenetet a szerver 401-es válasza zárta le (lejárt token vagy törölt fiók); a belépési képernyő jelzi.
  readonly expired = signal(false);

  token(): string | null {
    return sessionStorage.getItem(tokenKey);
  }

  setSession(token: string, email: string): void {
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(emailKey, email);
    this.email.set(email);
    this.expired.set(false);
    this.isLoggedIn.set(true);
  }

  clear(expired = false): void {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(emailKey);
    this.email.set(null);
    this.expired.set(expired);
    this.isLoggedIn.set(false);
  }
}
