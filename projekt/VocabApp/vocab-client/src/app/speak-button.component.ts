import { Component, Input, inject } from '@angular/core';
import { SpeechLang, SpeechService } from './speech.service';

const speakerIcon = 'M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13';
const stopIcon = 'M7 7h10v10H7z';

/** Hangszóró gomb: a megadott szöveget olvassa fel, ha a beállítások ezt az adott nyelvre engedik. */
@Component({
  selector: 'app-speak-button',
  standalone: true,
  template: `
    @if (text?.trim() && speech.canSpeak(lang)) {
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm speak-btn"
        [class.is-speaking]="isSpeaking()"
        [attr.aria-pressed]="isSpeaking()"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="ariaLabel()"
        (pointerdown)="$event.stopPropagation()"
        (pointerup)="$event.stopPropagation()"
        (click)="toggle($event)">
        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path [attr.d]="isSpeaking() ? stopPath : speakerPath" />
        </svg>
      </button>
    }
  `,
  styles: [`
    :host { display: inline-flex; flex: 0 0 auto; }
    .speak-btn { display: inline-flex; align-items: center; justify-content: center; padding: .3rem .45rem; line-height: 1; }
    .speak-btn.is-speaking { color: var(--app-primary); border-color: var(--app-primary); }
  `],
})
export class SpeakButtonComponent {
  readonly speech = inject(SpeechService);
  readonly speakerPath = speakerIcon;
  readonly stopPath = stopIcon;

  @Input() text: string | null | undefined = '';
  @Input() lang: SpeechLang = 'en';
  /** Mit olvas fel (pl. „A szó”, „Példamondat”), a gomb súgószövegéhez. */
  @Input() label = '';

  isSpeaking(): boolean {
    return !!this.text && this.speech.speaking() === this.speech.speakingId(this.text, this.lang);
  }

  ariaLabel(): string {
    if (this.isSpeaking()) {
      return 'Felolvasás leállítása';
    }

    const what = this.label || 'Szöveg';
    return `${what} felolvasása ${this.lang === 'hu' ? 'magyarul' : 'angolul'}`;
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.isSpeaking()) {
      this.speech.stop();
      return;
    }

    this.speech.speak(this.text ?? '', this.lang);
  }
}
