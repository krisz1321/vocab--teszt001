import { Injectable, signal } from '@angular/core';

const tokenKey = 'vocabapp.token';
const emailKey = 'vocabapp.email';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  readonly email = signal<string | null>(sessionStorage.getItem(emailKey));
  readonly isLoggedIn = signal(sessionStorage.getItem(tokenKey) !== null);

  token(): string | null {
    return sessionStorage.getItem(tokenKey);
  }

  setSession(token: string, email: string): void {
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(emailKey, email);
    this.email.set(email);
    this.isLoggedIn.set(true);
  }

  clear(): void {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(emailKey);
    this.email.set(null);
    this.isLoggedIn.set(false);
  }
}
