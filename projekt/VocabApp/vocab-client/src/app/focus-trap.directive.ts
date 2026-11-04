import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Párbeszédablak fókuszcsapdája: megnyitáskor az első fókuszálható elemre lép (ha a fókusz nincs már bent),
 * a Tab és a Shift+Tab az ablakon belül körbeforog, bezáráskor a fókusz visszakerül a megnyitó elemre.
 * Használat: `role="dialog"` vagy `role="alertdialog"` elemen `appFocusTrap`.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
  host: { '(keydown)': 'onKeydown($event)' },
})
export class FocusTrapDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  // A direktíva az ablakkal együtt jön létre, ezért ilyenkor még a megnyitó elem a fókuszban lévő.
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    if (!this.host.hasAttribute('tabindex')) {
      this.host.setAttribute('tabindex', '-1');
    }

    if (!this.host.contains(document.activeElement)) {
      (this.focusable()[0] ?? this.host).focus({ preventScroll: true });
    }
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus({ preventScroll: true });
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const items = this.focusable();
    if (items.length === 0) {
      event.preventDefault();
      this.host.focus({ preventScroll: true });
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.host)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => element.getClientRects().length > 0);
  }
}
