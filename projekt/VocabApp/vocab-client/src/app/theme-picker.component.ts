import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, Input, inject } from '@angular/core';
import { ThemeMode, ThemeName, ThemeOption, ThemeService, themeOptions } from './theme.service';

@Component({
  selector: 'app-theme-picker',
  standalone: true,
  template: `
    @if (!inline) {
      <button
        type="button"
        class="btn btn-outline-secondary theme-trigger"
        [class.icon-only]="compact"
        (click)="open = !open"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open"
        aria-label="Kinézet választása">
        <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10Z" />
          <circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" />
        </svg>
        @if (!compact) {
          <span>Kinézet</span>
        }
      </button>
      @if (open) {
        <div class="theme-backdrop" (click)="open = false"></div>
        <div class="theme-panel" role="dialog" aria-label="Kinézet">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong>Kinézet</strong>
            <button type="button" class="btn-close" aria-label="Bezárás" (click)="open = false"></button>
          </div>
          <ng-container *ngTemplateOutlet="body"></ng-container>
        </div>
      }
    } @else {
      <ng-container *ngTemplateOutlet="body"></ng-container>
    }

    <ng-template #body>
      <div class="theme-options">
        @for (option of options; track option.id) {
          <button
            type="button"
            class="theme-option"
            [class.is-active]="theme.name() === option.id"
            (click)="pickName(option.id)"
            [attr.aria-pressed]="theme.name() === option.id">
            <span class="theme-swatch" [style.background]="swatchBackground(option)">
              <span class="theme-swatch-card" [style.background]="swatch(option)[1]">
                <span class="theme-swatch-line" [style.background]="swatch(option)[2]"></span>
                <span class="theme-swatch-line short" [style.background]="swatch(option)[3]"></span>
              </span>
            </span>
            <span class="theme-option-text">
              <strong>{{ option.label }}</strong>
              <small>{{ option.description }}</small>
            </span>
          </button>
        }
      </div>
      <div class="seg mt-3" role="group" aria-label="Világos vagy sötét">
        @for (m of modes; track m.id) {
          <button type="button" [class.is-active]="theme.mode() === m.id" (click)="pickMode(m.id)">{{ m.label }}</button>
        }
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: [`
    :host { display: inline-block; position: relative; }
    :host(.block) { display: block; }
    .theme-trigger { display: inline-flex; align-items: center; gap: .5rem; }
    .theme-trigger.icon-only { padding: .45rem; }
    .theme-backdrop { position: fixed; inset: 0; z-index: 1040; }
    .theme-panel {
      position: fixed; z-index: 1050; width: min(24rem, calc(100vw - 1.5rem)); padding: 1rem;
      right: .75rem; top: 3.75rem;
      background: var(--app-surface); color: var(--app-text);
      border: 1px solid var(--app-border); border-radius: var(--app-radius-lg);
      box-shadow: 0 18px 50px -12px rgba(0, 0, 0, .35);
    }
    @media (min-width: 992px) {
      :host(.from-sidebar) .theme-panel { right: auto; top: auto; left: 1rem; bottom: 1rem; width: 24rem; }
    }
    .theme-options { display: grid; gap: .5rem; }
    .theme-option {
      display: flex; align-items: center; gap: .85rem; width: 100%; padding: .6rem;
      border: 2px solid var(--app-border); border-radius: var(--app-radius);
      background: var(--app-surface); color: var(--app-text); text-align: left; cursor: pointer;
      transition: border-color .15s ease, transform .1s ease;
    }
    .theme-option:hover { border-color: color-mix(in srgb, var(--app-primary) 50%, var(--app-border)); }
    .theme-option.is-active { border-color: var(--app-primary); background: rgba(var(--app-primary-rgb), .07); }
    .theme-swatch { flex: 0 0 auto; display: grid; place-items: center; width: 4.2rem; height: 3.2rem; border-radius: var(--app-radius-sm); }
    .theme-swatch-card { display: grid; gap: .25rem; align-content: center; width: 2.8rem; height: 2rem; padding: .35rem; border-radius: .4rem; box-shadow: 0 2px 6px rgba(0, 0, 0, .15); }
    .theme-swatch-line { height: .3rem; width: 100%; border-radius: 99px; }
    .theme-swatch-line.short { width: 55%; }
    .theme-option-text { display: grid; line-height: 1.25; min-width: 0; }
    .theme-option-text small { color: var(--app-muted); font-size: .8rem; }
  `],
})
export class ThemePickerComponent {
  readonly theme = inject(ThemeService);
  readonly options = themeOptions;
  readonly modes: { id: ThemeMode; label: string }[] = [
    { id: 'light', label: 'Világos' },
    { id: 'dark', label: 'Sötét' },
    { id: 'system', label: 'Rendszer' },
  ];

  /** Ha igaz, a panel nincs gomb mögé rejtve, hanem közvetlenül látszik (pl. a profilon). */
  @Input() inline = false;
  /** Csak ikon, felirat nélkül (keskeny helyre). */
  @Input() compact = false;
  open = false;

  swatch(option: ThemeOption): string[] {
    return this.isDark() ? option.dark : option.light;
  }

  swatchBackground(option: ThemeOption): string {
    return this.swatch(option)[0];
  }

  pickName(name: ThemeName): void {
    this.theme.setName(name);
  }

  pickMode(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.open = false;
  }

  private isDark(): boolean {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark';
  }
}
