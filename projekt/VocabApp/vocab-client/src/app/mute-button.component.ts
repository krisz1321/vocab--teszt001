import { Component, Input, inject } from '@angular/core';
import { SpeechService } from './speech.service';

const speakerBody = 'M11 5 6 9H3v6h3l5 4V5Z';
const soundWaves = 'M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13';
const mutedCross = 'M16 9l5 6M21 9l-5 6';

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
        <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path [attr.d]="body" />
          <path [attr.d]="speech.settings().muted ? cross : waves" />
        </svg>
        @if (!compact) {
          <span>{{ speech.settings().muted ? 'Némítva' : 'Hang be' }}</span>
        }
      </button>
    }
  `,
  styles: [`
    :host { display: inline-block; }
    :host(.block) { display: block; }
    .mute-btn { display: inline-flex; align-items: center; gap: .5rem; }
    .mute-btn.icon-only { padding: .45rem; }
    .mute-btn.is-muted { color: var(--app-danger); border-color: var(--app-danger); }
  `],
})
export class MuteButtonComponent {
  readonly speech = inject(SpeechService);
  readonly body = speakerBody;
  readonly waves = soundWaves;
  readonly cross = mutedCross;

  /** Csak ikon, felirat nélkül (keskeny helyre). */
  @Input() compact = false;
}
