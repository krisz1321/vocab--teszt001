import { Injectable, signal } from '@angular/core';

export type ThemeName = 'ocean' | 'forest' | 'sunset';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeOption {
  id: ThemeName;
  label: string;
  description: string;
  light: string[];
  dark: string[];
}

const nameKey = 'vocabapp.theme';
const modeKey = 'vocabapp.mode';

// Az előnézeti színminták: [háttér, felület, elsődleges, kiemelés]
export const themeOptions: ThemeOption[] = [
  {
    id: 'ocean',
    label: 'Óceán',
    description: 'Hűvös indigó, lágy árnyékok, modern app-érzés.',
    light: ['#f2f5fc', '#ffffff', '#4f46e5', '#0ea5e9'],
    dark: ['#0a0f20', '#131a33', '#8b93ff', '#38bdf8'],
  },
  {
    id: 'forest',
    label: 'Erdő',
    description: 'Nyugodt zöld, lapos és letisztult, olvasásra hangolva.',
    light: ['#f3f5ef', '#fdfdfb', '#2f7d5b', '#c98a1b'],
    dark: ['#0d1511', '#15201a', '#5fc79a', '#e0b04f'],
  },
  {
    id: 'sunset',
    label: 'Naplemente',
    description: 'Meleg korall, nagy lekerekítés, játékos hangulat.',
    light: ['#fff5ee', '#ffffff', '#e5533c', '#f59e0b'],
    dark: ['#170e11', '#241619', '#ff8a70', '#fbbf24'],
  },
];

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly name = signal<ThemeName>(readStored(nameKey, ['ocean', 'forest', 'sunset'], 'ocean'));
  readonly mode = signal<ThemeMode>(readStored(modeKey, ['light', 'dark', 'system'], 'system'));

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.apply();
    this.media.addEventListener('change', () => {
      if (this.mode() === 'system') {
        this.apply();
      }
    });
  }

  setName(name: ThemeName): void {
    this.name.set(name);
    this.store(nameKey, name);
    this.apply();
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    this.store(modeKey, mode);
    this.apply();
  }

  private apply(): void {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && this.media.matches);
    const root = document.documentElement;
    root.setAttribute('data-theme', this.name());
    root.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
  }

  private store(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // a böngésző tiltja a tárolást; a téma csak az oldal bezárásáig érvényes
    }
  }
}
