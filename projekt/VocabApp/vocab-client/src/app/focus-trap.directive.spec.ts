import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FocusTrapDirective } from './focus-trap.directive';

@Component({
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    <button id="opener" type="button">Megnyit</button>
    @if (open) {
      <div id="dialog" role="dialog" appFocusTrap>
        <button id="first" type="button">Első</button>
        <input id="middle" />
        <button id="disabled" type="button" disabled>Letiltott</button>
        <button id="last" type="button">Utolsó</button>
      </div>
    }
  `,
})
class HostComponent {
  open = false;
}

@Component({
  standalone: true,
  imports: [FocusTrapDirective],
  template: `<div id="empty-dialog" role="dialog" appFocusTrap><p>Nincs fókuszálható elem</p></div>`,
})
class EmptyDialogComponent {}

describe('FocusTrapDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const pressTab = (target: HTMLElement, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  const openDialog = () => {
    byId('opener').focus();
    fixture.componentInstance.open = true;
    fixture.detectChanges();
  };

  it('megnyitáskor az első fókuszálható elemre lép', () => {
    openDialog();

    expect(document.activeElement).toBe(byId('first'));
  });

  it('a gazdaelem fókuszálható, de nem a Tab-sorrend része', () => {
    openDialog();

    expect(byId('dialog').getAttribute('tabindex')).toBe('-1');
  });

  it('az utolsó elemről a Tab az elsőre ugrik', () => {
    openDialog();
    byId('last').focus();

    const event = pressTab(byId('last'));

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(byId('first'));
  });

  it('az első elemről a Shift+Tab az utolsóra ugrik', () => {
    openDialog();
    byId('first').focus();

    const event = pressTab(byId('first'), true);

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(byId('last'));
  });

  it('a gazdaelemről indulva a Shift+Tab is az utolsóra lép', () => {
    openDialog();
    byId('dialog').focus();

    pressTab(byId('dialog'), true);

    expect(document.activeElement).toBe(byId('last'));
  });

  it('középső elemeknél nem avatkozik a Tab-ba', () => {
    openDialog();
    byId('middle').focus();

    expect(pressTab(byId('middle')).defaultPrevented).toBeFalse();
    expect(pressTab(byId('middle'), true).defaultPrevented).toBeFalse();
  });

  it('a letiltott elemet kihagyja', () => {
    openDialog();
    byId('middle').focus();

    // a letiltott gomb nem fókuszálható, így az utolsó elem a „last”
    byId('last').focus();
    pressTab(byId('last'));

    expect(document.activeElement).toBe(byId('first'));
  });

  it('más billentyűre nem reagál', () => {
    openDialog();
    byId('last').focus();

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    byId('last').dispatchEvent(event);

    expect(event.defaultPrevented).toBeFalse();
    expect(document.activeElement).toBe(byId('last'));
  });

  it('bezáráskor a fókusz visszakerül a megnyitó elemre', () => {
    openDialog();

    fixture.componentInstance.open = false;
    fixture.detectChanges();

    expect(document.activeElement).toBe(byId('opener'));
  });

  it('fókuszálható elem nélküli ablaknál a gazdaelemen tartja a fókuszt', () => {
    fixture.destroy();
    const emptyFixture = TestBed.createComponent(EmptyDialogComponent);
    emptyFixture.detectChanges();
    const dialog = byId('empty-dialog');

    expect(document.activeElement).toBe(dialog);
    const event = pressTab(dialog);

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(dialog);
    emptyFixture.destroy();
  });
});
