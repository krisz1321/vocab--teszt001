import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'light' | 'dark' | 'system';

// Ugyanez a kulcs az index.html festés előtti scriptjében is szerepel.
const themeKey = 'vocabapp.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(readChoice());
  readonly mode = signal<'light' | 'dark'>('light');
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  constructor() {
    this.apply();
    // Rendszer módban kövesse az operációs rendszer váltását is.
    this.media?.addEventListener('change', () => {
      if (this.choice() === 'system') {
        this.apply();
      }
    });
  }

  setChoice(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      localStorage.setItem(themeKey, choice);
    } catch {
      // Letiltott tárolónál csak erre a munkamenetre érvényes.
    }

    this.apply();
  }

  private apply(): void {
    const choice = this.choice();
    const mode = choice === 'system' ? (this.media?.matches ? 'dark' : 'light') : choice;
    this.mode.set(mode);
    document.documentElement.setAttribute('data-theme', mode);
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(themeKey);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
