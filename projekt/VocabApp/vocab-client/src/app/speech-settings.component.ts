import { Component, inject } from '@angular/core';
import {
  SpeechLang,
  SpeechService,
  SpeechSettings,
  speechPitchRange,
  speechRateRange,
} from './speech.service';

interface LangBlock {
  lang: SpeechLang;
  title: string;
  toggleKey: 'englishEnabled' | 'hungarianEnabled';
  voiceKey: 'englishVoice' | 'hungarianVoice';
  sample: string;
}

@Component({
  selector: 'app-speech-settings',
  standalone: true,
  template: `
    @if (!speech.supported) {
      <div class="alert alert-warning mb-0" role="alert">
        Ez a böngésző nem támogatja a felolvasást. Próbáld Chrome, Edge vagy Safari böngészővel.
      </div>
    } @else {
      <div class="form-check form-switch mb-3">
        <input
          id="speechEnabled"
          type="checkbox"
          role="switch"
          class="form-check-input"
          [checked]="settings().enabled"
          (change)="setEnabled($event)">
        <label class="form-check-label fw-semibold" for="speechEnabled">Felolvasás engedélyezése</label>
        <div class="form-text">Kikapcsolva a kártyákról eltűnnek a hangszóró gombok.</div>
      </div>

      <div class="speech-options" [class.is-disabled]="!settings().enabled">
        <div class="form-check form-switch">
          <input
            id="speechAutoRead"
            type="checkbox"
            role="switch"
            class="form-check-input"
            [checked]="settings().autoRead"
            [disabled]="!settings().enabled"
            (change)="setAutoRead($event)">
          <label class="form-check-label fw-semibold" for="speechAutoRead">Automatikus felolvasás</label>
          <div class="form-text">Bekapcsolva a kártya szövege magától felolvasódik, amikor új kártya jelenik meg vagy megfordítod (felismerésnél a körülírást, utána a megoldást is). Kikapcsolva csak a hangszóró gombbal szólal meg.</div>
        </div>

        @for (block of blocks; track block.lang) {
          <div class="speech-lang">
            <div class="form-check form-switch mb-2">
              <input
                [id]="'speech-' + block.lang"
                type="checkbox"
                role="switch"
                class="form-check-input"
                [checked]="settings()[block.toggleKey]"
                [disabled]="!settings().enabled"
                (change)="setLangEnabled(block, $event)">
              <label class="form-check-label fw-semibold" [for]="'speech-' + block.lang">{{ block.title }}</label>
            </div>

            @if (settings()[block.toggleKey]) {
              @if (voicesFor(block.lang).length > 0) {
                <label class="form-label small mb-1" [for]="'voice-' + block.lang">Hang</label>
                <div class="d-flex gap-2">
                  <select
                    [id]="'voice-' + block.lang"
                    class="form-select"
                    [disabled]="!settings().enabled"
                    (change)="setVoice(block, $event)">
                    <option value="" [selected]="selectedVoice(block) === ''">Automatikus (a böngésző választ)</option>
                    @for (voice of voicesFor(block.lang); track voice.name) {
                      <option [value]="voice.name" [selected]="voice.name === selectedVoice(block)">{{ voice.name }} ({{ voice.lang }})</option>
                    }
                  </select>
                  <button
                    type="button"
                    class="btn btn-outline-secondary flex-shrink-0"
                    [disabled]="!settings().enabled"
                    (click)="preview(block)">
                    Kipróbálás
                  </button>
                </div>
              } @else if (speech.voices().length > 0) {
                <div class="alert alert-warning small mb-0" role="alert">
                  {{ missingVoiceHint(block.lang) }}
                </div>
              } @else {
                <div class="form-text">Hangok betöltése…</div>
              }
            }
          </div>
        }

        <div class="speech-sliders">
          <div>
            <label class="form-label d-flex justify-content-between" for="speechRate">
              <span>Sebesség</span>
              <span class="text-body-secondary">{{ rateLabel() }}</span>
            </label>
            <input
              id="speechRate"
              type="range"
              class="form-range"
              [min]="rateRange.min"
              [max]="rateRange.max"
              [step]="rateRange.step"
              [value]="settings().rate"
              [disabled]="!settings().enabled"
              (input)="setNumber('rate', $event)">
            <div class="d-flex justify-content-between small text-body-secondary"><span>Lassabb</span><span>Gyorsabb</span></div>
          </div>
          <div>
            <label class="form-label d-flex justify-content-between" for="speechPitch">
              <span>Hangmagasság</span>
              <span class="text-body-secondary">{{ pitchLabel() }}</span>
            </label>
            <input
              id="speechPitch"
              type="range"
              class="form-range"
              [min]="pitchRange.min"
              [max]="pitchRange.max"
              [step]="pitchRange.step"
              [value]="settings().pitch"
              [disabled]="!settings().enabled"
              (input)="setNumber('pitch', $event)">
            <div class="d-flex justify-content-between small text-body-secondary"><span>Mélyebb</span><span>Magasabb</span></div>
          </div>
        </div>
      </div>

      <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="speech.reset()">Alapértékek visszaállítása</button>
        <span class="small text-body-secondary">A beállítások azonnal érvénybe lépnek, és ezen az eszközön megmaradnak.</span>
      </div>
    }
  `,
  styles: [`
    .speech-options { display: grid; gap: 1.25rem; }
    .speech-options.is-disabled { opacity: .55; }
    .speech-lang { padding: .85rem 1rem; border: 1px solid var(--app-border); border-radius: .75rem; background: var(--app-surface); }
    .speech-sliders { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  `],
})
export class SpeechSettingsComponent {
  readonly speech = inject(SpeechService);
  readonly settings = this.speech.settings;
  readonly rateRange = speechRateRange;
  readonly pitchRange = speechPitchRange;

