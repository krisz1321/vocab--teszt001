import { Component, Input, inject } from '@angular/core';
import { SpeechLang, SpeechService } from './speech.service';

/** Hangszóró gomb: a megadott szöveget olvassa fel, ha a beállítások ezt az adott nyelvre engedik. */
@Component({
  selector: 'app-speak-button',
  standalone: true,
  template: `
    @if (text?.trim() && speech.canSpeak(lang)) {
      <button
        type="button"
        class="speak-btn"
        [class.is-speaking]="isSpeaking()"
        [disabled]="speech.settings().muted"
        [attr.aria-pressed]="isSpeaking()"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="ariaLabel()"
        (pointerdown)="$event.stopPropagation()"
        (pointerup)="$event.stopPropagation()"
        (click)="toggle($event)">
        {{ isSpeaking() ? 'Leállítás' : 'Felolvasás' }}
      </button>
    }
  `,
})
export class SpeakButtonComponent {
  readonly speech = inject(SpeechService);

  @Input() text: string | null | undefined = '';
  @Input() lang: SpeechLang = 'en';
  /** Mit olvas fel (pl. „A szó”, „Példamondat”), a gomb súgószövegéhez. */
  @Input() label = '';

  isSpeaking(): boolean {
    return !!this.text && this.speech.speaking() === this.speech.speakingId(this.text, this.lang);
  }

  ariaLabel(): string {
    if (this.speech.settings().muted) {
      return 'A hang némítva van, a felolvasáshoz kapcsold vissza';
    }

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
