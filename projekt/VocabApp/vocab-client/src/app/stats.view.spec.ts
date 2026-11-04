import {
  buildPracticeView,
  buildStatsView,
  CardRow,
  filterAndSortCards,
  StudyStats,
  StudyStatsActivityDay,
  StudyStatsCard,
  StudyStatsPractice,
} from './stats.model';

const NOW = new Date(2026, 10, 4, 12, 0, 0);

function emptyPractice(): StudyStatsPractice {
  return {
    grammar: { attemptCount: 0, correctCount: 0, manuallyAcceptedCount: 0, termErrorCount: 0, tenseErrorCount: 0, grammarErrorCount: 0, tenses: [] },
    composition: {
      attemptCount: 0,
      correctCount: 0,
      manuallyAcceptedCount: 0,
      wordCount: 0,
      correctWordCount: 0,
      wordErrorCount: 0,
      grammarErrorCount: 0,
      coherenceErrorCount: 0,
    },
    problemWords: [],
    weeks: [],
  };
}

function emptyStats(): StudyStats {
  return {
    totalCards: 0,
    dueCards: 0,
    totalIncorrect: 0,
    learnedCards: 0,
    studyDayStreak: 0,
    longestStudyDayStreak: 0,
    totalStudySeconds: 0,
    todayStudySeconds: 0,
    aiCallCount: 0,
    days: [],
    weeks: [],
    forecast: [],
    retention: { answerCount: 0, correctCount: 0, rate: null },
    cards: [],
    confusions: [],
    today: { answerCount: 0, correctCount: 0, secondsStudied: 0, newCardsIntroduced: 0, dailyNewCardGoal: 20 },
    activity: [],
    maturity: { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 },
    decks: [],
    leechCount: 0,
    practice: emptyPractice(),
  };
}

/** `count` egymás utáni nap `start`-tól (ISO nap), napi válaszszámokkal. */
function activity(start: string, days: Array<[answers: number, correct: number, seconds?: number]>): StudyStatsActivityDay[] {
  const [year, month, day] = start.split('-').map(Number);
  return days.map(([answerCount, correctCount, secondsStudied = 0], index) => ({
    date: new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10),
    answerCount,
    correctCount,
    secondsStudied,
  }));
}

function card(overrides: Partial<StudyStatsCard> = {}): StudyStatsCard {
  return {
    term: 'word',
    incorrectCount: 0,
    streak: 0,
    interval: 0,
    correctCount: 0,
    errorRate: null,
    isLearned: false,
    nextReviewDate: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(),
    deckName: 'Pakli',
    isLeech: false,
    isSuspended: false,
    isNew: false,
    lastReviewedAt: null,
    ...overrides,
  };
}

