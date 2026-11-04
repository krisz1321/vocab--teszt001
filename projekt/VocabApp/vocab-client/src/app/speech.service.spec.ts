import { TestBed } from '@angular/core/testing';
import { defaultSpeechSettings, SpeechService, speechPitchRange, speechRateRange } from './speech.service';

const storageKey = 'vocabapp.speech';

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe('SpeechService', () => {
  let speakSpy: jasmine.Spy;
  let cancelSpy: jasmine.Spy;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    speakSpy = spyOn(window.speechSynthesis, 'speak');
    cancelSpy = spyOn(window.speechSynthesis, 'cancel');
    spyOn(window.speechSynthesis, 'getVoices').and.returnValue([]);
  });

  afterEach(() => localStorage.clear());

  const create = () => TestBed.inject(SpeechService);

  describe('beállítások', () => {
    it('tárolt érték nélkül az alapértékekkel indul', () => {
      expect(create().settings()).toEqual(defaultSpeechSettings);
    });

    it('az update egyesíti és menti a beállításokat', () => {
      const speech = create();

      speech.update({ rate: 1.2, autoRead: false });

      expect(speech.settings().rate).toBe(1.2);
      expect(speech.settings().autoRead).toBeFalse();
      expect(speech.settings().enabled).toBeTrue();
      expect(JSON.parse(localStorage.getItem(storageKey)!).rate).toBe(1.2);
    });

    it('újraindításkor a mentett beállítást olvassa vissza', () => {
      create().update({ englishVoice: 'Anna', pitch: 1.3 });
      TestBed.resetTestingModule();

      const settings = create().settings();

      expect(settings.englishVoice).toBe('Anna');
      expect(settings.pitch).toBe(1.3);
    });

    it('a sebességet és a hangmagasságot a megengedett tartományba szorítja', () => {
      localStorage.setItem(storageKey, JSON.stringify({ rate: 99, pitch: -4 }));

      const settings = create().settings();

      expect(settings.rate).toBe(speechRateRange.max);
      expect(settings.pitch).toBe(speechPitchRange.min);
    });

    it('hibás típusú tárolt mezőknél az alapértéket használja', () => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ enabled: 'yes', muted: 1, rate: 'fast', englishVoice: 5, hungarianVoice: 'Réka' }),
      );

      const settings = create().settings();

      expect(settings.enabled).toBe(defaultSpeechSettings.enabled);
      expect(settings.muted).toBe(defaultSpeechSettings.muted);
      expect(settings.englishVoice).toBe('');
      expect(settings.hungarianVoice).toBe('Réka');
      expect(settings.rate).toBe(defaultSpeechSettings.rate);
    });

    it('sérült JSON-nál az alapértékekre esik vissza', () => {
      localStorage.setItem(storageKey, '{ not json');

      expect(create().settings()).toEqual(defaultSpeechSettings);
    });

    it('a reset visszaállítja az alapértékeket és leállítja a felolvasást', () => {
      const speech = create();
      speech.update({ muted: true, rate: 1.4 });

      speech.reset();

      expect(speech.settings()).toEqual(defaultSpeechSettings);
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('letiltott tárolónál sem dob kivételt, és a memóriában megőrzi a beállítást', () => {
      spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
      const speech = create();

      expect(() => speech.update({ rate: 1.1 })).not.toThrow();
      expect(speech.settings().rate).toBe(1.1);
    });
  });

  describe('hangok és canSpeak', () => {
    it('hangok nélkül (még nem töltődtek be) engedi a felolvasást', () => {
      expect(create().canSpeak('en')).toBeTrue();
      expect(create().canSpeak('hu')).toBeTrue();
    });

    it('kikapcsolt felolvasásnál vagy nyelvnél tiltott', () => {
      const speech = create();

      speech.update({ enabled: false });
      expect(speech.canSpeak('en')).toBeFalse();

      speech.update({ enabled: true, hungarianEnabled: false });
      expect(speech.canSpeak('hu')).toBeFalse();
      expect(speech.canSpeak('en')).toBeTrue();
    });

    it('betöltött hangoknál csak olyan nyelven engedett, amelyhez van hang', () => {
      (window.speechSynthesis.getVoices as jasmine.Spy).and.returnValue([voice('Zoe', 'en-GB'), voice('Anna', 'en-US')]);
      TestBed.resetTestingModule();
      const speech = create();

      expect(speech.canSpeak('en')).toBeTrue();
      expect(speech.canSpeak('hu')).toBeFalse();
    });

    it('a hangokat nyelv szerint szűri és név szerint rendezi, az alulvonásos kódot is felismeri', () => {
      (window.speechSynthesis.getVoices as jasmine.Spy).and.returnValue([
        voice('Zsolt', 'hu_HU'),
        voice('Réka', 'hu-HU'),
        voice('Zoe', 'en-GB'),
        voice('Anna', 'en-US'),
        voice('Hans', 'de-DE'),
      ]);
      TestBed.resetTestingModule();
      const speech = create();

      expect(speech.englishVoices().map(v => v.name)).toEqual(['Anna', 'Zoe']);
      expect(speech.hungarianVoices().map(v => v.name)).toEqual(['Réka', 'Zsolt']);
    });
  });

  describe('felolvasás', () => {
    it('beállított sebességgel, hangmagassággal és nyelvvel szólaltatja meg a szöveget', () => {
      const speech = create();
      speech.update({ rate: 1.1, pitch: 0.9 });

      speech.speak('  hello  ', 'en');

      expect(cancelSpy).toHaveBeenCalled();
      const utterance = speakSpy.calls.mostRecent().args[0] as SpeechSynthesisUtterance;
      expect(utterance.text).toBe('hello');
      expect(utterance.lang).toBe('en-US');
      expect(utterance.rate).toBeCloseTo(1.1);
      expect(utterance.pitch).toBeCloseTo(0.9);
      expect(speech.speaking()).toBe('en:hello');
    });

    it('a magyar szöveg hu-HU nyelvkóddal szól', () => {
      create().speak('szia', 'hu');

      expect((speakSpy.calls.mostRecent().args[0] as SpeechSynthesisUtterance).lang).toBe('hu-HU');
    });

    it('üres szövegnél nem szól', () => {
      const speech = create();

      speech.speak('   ');
      speech.speak('');

      expect(speakSpy).not.toHaveBeenCalled();
    });

    it('némítva nem szól, még force mellett sem', () => {
      const speech = create();
      speech.update({ muted: true });

      speech.speak('hello', 'en', true);

      expect(speakSpy).not.toHaveBeenCalled();
    });

    it('kikapcsolt nyelvnél nem szól, de a force (kipróbálás) átlépi a tiltást', () => {
      const speech = create();
      speech.update({ englishEnabled: false });

      speech.speak('hello', 'en');
      expect(speakSpy).not.toHaveBeenCalled();

      speech.speak('hello', 'en', true);
      expect(speakSpy).toHaveBeenCalledTimes(1);
    });

    it('az új felolvasás átveszi a helyét, a régi vége nem törli a jelzést', () => {
      const speech = create();
      speech.speak('first', 'en');
      const first = speakSpy.calls.mostRecent().args[0] as SpeechSynthesisUtterance;
      speech.speak('second', 'en');

      first.onend?.(new Event('end') as SpeechSynthesisEvent);

      expect(speech.speaking()).toBe('en:second');
    });

    it('a felolvasás végén vagy hibájánál törli a jelzést', () => {
      const speech = create();
      speech.speak('hello', 'en');
      const utterance = speakSpy.calls.mostRecent().args[0] as SpeechSynthesisUtterance;

      utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
      expect(speech.speaking()).toBeNull();

      speech.speak('again', 'en');
      (speakSpy.calls.mostRecent().args[0] as SpeechSynthesisUtterance).onerror?.(new Event('error') as SpeechSynthesisErrorEvent);
      expect(speech.speaking()).toBeNull();
    });

    it('az autoSpeak csak bekapcsolt automatikus felolvasásnál szól', () => {
      const speech = create();

      speech.autoSpeak('hello', 'en');
      expect(speakSpy).toHaveBeenCalledTimes(1);

      speech.update({ autoRead: false });
      speech.autoSpeak('hello', 'en');
      expect(speakSpy).toHaveBeenCalledTimes(1);
    });

    it('a toggleMute átkapcsolja a némítást, bekapcsoláskor leállítja a felolvasást', () => {
      const speech = create();
      speech.speak('hello', 'en');

      speech.toggleMute();
      expect(speech.settings().muted).toBeTrue();
      expect(speech.speaking()).toBeNull();

      speech.toggleMute();
      expect(speech.settings().muted).toBeFalse();
    });

    it('a stop törli a jelzést és megszakítja a beszédet', () => {
      const speech = create();
      speech.speak('hello', 'en');
      cancelSpy.calls.reset();

      speech.stop();

      expect(speech.speaking()).toBeNull();
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('a speakingId nyelvet és kerekített szöveget tartalmaz', () => {
      expect(create().speakingId('  hello ', 'hu')).toBe('hu:hello');
    });
  });
});
