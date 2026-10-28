import { Component, Input, inject } from '@angular/core';
import { IconComponent } from './icon.component';
import { SpeechService } from './speech.service';

/** Mindig látható gyorsgomb: egy kattintással némítja vagy visszakapcsolja a felolvasást. */
@Component({
  selector: 'app-mute-button',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (speech.supported && speech.settings().enabled) {
      <button
        type="button"
        class="mute-btn"
        [class.icon-btn]="compact"
        [class.mp-item]="!compact"
        [class.icon-only]="compact"
        [class.is-muted]="speech.settings().muted"
        [attr.aria-pressed]="speech.settings().muted"
        [attr.aria-label]="speech.settings().muted ? 'Hang bekapcsolása' : 'Hang némítása'"
        [attr.title]="speech.settings().muted ? 'Némítva – kattints a hang bekapcsolásához' : 'Hang némítása'"
        (click)="speech.toggleMute()">
        <app-icon [name]="speech.settings().muted ? 'mute' : 'volume'" />
        @if (!compact) {
          {{ speech.settings().muted ? 'Hang bekapcsolása' : 'Hang némítása' }}
        }
      </button>
    }
  `,
})
export class MuteButtonComponent {
  readonly speech = inject(SpeechService);

  /** Rövidebb változat keskeny helyre (csak ikon). */
  @Input() compact = false;
}
