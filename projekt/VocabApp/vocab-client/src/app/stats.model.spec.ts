import { formatStudyTime, parseDay, parseUtcInstant, percent } from './stats.model';

describe('stats.model', () => {
  describe('parseDay', () => {
    it('a dátumrészt UTC éjfélként olvassa', () => {
      expect(parseDay('2026-11-04')).toBe(Date.UTC(2026, 10, 4));
    });

    it('az időrészt és az eltolást figyelmen kívül hagyja', () => {
      expect(parseDay('2026-11-04T00:00:00')).toBe(Date.UTC(2026, 10, 4));
      expect(parseDay('2026-11-04T23:59:59+02:00')).toBe(Date.UTC(2026, 10, 4));
    });

    it('az év első és utolsó napját is jól kezeli', () => {
      expect(parseDay('2026-01-01')).toBe(Date.UTC(2026, 0, 1));
      expect(parseDay('2026-12-31')).toBe(Date.UTC(2026, 11, 31));
    });
  });

  describe('parseUtcInstant', () => {
    it('a "Z" nélküli időpontot UTC-nek veszi', () => {
      expect(parseUtcInstant('2026-11-04T12:00:00').toISOString()).toBe('2026-11-04T12:00:00.000Z');
    });

    it('a "Z"-vel jelölt időpontot változatlanul hagyja', () => {
      expect(parseUtcInstant('2026-11-04T12:00:00Z').toISOString()).toBe('2026-11-04T12:00:00.000Z');
    });

    it('az óraeltolásos időpontot nem toldja meg "Z"-vel', () => {
      expect(parseUtcInstant('2026-11-04T12:00:00+02:00').toISOString()).toBe('2026-11-04T10:00:00.000Z');
      expect(parseUtcInstant('2026-11-04T12:00:00-0130').toISOString()).toBe('2026-11-04T13:30:00.000Z');
    });
  });

  describe('percent', () => {
    it('egész százalékra kerekít', () => {
      expect(percent(1, 3)).toBe(33);
      expect(percent(2, 3)).toBe(67);
      expect(percent(1, 2)).toBe(50);
    });

    it('0 és 100 százalékot is ad', () => {
      expect(percent(0, 10)).toBe(0);
      expect(percent(10, 10)).toBe(100);
    });

    it('nulla vagy negatív nevezőnél null', () => {
      expect(percent(0, 0)).toBeNull();
      expect(percent(5, 0)).toBeNull();
      expect(percent(5, -1)).toBeNull();
    });
  });

  describe('formatStudyTime', () => {
    it('nulla másodpercnél "0 perc"', () => {
      expect(formatStudyTime(0)).toBe('0 perc');
    });

    it('a negatív és a tört értéket is kezeli', () => {
      expect(formatStudyTime(-30)).toBe('0 perc');
      expect(formatStudyTime(0.9)).toBe('0 perc');
    });

    it('egy perc alatt másodpercet ír', () => {
      expect(formatStudyTime(1)).toBe('1 mp');
      expect(formatStudyTime(59.9)).toBe('59 mp');
    });

    it('egy óra alatt percet ír', () => {
      expect(formatStudyTime(60)).toBe('1 perc');
      expect(formatStudyTime(125)).toBe('2 perc');
      expect(formatStudyTime(3599)).toBe('59 perc');
    });

    it('egy óra fölött órát és percet ír', () => {
      expect(formatStudyTime(3600)).toBe('1 óra 0 perc');
      expect(formatStudyTime(3600 + 15 * 60)).toBe('1 óra 15 perc');
      expect(formatStudyTime(5 * 3600 + 59 * 60 + 59)).toBe('5 óra 59 perc');
    });
  });
});
