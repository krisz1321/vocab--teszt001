import { Injectable, computed, signal } from '@angular/core';

export type SpeechLang = 'en' | 'hu';

export interface SpeechSettings {
  enabled: boolean;
  englishEnabled: boolean;
  hungarianEnabled: boolean;
  /** A kiválasztott hang neve; üres = a böngésző alapértelmezett hangja. */
  englishVoice: string;
  hungarianVoice: string;
  rate: number;
  pitch: number;
}

export const defaultSpeechSettings: SpeechSettings = {
  enabled: true,
  englishEnabled: true,
  hungarianEnabled: true,
  englishVoice: '',
  hungarianVoice: '',
  rate: 0.85,
  pitch: 1,
};

export const speechRateRange = { min: 0.5, max: 1.5, step: 0.05 };
export const speechPitchRange = { min: 0.5, max: 1.5, step: 0.05 };

const storageKey = 'vocabapp.speech';

const langTag: Record<SpeechLang, string> = { en: 'en-US', hu: 'hu-HU' };

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function readStored(): SpeechSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { ...defaultSpeechSettings };
    }

    const stored = JSON.parse(raw) as Partial<SpeechSettings>;
    const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      enabled: flag(stored.enabled, defaultSpeechSettings.enabled),
      englishEnabled: flag(stored.englishEnabled, defaultSpeechSettings.englishEnabled),
      hungarianEnabled: flag(stored.hungarianEnabled, defaultSpeechSettings.hungarianEnabled),
      englishVoice: text(stored.englishVoice),
      hungarianVoice: text(stored.hungarianVoice),
      rate: clamp(stored.rate, speechRateRange.min, speechRateRange.max, defaultSpeechSettings.rate),
      pitch: clamp(stored.pitch, speechPitchRange.min, speechPitchRange.max, defaultSpeechSettings.pitch),
    };
  } catch {
    return { ...defaultSpeechSettings };
  }
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  /** Igaz, ha a böngésző tud beszédet szintetizálni. */
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  readonly settings = signal<SpeechSettings>(readStored());
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  /** A most felolvasás alatt álló szöveg azonosítója (lásd speakingId). */
  readonly speaking = signal<string | null>(null);

  readonly englishVoices = computed(() => this.voicesFor('en'));
  readonly hungarianVoices = computed(() => this.voicesFor('hu'));

  private utteranceCounter = 0;

  constructor() {
    if (!this.supported) {
      return;
    }

    this.loadVoices();
    // Chrome és Edge a hangokat aszinkron tölti be.
    window.speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
  }

  update(patch: Partial<SpeechSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // a böngésző tiltja a tárolást; a beállítás csak az oldal bezárásáig érvényes
    }
  }

  reset(): void {
    this.stop();
    this.update({ ...defaultSpeechSettings });
  }

  /**
   * Igaz, ha az adott nyelven most van értelme felolvasó gombot mutatni:
   * a felolvasás és a nyelv be van kapcsolva, és (ha a hangok már betöltöttek) van hozzá hang.
   */
  canSpeak(lang: SpeechLang): boolean {
    if (!this.supported) {
      return false;
    }

    const settings = this.settings();
    if (!settings.enabled || !(lang === 'en' ? settings.englishEnabled : settings.hungarianEnabled)) {
      return false;
    }

    return this.voices().length === 0 || this.voicesFor(lang).length > 0;
  }

  speakingId(text: string, lang: SpeechLang): string {
    return `${lang}:${text.trim()}`;
  }

  /** `force`: a beállításokban lévő kipróbáláshoz, a kikapcsolt nyelv ellenére is megszólal. */
  speak(text: string, lang: SpeechLang = 'en', force = false): void {
    const trimmed = text?.trim();
    if (!this.supported || !trimmed) {
      return;
    }

    if (!force && !this.canSpeak(lang)) {
      return;
    }

    const settings = this.settings();
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = langTag[lang];
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;

    const voiceName = lang === 'en' ? settings.englishVoice : settings.hungarianVoice;
    const voice = voiceName ? this.voicesFor(lang).find((candidate) => candidate.name === voiceName) : undefined;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    const id = this.speakingId(trimmed, lang);
    const token = ++this.utteranceCounter;
    const finish = () => {
      // egy újabb felolvasás már átvette a helyét
      if (token === this.utteranceCounter) {
        this.speaking.set(null);
      }
    };
    utterance.onstart = () => {
      if (token === this.utteranceCounter) {
        this.speaking.set(id);
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    this.speaking.set(id);
    synth.speak(utterance);
  }

  stop(): void {
    this.utteranceCounter++;
    this.speaking.set(null);
    if (this.supported) {
      window.speechSynthesis.cancel();
    }
  }

  private loadVoices(): void {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.voices.set(voices);
    }
  }

  private voicesFor(lang: SpeechLang): SpeechSynthesisVoice[] {
    // Androidon a nyelvkód alulvonásos lehet (hu_HU), ezért normalizálunk.
    return this.voices()
      .filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(lang))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