  readonly blocks: LangBlock[] = [
    {
      lang: 'en',
      title: 'Angol felolvasás',
      toggleKey: 'englishEnabled',
      voiceKey: 'englishVoice',
      sample: 'Hello! This is how I will read your cards.',
    },
    {
      lang: 'hu',
      title: 'Magyar felolvasás',
      toggleKey: 'hungarianEnabled',
      voiceKey: 'hungarianVoice',
      sample: 'Szia! Így fogom felolvasni a kártyáidat.',
    },
  ];

  voicesFor(lang: SpeechLang): SpeechSynthesisVoice[] {
    return lang === 'en' ? this.speech.englishVoices() : this.speech.hungarianVoices();
  }

  /** Ha a mentett hang már nem létezik ezen az eszközön, az Automatikus látszik kiválasztva. */
  selectedVoice(block: LangBlock): string {
    const stored = this.settings()[block.voiceKey];
    return this.voicesFor(block.lang).some((voice) => voice.name === stored) ? stored : '';
  }

  rateLabel(): string {
    return `${this.settings().rate.toFixed(2)}×`;
  }

  pitchLabel(): string {
    return this.settings().pitch.toFixed(2);
  }

  setEnabled(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    if (!enabled) {
      this.speech.stop();
    }
    this.speech.update({ enabled });
  }

  setAutoRead(event: Event): void {
    const autoRead = (event.target as HTMLInputElement).checked;
    if (!autoRead) {
      this.speech.stop();
    }
    this.speech.update({ autoRead });
  }

  setLangEnabled(block: LangBlock, event: Event): void {
    this.speech.update({ [block.toggleKey]: (event.target as HTMLInputElement).checked } as Partial<SpeechSettings>);
  }

  setVoice(block: LangBlock, event: Event): void {
    this.speech.update({ [block.voiceKey]: (event.target as HTMLSelectElement).value } as Partial<SpeechSettings>);
    this.preview(block);
  }

  setNumber(key: 'rate' | 'pitch', event: Event): void {
    this.speech.update({ [key]: Number((event.target as HTMLInputElement).value) } as Partial<SpeechSettings>);
  }

  preview(block: LangBlock): void {
    this.speech.speak(block.sample, block.lang, true);
  }

  missingVoiceHint(lang: SpeechLang): string {
    return lang === 'hu'
      ? 'Ezen az eszközön nincs magyar hang, ezért a magyar szövegekhez nem jelenik meg felolvasó gomb. Windowson a Beállítások → Idő és nyelv → Nyelv és régió → Magyar nyelv hozzáadása után (a „Szövegfelolvasás” csomaggal) válik elérhetővé, majd indítsd újra a böngészőt.'
      : 'Ezen az eszközön nincs angol hang, ezért az angol szövegekhez nem jelenik meg felolvasó gomb.';
  }
}