describe('buildStatsView', () => {
  describe('üres statisztika', () => {
    const view = buildStatsView(emptyStats(), NOW);

    it('nem mutat adatot és nem javasol semmit', () => {
      expect(view.hasAnswers).toBeFalse();
      expect(view.accuracy30).toBeNull();
      expect(view.accuracyDelta).toBeNull();
      expect(view.todayAccuracy).toBeNull();
      expect(view.suggestions).toEqual([]);
      expect(view.learnedPercent).toBe(0);
      expect(view.goalPercent).toBe(0);
      expect(view.cards).toEqual([]);
      expect(view.weekSeconds).toBe(0);
    });

    it('a hőtérkép és a trend üres, magyarázó szöveggel', () => {
      expect(view.heat.columns).toEqual([]);
      expect(view.heat.summary).toBe('Még nincs tanulási adat.');
      expect(view.trend.hasData).toBeFalse();
      expect(view.trend.summary).toContain('Még nincs elég adat');
    });

    it('minden szűrőszámláló nulla', () => {
      expect(view.chipCounts).toEqual({ all: 0, wrong: 0, leech: 0, new: 0, learning: 0, learned: 0 });
    });
  });

  describe('pontosság', () => {
    it('a legutóbbi 30 nap találati arányát százalékban adja', () => {
      const stats = emptyStats();
      stats.activity = activity('2026-09-05', Array.from({ length: 60 }, () => [10, 8] as [number, number]));

      const view = buildStatsView(stats, NOW);

      expect(view.accuracy30).toBe(80);
      expect(view.hasAnswers).toBeTrue();
    });

    it('a változás csak akkor számít, ha mindkét időszakban van legalább 10 válasz', () => {
      const stats = emptyStats();
      const previous = Array.from({ length: 30 }, () => [1, 1] as [number, number]); // 30 válasz, 100%
      const current = Array.from({ length: 30 }, () => [1, 0] as [number, number]); // 30 válasz, 0%
      stats.activity = activity('2026-09-05', [...previous, ...current]);

      expect(buildStatsView(stats, NOW).accuracyDelta).toBe(-100);

      stats.activity = activity('2026-09-05', [...Array.from({ length: 59 }, () => [0, 0] as [number, number]), [5, 5]]);
      expect(buildStatsView(stats, NOW).accuracyDelta).toBeNull();
    });

    it('a heti tanulási időt az utolsó 7 napból összegzi', () => {
      const stats = emptyStats();
      stats.activity = activity('2026-10-20', Array.from({ length: 15 }, (_, i) => [1, 1, i < 8 ? 1000 : 60] as [number, number, number]));

      expect(buildStatsView(stats, NOW).weekSeconds).toBe(7 * 60);
    });

    it('a mai találati arány a mai válaszokból számolódik', () => {
      const stats = emptyStats();
      stats.today = { ...stats.today, answerCount: 8, correctCount: 6 };

      expect(buildStatsView(stats, NOW).todayAccuracy).toBe(75);
    });
  });

  describe('haladás', () => {
    it('a megtanult szavak aránya kerekített százalék', () => {
      const stats = emptyStats();
      stats.totalCards = 3;
      stats.learnedCards = 1;

      expect(buildStatsView(stats, NOW).learnedPercent).toBe(33);
    });

    it('a napi cél teljesítése legfeljebb 100%', () => {
      const stats = emptyStats();
      stats.today = { ...stats.today, newCardsIntroduced: 30, dailyNewCardGoal: 20 };
      expect(buildStatsView(stats, NOW).goalPercent).toBe(100);

      stats.today = { ...stats.today, newCardsIntroduced: 5, dailyNewCardGoal: 20 };
      expect(buildStatsView(stats, NOW).goalPercent).toBe(25);

      stats.today = { ...stats.today, newCardsIntroduced: 5, dailyNewCardGoal: 0 };
      expect(buildStatsView(stats, NOW).goalPercent).toBe(0);
    });

    it('az érettségi sáv százalékai nem tartalmazzák az új kártyákat', () => {
      const stats = emptyStats();
      stats.maturity = { new: 500, learning: 2, young: 1, mature: 1, suspended: 0 };

      const segments = buildStatsView(stats, NOW).maturity;

      expect(segments.map(s => s.key)).toEqual(['new', 'learning', 'young', 'mature', 'suspended']);
      expect(segments.find(s => s.key === 'new')!.percent).toBe(0);
      expect(segments.find(s => s.key === 'learning')!.percent).toBe(50);
      expect(segments.find(s => s.key === 'young')!.percent).toBe(25);
      expect(segments.find(s => s.key === 'new')!.count).toBe(500);
    });

    it('az érettségi sáv nulla osztóval sem hibázik', () => {
      const stats = emptyStats();
      stats.maturity = { new: 4, learning: 0, young: 0, mature: 0, suspended: 0 };

      expect(buildStatsView(stats, NOW).maturity.every(s => s.percent === 0)).toBeTrue();
    });

    it('a pakli sorok százalékot és pontosságot számolnak', () => {
      const stats = emptyStats();
      stats.decks = [
        { deckId: 1, name: 'A', totalCards: 4, learnedCards: 1, dueCards: 0, correctCount: 3, incorrectCount: 1 },
        { deckId: 2, name: 'B', totalCards: 0, learnedCards: 0, dueCards: 0, correctCount: 0, incorrectCount: 0 },
      ];

      const [first, second] = buildStatsView(stats, NOW).decks;

      expect([first.learnedPercent, first.accuracy]).toEqual([25, 75]);
      expect([second.learnedPercent, second.accuracy]).toEqual([0, null]);
    });
  });

  describe('oszlopdiagramok', () => {
    it('az előrejelzés első oszlopa „ma”, a magasságok a legnagyobb értékhez igazodnak', () => {
      const stats = emptyStats();
      stats.forecast = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10),
        dueCount: i === 0 ? 4 : i === 2 ? 8 : 0,
      }));

      const view = buildStatsView(stats, NOW);

      expect(view.forecast7.length).toBe(7);
      expect(view.forecast30.length).toBe(30);
      expect(view.forecast7[0].label).toBe('ma');
      expect(view.forecast7[2].height).toBe(86);
      expect(view.forecast7[0].height).toBe(43);
      expect(view.forecast7[1].height).toBe(0);
      expect(view.forecast7[0].title).toBe('11.04: 4 kártya');
    });

    it('csupa nulla értéknél minden oszlop nulla magas', () => {
      const stats = emptyStats();
      stats.forecast = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, dueCount: 0 }));

      expect(buildStatsView(stats, NOW).forecast7.every(bar => bar.height === 0)).toBeTrue();
    });

    it('a megtanult szavak diagramja az utolsó 14 és 30 napot használja, az utolsó felirat mindig látszik', () => {
      const stats = emptyStats();
      stats.days = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 9, 6 + i)).toISOString().slice(0, 10),
        newLearned: i,
        cumulativeLearned: i,
      }));

      const view = buildStatsView(stats, NOW);

      expect(view.learned14.length).toBe(14);
      expect(view.learned30.length).toBe(30);
      expect(view.learned14[13].label).not.toBe('');
      expect(view.learned14[12].label).toBe('');
      expect(view.learned14[13].height).toBe(86);
    });

    it('a heti diagram legfeljebb 12 hetet mutat', () => {
      const stats = emptyStats();
      stats.weeks = Array.from({ length: 20 }, (_, i) => ({
        weekStart: new Date(Date.UTC(2026, 5, 1 + 7 * i)).toISOString().slice(0, 10),
        newLearned: i,
      }));

      expect(buildStatsView(stats, NOW).learnedWeeks.length).toBe(12);
    });
  });

  describe('hőtérkép', () => {
    it('hetenként 7 napos oszlopokat épít, hétfői kezdéssel', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-01', Array.from({ length: 14 }, () => [1, 1] as [number, number])); // hétfőn kezdődik

      const heat = buildStatsView(stats, NOW).heat;

      expect(heat.columns.length).toBe(2);
      expect(heat.columns.every(column => column.cells.length === 7)).toBeTrue();
      expect(heat.columns[0].cells[0]).not.toBeNull();
    });

    it('a csonka első hetet üres cellákkal tölti ki', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-03', [[1, 1], [1, 1]]); // szerdán kezdődik

      const heat = buildStatsView(stats, NOW).heat;

      expect(heat.columns.length).toBe(1);
      expect(heat.columns[0].cells.slice(0, 2)).toEqual([null, null]);
      expect(heat.columns[0].cells[2]).not.toBeNull();
      expect(heat.columns[0].cells.slice(4)).toEqual([null, null, null]);
    });

    it('a szint a legaktívabb naphoz viszonyított, a nulla válaszos nap 0', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-01', [[10, 10], [1, 1], [0, 0], [5, 5]]);

      const cells = buildStatsView(stats, NOW).heat.columns[0].cells.map(cell => cell?.level);

      expect(cells.slice(0, 4)).toEqual([4, 1, 0, 2]);
    });

    it('összesít: aktív napok, válaszok, napi átlag és szöveges összegzés', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-01', [[10, 10], [0, 0], [6, 3]]);

      const heat = buildStatsView(stats, NOW).heat;

      expect(heat.activeDays).toBe(2);
      expect(heat.totalAnswers).toBe(16);
      expect(heat.averagePerActiveDay).toBe(8);
      expect(heat.summary).toBe('Az elmúlt 3 napból 2 napon tanultál, összesen 16 választ adtál.');
    });

    it('a cellák címe jelzi, ha nem tanultál, egyébként a válaszokat és a pontosságot', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-01', [[0, 0], [4, 3, 125]]);

      const [idle, active] = buildStatsView(stats, NOW).heat.columns[0].cells;

      expect(idle!.title).toContain('nem tanultál');
      expect(active!.title).toContain('4 válasz, 75% helyes, 2 perc');
    });
  });

  describe('heti pontosság trend', () => {
    it('hetenként összegzi a napokat, és megszakítja a vonalat a válasz nélküli héten', () => {
      const stats = emptyStats();
      // három hét: 1. van adat, 2. nincs, 3. van adat (2024-01-01 hétfő)
      stats.activity = activity('2024-01-01', [
        ...Array.from({ length: 7 }, () => [2, 2] as [number, number]),
        ...Array.from({ length: 7 }, () => [0, 0] as [number, number]),
        ...Array.from({ length: 7 }, () => [2, 1] as [number, number]),
      ]);

      const trend = buildStatsView(stats, NOW).trend;

      expect(trend.hasData).toBeTrue();
      expect(trend.points.length).toBe(2);
      expect(trend.paths.length).toBe(2);
      expect(trend.points[0].title).toContain('100% helyes (14/14 válasz)');
      expect(trend.points[1].title).toContain('50% helyes (7/14 válasz)');
      expect(trend.points[0].y).toBeLessThan(trend.points[1].y); // a magasabb pontosság feljebb van
      expect(trend.summary).toContain('50%');
    });

    it('egyetlen hétnél a pont középre kerül', () => {
      const stats = emptyStats();
      stats.activity = activity('2024-01-01', [[2, 1]]);

      const trend = buildStatsView(stats, NOW).trend;

      expect(trend.points.length).toBe(1);
      expect(trend.points[0].x).toBe((trend.left + trend.width - trend.right) / 2);
    });
  });

  describe('javaslatok', () => {
    it('a sorozat veszélyére figyelmeztet, ha ma még nem tanultál', () => {
      const stats = emptyStats();
      stats.studyDayStreak = 4;

      const [first] = buildStatsView(stats, NOW).suggestions;

      expect(first.tone).toBe('warning');
      expect(first.text).toContain('4 napos sorozatod');
      expect(first.action).toBe('study');
    });

    it('az esedékes kártyákat jelzi', () => {
      const stats = emptyStats();
      stats.dueCards = 7;

      expect(buildStatsView(stats, NOW).suggestions[0].text).toContain('7 kártya esedékes');
    });

    it('a napi cél hiányzó részét az új kártyák számára korlátozza', () => {
      const stats = emptyStats();
      stats.today = { ...stats.today, newCardsIntroduced: 18, dailyNewCardGoal: 20 };
      stats.maturity.new = 1;

      expect(buildStatsView(stats, NOW).suggestions[0].text).toBe('Még 1 új kártya hiányzik a mai célodhoz.');
    });

    it('nem kér új kártyát, ha a cél teljesült vagy nincs új kártya', () => {
      const stats = emptyStats();
      stats.today = { ...stats.today, newCardsIntroduced: 20, dailyNewCardGoal: 20 };
      stats.maturity.new = 5;
      expect(buildStatsView(stats, NOW).suggestions.some(s => s.text.includes('új kártya hiányzik'))).toBeFalse();

      stats.today = { ...stats.today, newCardsIntroduced: 0 };
      stats.maturity.new = 0;
      expect(buildStatsView(stats, NOW).suggestions.some(s => s.text.includes('új kártya hiányzik'))).toBeFalse();
    });

    it('a nehéz szavakhoz külön gombot ad', () => {
      const stats = emptyStats();
      stats.leechCount = 3;

      const suggestion = buildStatsView(stats, NOW).suggestions.find(s => s.action === 'leech')!;

      expect(suggestion.text).toContain('3 nehéz szó');
      expect(suggestion.actionLabel).toBe('Megnézem');
    });

    it('legfeljebb három javaslatot ad', () => {
      const stats = emptyStats();
      stats.studyDayStreak = 2;
      stats.dueCards = 4;
      stats.leechCount = 2;
      stats.maturity.new = 10;

      expect(buildStatsView(stats, NOW).suggestions.length).toBe(3);
    });

    it('a heti pontosság jelentős javulását vagy romlását jelzi, elegendő válasznál', () => {
      const better = emptyStats();
      better.totalCards = 5;
      better.today = { ...better.today, answerCount: 1, newCardsIntroduced: 20 };
      better.activity = activity('2026-10-21', [...Array.from({ length: 7 }, () => [3, 1] as [number, number]), ...Array.from({ length: 7 }, () => [3, 3] as [number, number])]);
      const worse = structuredClone(better);
      worse.activity = activity('2026-10-21', [...Array.from({ length: 7 }, () => [3, 3] as [number, number]), ...Array.from({ length: 7 }, () => [3, 1] as [number, number])]);

      expect(buildStatsView(better, NOW).suggestions.some(s => s.tone === 'success' && s.text.includes('javult'))).toBeTrue();
      expect(buildStatsView(worse, NOW).suggestions.some(s => s.tone === 'warning' && s.text.includes('csökkent'))).toBeTrue();
    });

    it('kevés válasznál nem értékeli a heti változást', () => {
      const stats = emptyStats();
      stats.totalCards = 5;
      stats.today = { ...stats.today, answerCount: 1, newCardsIntroduced: 20 };
      stats.activity = activity('2026-10-21', [...Array.from({ length: 7 }, () => [1, 0] as [number, number]), ...Array.from({ length: 7 }, () => [1, 1] as [number, number])]);

      const texts = buildStatsView(stats, NOW).suggestions.map(s => s.text).join(' ');

      expect(texts).not.toContain('javult');
      expect(texts).not.toContain('csökkent');
    });

    it('ha nincs teendő, de ma tanult, megdicséri', () => {
      const stats = emptyStats();
      stats.totalCards = 5;
      stats.today = { ...stats.today, answerCount: 3, newCardsIntroduced: 20 };

      const suggestions = buildStatsView(stats, NOW).suggestions;

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].tone).toBe('success');
    });
  });

  describe('kártyasorok', () => {
    const rowFor = (stat: StudyStatsCard) => {
      const stats = emptyStats();
      stats.cards = [stat];
      return buildStatsView(stats, NOW).cards[0];
    };

    it('számolja a próbálkozásokat és a hibaszázalékot', () => {
      const row = rowFor(card({ correctCount: 3, incorrectCount: 1, errorRate: 0.25 }));

      expect(row.attempts).toBe(4);
      expect(row.errorPercent).toBe(25);
      expect(rowFor(card({ errorRate: null })).errorPercent).toBeNull();
    });

    it('az új és a felfüggesztett kártya külön felirat, soha nem esedékes', () => {
      const fresh = rowFor(card({ isNew: true }));
      const suspended = rowFor(card({ isSuspended: true }));

      expect([fresh.nextText, fresh.isDue]).toEqual(['Új', false]);
      expect([suspended.nextText, suspended.isDue]).toEqual(['Felfüggesztve', false]);
    });

    it('a múltbeli időpont „Esedékes”', () => {
      const row = rowFor(card({ nextReviewDate: new Date(NOW.getTime() - 3_600_000).toISOString() }));

      expect([row.nextText, row.isDue]).toEqual(['Esedékes', true]);
    });

    it('a közeli időpont „Ma”, „Holnap” vagy „N nap múlva”', () => {
      const at = (days: number, hours = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, 12 + hours).toISOString();

      expect(rowFor(card({ nextReviewDate: at(0, 5) })).nextText).toBe('Ma');
      expect(rowFor(card({ nextReviewDate: at(1) })).nextText).toBe('Holnap');
      expect(rowFor(card({ nextReviewDate: at(5) })).nextText).toBe('5 nap múlva');
      expect(rowFor(card({ nextReviewDate: at(60) })).nextText).toBe('60 nap múlva');
    });

    it('60 napon túl dátumot ír', () => {
      const far = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 90, 12).toISOString();

      const text = rowFor(card({ nextReviewDate: far })).nextText;

      expect(text).not.toContain('nap múlva');
      expect(text).toMatch(/\d{4}/);
    });

    it('a Z nélküli szerveridőt UTC-nek értelmezi', () => {
      const naive = new Date(NOW.getTime() - 3_600_000).toISOString().replace('Z', '');

      expect(rowFor(card({ nextReviewDate: naive })).isDue).toBeTrue();
    });

    it('a szűrőszámlálók a kártyák állapotából jönnek', () => {
      const stats = emptyStats();
      stats.cards = [
        card({ term: 'a', isNew: true }),
        card({ term: 'b', incorrectCount: 2, isLeech: true }),
        card({ term: 'c', isLearned: true, correctCount: 5 }),
        card({ term: 'd', correctCount: 1 }),
      ];

      expect(buildStatsView(stats, NOW).chipCounts).toEqual({ all: 4, wrong: 1, leech: 1, new: 1, learning: 2, learned: 1 });
    });

    it('a „volt válasz” jelző a kártyákból is kiderül', () => {
      const stats = emptyStats();
      stats.cards = [card({ correctCount: 1 })];

      expect(buildStatsView(stats, NOW).hasAnswers).toBeTrue();
    });
  });
});

