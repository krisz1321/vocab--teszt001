import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const themeKey = 'vocabapp.theme';

describe('ThemeService', () => {
  let listeners: Array<() => void>;
  let systemDark: boolean;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    listeners = [];
    systemDark = false;
    spyOn(window, 'matchMedia').and.callFake(
      () =>
        ({
          get matches() {
            return systemDark;
          },
          addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
        }) as unknown as MediaQueryList,
    );
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  const create = () => TestBed.inject(ThemeService);

  it('tárolt érték nélkül rendszer módban indul, és a rendszer világos témáját követi', () => {
    const theme = create();

    expect(theme.choice()).toBe('system');
    expect(theme.mode()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('rendszer módban a sötét rendszerbeállítást követi', () => {
    systemDark = true;

    const theme = create();

    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a tárolt világos és sötét választást használja', () => {
    localStorage.setItem(themeKey, 'dark');
    expect(create().choice()).toBe('dark');

    TestBed.resetTestingModule();
    localStorage.setItem(themeKey, 'light');
    systemDark = true;
    const theme = create();
    expect(theme.choice()).toBe('light');
    expect(theme.mode()).toBe('light');
  });

  it('ismeretlen tárolt értéknél rendszer módra esik vissza', () => {
    localStorage.setItem(themeKey, 'neon');

    expect(create().choice()).toBe('system');
  });

  it('a setChoice menti a választást és átállítja a data-theme attribútumot', () => {
    const theme = create();

    theme.setChoice('dark');

    expect(theme.choice()).toBe('dark');
    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(themeKey)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    theme.setChoice('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('a rendszer módba visszaváltva újra a rendszerbeállítást követi', () => {
    const theme = create();
    theme.setChoice('light');
    systemDark = true;

    theme.setChoice('system');

    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(themeKey)).toBe('system');
  });

  it('rendszer módban követi az operációs rendszer váltását, kézi választásnál nem', () => {
    const theme = create();
    systemDark = true;
    listeners.forEach(listener => listener());
    expect(theme.mode()).toBe('dark');

    theme.setChoice('light');
    systemDark = true;
    listeners.forEach(listener => listener());
    expect(theme.mode()).toBe('light');
  });

  it('letiltott tárolónál sem dob kivételt', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');

    const theme = create();
    expect(theme.choice()).toBe('system');

    expect(() => theme.setChoice('dark')).not.toThrow();
    expect(theme.mode()).toBe('dark');
  });
});
