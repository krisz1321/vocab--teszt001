import { Component, Input, inject } from '@angular/core';
import { SpeechService } from './speech.service';

/** Mindig látható gyorsgomb: egy kattintással némítja vagy visszakapcsolja a felolvasást. */
@Component({
  selector: 'app-mute-button',
  standalone: true,
  template: `
    @if (speech.supported && speech.settings().enabled) {
      <button
        type="button"
        class="btn btn-outline-secondary mute-btn"
        [class.icon-only]="compact"
        [class.is-muted]="speech.settings().muted"
        [attr.aria-pressed]="speech.settings().muted"
        [attr.aria-label]="speech.settings().muted ? 'Hang bekapcsolása' : 'Hang némítása'"
        [attr.title]="speech.settings().muted ? 'Némítva – kattints a hang bekapcsolásához' : 'Hang némítása'"
        (click)="speech.toggleMute()">
        {{ speech.settings().muted ? 'Némítva' : 'Hang be' }}
      </button>
    }
  `,
})
export class MuteButtonComponent {
  readonly speech = inject(SpeechService);

  /** Rövidebb változat keskeny helyre (a stílus nélküli felületen nincs hatása). */
  @Input() compact = false;
}