describe('buildPracticeView', () => {
  it('gyakorlás nélkül üres nézetet ad', () => {
    const view = buildPracticeView(emptyPractice());

    expect(view.hasPractice).toBeFalse();
    expect(view.grammarPercent).toBeNull();
    expect(view.compositionPercent).toBeNull();
    expect(view.tenses).toEqual([]);
    expect(view.weakestTense).toBeNull();
    expect(view.errorGroups).toEqual([]);
    expect(view.trend.hasData).toBeFalse();
  });

  it('a nyelvtani és a mondat-százalékot külön számolja', () => {
    const practice = emptyPractice();
    practice.grammar = { ...practice.grammar, attemptCount: 4, correctCount: 3 };
    practice.composition = { ...practice.composition, attemptCount: 3, correctCount: 1 };

    const view = buildPracticeView(practice);

    expect(view.hasPractice).toBeTrue();
    expect(view.grammarPercent).toBe(75);
    expect(view.compositionPercent).toBe(33);
  });

  it('az igeidő-sorok felirata ismert kulcsnál olvasható, ismeretlennél a kulcs maga', () => {
    const practice = emptyPractice();
    practice.grammar.tenses = [
      { tense: 'present_perfect_continuous', attemptCount: 2, correctCount: 1 },
      { tense: 'made_up', attemptCount: 1, correctCount: 1 },
    ];

    const [known, unknown] = buildPracticeView(practice).tenses;

    expect(known.label).toBe('Present perfect continuous');
    expect(known.percent).toBe(50);
    expect(unknown.label).toBe('made_up');
  });

  describe('leggyengébb igeidő', () => {
    const withTenses = (...rows: Array<[string, number, number]>) => {
      const practice = emptyPractice();
      practice.grammar.tenses = rows.map(([tense, attemptCount, correctCount]) => ({ tense, attemptCount, correctCount }));
      return buildPracticeView(practice).weakestTense;
    };

    it('legalább három próbálkozás kell hozzá', () => {
      expect(withTenses(['past_simple', 2, 0])).toBeNull();
    });

    it('csak a 80% alatti igeidő számít gyengének', () => {
      expect(withTenses(['past_simple', 5, 4])).toBeNull();
      expect(withTenses(['past_simple', 5, 3])?.key).toBe('past_simple');
    });

    it('a legalacsonyabb százalékút választja, döntetlennél a több próbálkozásút', () => {
      expect(withTenses(['past_simple', 4, 2], ['going_to', 4, 1])?.key).toBe('going_to');
      expect(withTenses(['past_simple', 4, 2], ['going_to', 6, 3])?.key).toBe('going_to');
    });
  });

  describe('hibatípusok', () => {
    it('a kézzel elfogadott próbálkozásokat nem számítja a nevezőbe', () => {
      const practice = emptyPractice();
      practice.grammar = { ...practice.grammar, attemptCount: 10, manuallyAcceptedCount: 2, termErrorCount: 4, tenseErrorCount: 0, grammarErrorCount: 2 };

      const group = buildPracticeView(practice).errorGroups[0];

      expect(group.title).toBe('Nyelvtan');
      expect(group.rows.map(row => [row.key, row.count, row.total, row.percent])).toEqual([
        ['term', 4, 8, 50],
        ['tense', 0, 8, 0],
        ['grammar', 2, 8, 25],
      ]);
    });

    it('csak a próbálkozással rendelkező mód szerepel', () => {
      const practice = emptyPractice();
      practice.composition = { ...practice.composition, attemptCount: 5, wordErrorCount: 2, coherenceErrorCount: 1 };

      const groups = buildPracticeView(practice).errorGroups;

      expect(groups.map(group => group.title)).toEqual(['Mondatok']);
      expect(groups[0].rows.map(row => row.label)).toEqual(['Szóhasználat', 'Nyelvtan', 'Összefüggés']);
    });

    it('ha minden próbálkozást kézzel fogadtak el, nincs hibacsoport', () => {
      const practice = emptyPractice();
      practice.grammar = { ...practice.grammar, attemptCount: 3, manuallyAcceptedCount: 3 };

      expect(buildPracticeView(practice).errorGroups).toEqual([]);
    });
  });

  describe('heti trend', () => {
    const weeks = (...rows: Array<[number, number, number, number]>) =>
      rows.map(([grammarAttemptCount, grammarCorrectCount, compositionAttemptCount, compositionCorrectCount], index) => ({
        weekStart: new Date(Date.UTC(2024, 0, 1 + 7 * index)).toISOString().slice(0, 10),
        grammarAttemptCount,
        grammarCorrectCount,
        compositionAttemptCount,
        compositionCorrectCount,
      }));

    it('két külön sorozatot épít, és a hézagnál megszakítja a vonalat', () => {
      const practice = emptyPractice();
      practice.weeks = weeks([4, 4, 0, 0], [0, 0, 2, 1], [2, 1, 2, 2]);

      const trend = buildPracticeView(practice).trend;
      const [grammar, composition] = trend.series;

      expect(trend.hasData).toBeTrue();
      expect([grammar.key, composition.key]).toEqual(['grammar', 'composition']);
      expect(grammar.points.length).toBe(2);
      expect(grammar.paths.length).toBe(2); // a közbülső héten nincs nyelvtani adat
      expect(composition.points.length).toBe(2);
      expect(composition.paths.length).toBe(1);
      expect(grammar.points[0].title).toContain('Nyelvtan');
      expect(grammar.points[0].title).toContain('100% helyes (4/4)');
    });

    it('adat nélkül nincs pont, és a magyarázó szöveget adja', () => {
      const practice = emptyPractice();
      practice.weeks = weeks([0, 0, 0, 0], [0, 0, 0, 0]);

      const trend = buildPracticeView(practice).trend;

      expect(trend.hasData).toBeFalse();
      expect(trend.series.every(series => series.points.length === 0)).toBeTrue();
      expect(trend.summary).toContain('Még nincs elég adat');
    });

    it('hat hétnél ritkítja a feliratokat, de az utolsó mindig látszik', () => {
      const practice = emptyPractice();
      practice.weeks = weeks(...Array.from({ length: 12 }, () => [1, 1, 0, 0] as [number, number, number, number]));

      const labels = buildPracticeView(practice).trend.xLabels;

      expect(labels.length).toBe(6);
      expect(labels[labels.length - 1].x).toBeGreaterThan(labels[labels.length - 2].x);
    });
  });
});

