import { Injectable, signal } from '@angular/core';

const tokenKey = 'vocabapp.token';
const emailKey = 'vocabapp.email';

// A böngészőtároló letiltható (privát mód, blokkolt sütik), ezért minden hozzáférés védett (L-33 minta).
function readItem(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeItem(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) {
      storage().removeItem(key);
    } else {
      storage().setItem(key, value);
    }
  } catch {
    // A tároló nem elérhető: a munkamenet csak a memóriában (a jelzőkben) él.
  }
}

const session = () => sessionStorage;
const persistent = () => localStorage;

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  // A munkamenet a sessionStorage-ban él (a fül bezárásáig); a „Maradjak bejelentkezve” a localStorage-ba ír.
  // Olvasáskor előbb a sessionStorage számít.
  readonly email = signal<string | null>(this.read(emailKey));
  readonly isLoggedIn = signal(this.read(tokenKey) !== null);
  // Igaz, ha a munkamenetet a szerver 401-es válasza zárta le (lejárt token vagy törölt fiók); a belépési képernyő jelzi.
  readonly expired = signal(false);

  token(): string | null {
    return this.read(tokenKey);
  }

  /** `remember` nélkül a tárolási hely marad, ami volt (pl. jelszócsere utáni új tokennél). */
  setSession(token: string, email: string, remember = this.isRemembered()): void {
    const target = remember ? persistent : session;
    const other = remember ? session : persistent;
    writeItem(target, tokenKey, token);
    writeItem(target, emailKey, email);
    writeItem(other, tokenKey, null);
    writeItem(other, emailKey, null);
    this.email.set(email);
    this.expired.set(false);
    this.isLoggedIn.set(true);
  }

  clear(expired = false): void {
    for (const storage of [session, persistent]) {
      writeItem(storage, tokenKey, null);
      writeItem(storage, emailKey, null);
    }

    this.email.set(null);
    this.expired.set(expired);
    this.isLoggedIn.set(false);
  }

  private read(key: string): string | null {
    return readItem(session, key) ?? readItem(persistent, key);
  }

  private isRemembered(): boolean {
    return readItem(session, tokenKey) === null && readItem(persistent, tokenKey) !== null;
  }
}
