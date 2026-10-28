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
      <div role="alert">
        Ez a böngésző nem támogatja a felolvasást. Próbáld Chrome, Edge vagy Safari böngészővel.
      </div>
    } @else {
      <div>
        <input
          id="speechEnabled"
          type="checkbox"
          role="switch"
          [checked]="settings().enabled"
          (change)="setEnabled($event)">
        <label for="speechEnabled">Felolvasás engedélyezése</label>
        <div>Kikapcsolva a kártyákról eltűnnek a hangszóró gombok.</div>
      </div>

      @if (settings().muted && settings().enabled) {
        <div role="status">
          <span>A hang jelenleg némítva van, ezért semmi nem szólal meg.</span>
          <button type="button" (click)="speech.toggleMute()">Némítás feloldása</button>
        </div>
      }

      <div class="speech-options" [class.is-disabled]="!settings().enabled">
        <div>
          <input
            id="speechAutoRead"
            type="checkbox"
            role="switch"
            [checked]="settings().autoRead"
            [disabled]="!settings().enabled"
            (change)="setAutoRead($event)">
          <label for="speechAutoRead">Automatikus felolvasás</label>
          <div>Bekapcsolva a kártya szövege magától felolvasódik, amikor új kártya jelenik meg vagy megfordítod (felismerésnél a körülírást, utána a megoldást is). Kikapcsolva csak a hangszóró gombbal szólal meg.</div>
        </div>

        @for (block of blocks; track block.lang) {
          <div class="speech-lang">
            <div>
              <input
                [id]="'speech-' + block.lang"
                type="checkbox"
                role="switch"
                [checked]="settings()[block.toggleKey]"
                [disabled]="!settings().enabled"
                (change)="setLangEnabled(block, $event)">
              <label [for]="'speech-' + block.lang">{{ block.title }}</label>
            </div>

            @if (settings()[block.toggleKey]) {
              @if (voicesFor(block.lang).length > 0) {
                <label [for]="'voice-' + block.lang">Hang</label>
                <div>
                  <select
                    [id]="'voice-' + block.lang"
                    [disabled]="!settings().enabled"
                    (change)="setVoice(block, $event)">
                    <option value="" [selected]="selectedVoice(block) === ''">Automatikus (a böngésző választ)</option>
                    @for (voice of voicesFor(block.lang); track voice.name) {
                      <option [value]="voice.name" [selected]="voice.name === selectedVoice(block)">{{ voice.name }} ({{ voice.lang }})</option>
                    }
                  </select>
                  <button
                    type="button"
                    [disabled]="!settings().enabled || settings().muted"
                    (click)="preview(block)">
                    Kipróbálás
                  </button>
                </div>
              } @else if (speech.voices().length > 0) {
                <div role="alert">
                  {{ missingVoiceHint(block.lang) }}
                </div>
              } @else {
                <div>Hangok betöltése…</div>
              }
            }
          </div>
        }

        <div class="speech-sliders">
          <div>
            <label for="speechRate">
              <span>Sebesség</span>
              <span>{{ rateLabel() }}</span>
            </label>
            <input
              id="speechRate"
              type="range"
              [min]="rateRange.min"
              [max]="rateRange.max"
              [step]="rateRange.step"
              [value]="settings().rate"
              [disabled]="!settings().enabled"
              (input)="setNumber('rate', $event)">
            <div><span>Lassabb</span><span>Gyorsabb</span></div>
          </div>
          <div>
            <label for="speechPitch">
              <span>Hangmagasság</span>
              <span>{{ pitchLabel() }}</span>
            </label>
            <input
              id="speechPitch"
              type="range"
              [min]="pitchRange.min"
              [max]="pitchRange.max"
              [step]="pitchRange.step"
              [value]="settings().pitch"
              [disabled]="!settings().enabled"
              (input)="setNumber('pitch', $event)">
            <div><span>Mélyebb</span><span>Magasabb</span></div>
          </div>
        </div>
      </div>

      <div>
        <button type="button" (click)="speech.reset()">Alapértékek visszaállítása</button>
        <span>A beállítások azonnal érvénybe lépnek, és ezen az eszközön megmaradnak.</span>
      </div>
    }
  `,
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