describe('filterAndSortCards', () => {
  const row = (term: string, overrides: Partial<CardRow> = {}): CardRow => ({
    ...card({ term }),
    attempts: 0,
    errorPercent: null,
    nextText: '',
    isDue: false,
    nextTime: 0,
    ...overrides,
  });

  const rows = [
    row('banán', { deckName: 'Gyümölcs', incorrectCount: 1, errorPercent: 50, nextTime: 30 }),
    row('Ősz', { deckName: 'Évszakok', isNew: true, nextTime: 10 }),
    row('alma', { deckName: 'Gyümölcs', isLearned: true, errorPercent: 0, nextTime: 20 }),
    row('cseresznye', { deckName: 'Gyümölcs', isLeech: true, incorrectCount: 4, errorPercent: 80, nextTime: 5 }),
  ];

  const terms = (list: CardRow[]) => list.map(item => item.term);

  it('a szűrők a kártya állapotát nézik', () => {
    expect(terms(filterAndSortCards(rows, '', 'wrong', 'alpha'))).toEqual(['banán', 'cseresznye']);
    expect(terms(filterAndSortCards(rows, '', 'leech', 'alpha'))).toEqual(['cseresznye']);
    expect(terms(filterAndSortCards(rows, '', 'new', 'alpha'))).toEqual(['Ősz']);
    expect(terms(filterAndSortCards(rows, '', 'learned', 'alpha'))).toEqual(['alma']);
    expect(terms(filterAndSortCards(rows, '', 'learning', 'alpha'))).toEqual(['banán', 'cseresznye']);
    expect(filterAndSortCards(rows, '', 'all', 'alpha').length).toBe(4);
  });

  it('a keresés kis- és nagybetűtől független, magyar ékezetekkel is, a szóra és a paklira', () => {
    expect(terms(filterAndSortCards(rows, 'ŐSZ', 'all', 'alpha'))).toEqual(['Ősz']);
    expect(terms(filterAndSortCards(rows, '  gyümölcs ', 'all', 'alpha')).length).toBe(3);
    expect(filterAndSortCards(rows, 'nincs ilyen', 'all', 'alpha')).toEqual([]);
  });

  it('a szűrő és a keresés együtt érvényes', () => {
    expect(terms(filterAndSortCards(rows, 'gyümölcs', 'leech', 'alpha'))).toEqual(['cseresznye']);
  });

  it('ábécé szerint a magyar rendezést használja', () => {
    expect(terms(filterAndSortCards(rows, '', 'all', 'alpha'))).toEqual(['alma', 'banán', 'cseresznye', 'Ősz']);
  });

  it('hibaarány szerint csökkenő, a nem próbált kártya a végén', () => {
    expect(terms(filterAndSortCards(rows, '', 'all', 'error'))).toEqual(['cseresznye', 'banán', 'alma', 'Ősz']);
  });

  it('hibák száma szerint csökkenő, döntetlennél ábécé', () => {
    expect(terms(filterAndSortCards(rows, '', 'all', 'incorrect'))).toEqual(['cseresznye', 'banán', 'alma', 'Ősz']);
  });

  it('esedékesség szerint a legközelebbi van elöl', () => {
    expect(terms(filterAndSortCards(rows, '', 'all', 'due'))).toEqual(['cseresznye', 'Ősz', 'alma', 'banán']);
  });

  it('nem módosítja a bemeneti listát', () => {
    const before = terms(rows);

    filterAndSortCards(rows, '', 'all', 'due');

    expect(terms(rows)).toEqual(before);
  });
});
