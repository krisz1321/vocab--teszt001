import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';
import { MuteButtonComponent } from './mute-button.component';
import { SpeakButtonComponent } from './speak-button.component';
import { defaultSpeechSettings, SpeechLang, SpeechService, SpeechSettings } from './speech.service';

/** A felolvasó szolgáltatás kézi mása: a gombok viselkedését böngészőbeli beszéd nélkül vizsgáljuk. */
class FakeSpeech {
  supported = true;
  settings: WritableSignal<SpeechSettings> = signal({ ...defaultSpeechSettings });
  speaking = signal<string | null>(null);
  allowed = true;
  spoken: Array<[string, SpeechLang]> = [];
  stopped = 0;
  muteToggles = 0;

  canSpeak(): boolean {
    return this.allowed;
  }

  speakingId(text: string, lang: SpeechLang): string {
    return `${lang}:${text.trim()}`;
  }

  speak(text: string, lang: SpeechLang): void {
    this.spoken.push([text, lang]);
  }

  stop(): void {
    this.stopped++;
  }

  toggleMute(): void {
    this.muteToggles++;
    this.settings.update(settings => ({ ...settings, muted: !settings.muted }));
  }
}

describe('SpeakButtonComponent', () => {
  let speech: FakeSpeech;
  let fixture: ComponentFixture<SpeakButtonComponent>;

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;

  beforeEach(() => {
    speech = new FakeSpeech();
    TestBed.configureTestingModule({
      imports: [SpeakButtonComponent],
      providers: [{ provide: SpeechService, useValue: speech }],
    });
    fixture = TestBed.createComponent(SpeakButtonComponent);
    fixture.componentRef.setInput('text', 'hello');
    fixture.detectChanges();
  });

  it('szöveggel és engedett nyelvvel megjelenik', () => {
    expect(button()).not.toBeNull();
  });

  it('üres vagy hiányzó szövegnél nem jelenik meg', () => {
    for (const text of ['', '   ', null, undefined]) {
      fixture.componentRef.setInput('text', text);
      fixture.detectChanges();
      expect(button()).withContext(`text=${String(text)}`).toBeNull();
    }
  });

  it('tiltott nyelvnél nem jelenik meg', () => {
    speech.allowed = false;
    fixture.componentRef.setInput('text', 'hello!');
    fixture.detectChanges();

    expect(button()).toBeNull();
  });

  it('kattintásra felolvassa a szöveget a megadott nyelven', () => {
    fixture.componentRef.setInput('lang', 'hu');
    fixture.componentRef.setInput('text', 'szia');
    fixture.detectChanges();

    button()!.click();

    expect(speech.spoken).toEqual([['szia', 'hu']]);
  });

  it('olvasás közben a kattintás leállítja a felolvasást', () => {
    speech.speaking.set('en:hello');
    fixture.componentRef.setInput('text', 'hello');
    fixture.detectChanges();

    expect(button()!.getAttribute('aria-pressed')).toBe('true');
    button()!.click();

    expect(speech.stopped).toBe(1);
    expect(speech.spoken).toEqual([]);
  });

  it('a súgószöveg a tartalomhoz és a nyelvhez igazodik', () => {
    fixture.componentRef.setInput('label', 'A szó');
    fixture.detectChanges();
    expect(button()!.getAttribute('aria-label')).toBe('A szó felolvasása angolul');

    fixture.componentRef.setInput('lang', 'hu');
    fixture.detectChanges();
    expect(button()!.getAttribute('aria-label')).toBe('A szó felolvasása magyarul');

    fixture.componentRef.setInput('label', '');
    fixture.detectChanges();
    expect(button()!.getAttribute('aria-label')).toBe('Szöveg felolvasása magyarul');
  });

  it('némítva letiltott, és ezt a súgó is jelzi', () => {
    speech.settings.update(settings => ({ ...settings, muted: true }));
    fixture.detectChanges();

    expect(button()!.disabled).toBeTrue();
    expect(button()!.getAttribute('aria-label')).toContain('némítva');
  });

  it('olvasás közben leállítás feliratot kap', () => {
    speech.speaking.set('en:hello');
    fixture.detectChanges();

    expect(button()!.getAttribute('aria-label')).toBe('Felolvasás leállítása');
    expect(button()!.classList).toContain('is-speaking');
  });
});

describe('MuteButtonComponent', () => {
  let speech: FakeSpeech;
  let fixture: ComponentFixture<MuteButtonComponent>;

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;

  beforeEach(() => {
    speech = new FakeSpeech();
    TestBed.configureTestingModule({
      imports: [MuteButtonComponent],
      providers: [{ provide: SpeechService, useValue: speech }],
    });
    fixture = TestBed.createComponent(MuteButtonComponent);
    fixture.detectChanges();
  });

  it('bekapcsolt felolvasásnál megjelenik, és némít', () => {
    expect(button()!.getAttribute('aria-label')).toBe('Hang némítása');
    expect(button()!.getAttribute('aria-pressed')).toBe('false');

    button()!.click();
    fixture.detectChanges();

    expect(speech.muteToggles).toBe(1);
    expect(button()!.getAttribute('aria-label')).toBe('Hang bekapcsolása');
    expect(button()!.getAttribute('aria-pressed')).toBe('true');
    expect(button()!.classList).toContain('is-muted');
  });

  it('kikapcsolt felolvasásnál vagy támogatás nélkül nem jelenik meg', () => {
    speech.settings.update(settings => ({ ...settings, enabled: false }));
    fixture.detectChanges();
    expect(button()).toBeNull();

    speech.settings.update(settings => ({ ...settings, enabled: true }));
    speech.supported = false;
    fixture.detectChanges();
    expect(button()).toBeNull();
  });

  it('teljes változatban felirata van, a kompaktban csak ikon', () => {
    expect(button()!.textContent).toContain('Hang némítása');

    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    expect(button()!.textContent!.trim()).toBe('');
    expect(button()!.classList).toContain('icon-only');
  });
});

describe('IconComponent', () => {
  let fixture: ComponentFixture<IconComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [IconComponent] });
    fixture = TestBed.createComponent(IconComponent);
  });

  const render = (name: string) => {
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('svg') as SVGElement | null;
  };

  it('vonalikont rajzol, amely a szövegszínt használja', () => {
    const svg = render('check');

    expect(svg).not.toBeNull();
    expect(svg!.classList).toContain('ic');
    expect(svg!.classList).not.toContain('ic-fill');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg!.querySelector('path')).not.toBeNull();
  });

  it('a play és a flame ikon kitöltött', () => {
    expect(render('play')!.classList).toContain('ic-fill');
    expect(render('flame')!.classList).toContain('ic-fill');
  });

  it('a gazdaelem rejtett a képernyőolvasók elől', () => {
    render('x');

    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });

  it('a gombokon használt ikonok mind léteznek', () => {
    for (const name of ['layers', 'pen', 'chart', 'folder', 'sliders', 'search', 'x', 'volume', 'mute', 'stop', 'plus', 'trash', 'share', 'sun', 'moon']) {
      expect(render(name)?.querySelector('path, circle, rect')).withContext(name).not.toBeNull();
    }
  });
});
