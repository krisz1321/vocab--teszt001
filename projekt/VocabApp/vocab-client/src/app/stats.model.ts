// A statisztika oldal adatmodellje és a megjelenítéshez szükséges, tiszta számító függvények.

export interface StudyStatsDay { date: string; newLearned: number; cumulativeLearned: number; }
export interface StudyStatsWeek { weekStart: string; newLearned: number; }
export interface StudyStatsForecastDay { date: string; dueCount: number; }
export interface StudyStatsRetention { answerCount: number; correctCount: number; rate: number | null; }
export interface StudyStatsConfusion { term: string; confusedWithTerm: string; count: number; }
export interface StudyStatsToday {
  answerCount: number;
  correctCount: number;
  secondsStudied: number;
  newCardsIntroduced: number;
  dailyNewCardGoal: number;
}
export interface StudyStatsActivityDay { date: string; answerCount: number; correctCount: number; secondsStudied: number; }
export interface StudyStatsMaturity { new: number; learning: number; young: number; mature: number; suspended: number; }
export interface StudyStatsDeck {
  deckId: number;
  name: string;
  totalCards: number;
  learnedCards: number;
  dueCards: number;
  correctCount: number;
  incorrectCount: number;
}
export interface StudyStatsCard {
  term: string;
  incorrectCount: number;
  streak: number;
  interval: number;
  correctCount: number;
  errorRate: number | null;
  isLearned: boolean;
  nextReviewDate: string;
  deckName: string;
  isLeech: boolean;
  isSuspended: boolean;
  isNew: boolean;
  lastReviewedAt: string | null;
}

export interface StudyStats {
  totalCards: number;
  dueCards: number;
  totalIncorrect: number;
  learnedCards: number;
  studyDayStreak: number;
  longestStudyDayStreak: number;
  totalStudySeconds: number;
  todayStudySeconds: number;
  aiCallCount: number;
  days: StudyStatsDay[];
  weeks: StudyStatsWeek[];
  forecast: StudyStatsForecastDay[];
  retention: StudyStatsRetention;
  cards: StudyStatsCard[];
  confusions: StudyStatsConfusion[];
  today: StudyStatsToday;
  activity: StudyStatsActivityDay[];
  maturity: StudyStatsMaturity;
  decks: StudyStatsDeck[];
  leechCount: number;
}

export type StatsTab = 'overview' | 'progress' | 'words';
export type CardFilter = 'all' | 'wrong' | 'leech' | 'new' | 'learning' | 'learned';
export type CardSort = 'error' | 'incorrect' | 'due' | 'alpha';

export interface BarItem {
  label: string;
  value: number;
  /** Az oszlop magassága a diagram területének százalékában. */
  height: number;
  title: string;
}

export interface HeatCell { level: number; title: string; }
export interface HeatColumn { monthLabel: string; cells: (HeatCell | null)[]; }
export interface HeatMap {
  columns: HeatColumn[];
  activeDays: number;
  totalAnswers: number;
  averagePerActiveDay: number;
  summary: string;
}

export interface TrendPoint { x: number; y: number; title: string; }
export interface TrendLabel { x: number; text: string; }
export interface Trend {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  paths: string[];
  points: TrendPoint[];
  xLabels: TrendLabel[];
  hasData: boolean;
  summary: string;
}

export interface MaturitySegment { key: string; label: string; hint: string; count: number; percent: number; }

export interface Suggestion {
  tone: 'primary' | 'warning' | 'success';
  text: string;
  action?: 'study' | 'leech';
  actionLabel?: string;
}

export interface DeckRow extends StudyStatsDeck {
  learnedPercent: number;
  accuracy: number | null;
}

export interface CardRow extends StudyStatsCard {
  attempts: number;
  errorPercent: number | null;
  nextText: string;
  isDue: boolean;
  nextTime: number;
}

export interface StatsView {
  heat: HeatMap;
  trend: Trend;
  accuracy30: number | null;
  accuracyDelta: number | null;
  weekSeconds: number;
  learnedPercent: number;
  todayAccuracy: number | null;
  goalPercent: number;
  suggestions: Suggestion[];
  maturity: MaturitySegment[];
  forecast7: BarItem[];
  forecast30: BarItem[];
  learned14: BarItem[];
  learned30: BarItem[];
  learnedWeeks: BarItem[];
  decks: DeckRow[];
  cards: CardRow[];
  chipCounts: Record<CardFilter, number>;
  hasAnswers: boolean;
}

const DAY_MS = 86_400_000;
const BAR_MAX_HEIGHT = 86;

const shortDay = {
  format: (ms: number): string => {
    const date = new Date(ms);
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
  },
};
const longDay = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('hu-HU', { month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });

/** A szerver naptári napot küld (helyi éjfél), ezért csak a dátumrészt olvassuk, időzóna-eltolódás nélkül. */
export function parseDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(value);
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** A tárolt UTC időpontok az API-ból gyakran "Z" nélkül érkeznek. */
export function parseUtcInstant(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function formatStudyTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) {
    return '0 perc';
  }

  if (seconds < 60) {
    return `${seconds} mp`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours === 0 ? `${minutes} perc` : `${hours} óra ${minutes} perc`;
}

function weekdayMonday0(dayMs: number): number {
  return (new Date(dayMs).getUTCDay() + 6) % 7;
}

function makeBars(items: { label: string; value: number; title: string }[]): BarItem[] {
  const max = items.reduce((highest, item) => Math.max(highest, item.value), 0);
  return items.map(item => ({
    ...item,
    height: max === 0 ? 0 : (item.value / max) * BAR_MAX_HEIGHT,
  }));
}

function sparseLabel(index: number, length: number, step: number, text: string): string {
  return index === length - 1 || index % step === 0 ? text : '';
}

function buildHeat(activity: StudyStatsActivityDay[]): HeatMap {
  if (activity.length === 0) {
    return { columns: [], activeDays: 0, totalAnswers: 0, averagePerActiveDay: 0, summary: 'Még nincs tanulási adat.' };
  }

  const max = activity.reduce((highest, day) => Math.max(highest, day.answerCount), 0);
  const days = activity.map(day => {
    const ms = parseDay(day.date);
    const accuracy = percent(day.correctCount, day.answerCount);
    const title = day.answerCount === 0
      ? `${longDay.format(ms)}: nem tanultál`
      : `${longDay.format(ms)}: ${day.answerCount} válasz, ${accuracy}% helyes, ${formatStudyTime(day.secondsStudied)}`;
    const level = day.answerCount === 0 ? 0 : Math.min(4, Math.ceil((day.answerCount / max) * 4));
    return { ms, cell: { level, title } as HeatCell };
  });

  const cells: ({ ms: number; cell: HeatCell } | null)[] = [
    ...Array<null>(weekdayMonday0(days[0].ms)).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const columns: HeatColumn[] = [];
  let previousMonth = -1;
  for (let start = 0; start < cells.length; start += 7) {
    const slice = cells.slice(start, start + 7);
    const firstDay = slice.find(entry => entry !== null);
    const month = firstDay ? new Date(firstDay.ms).getUTCMonth() : previousMonth;
    columns.push({
      monthLabel: firstDay && month !== previousMonth ? monthName.format(firstDay.ms) : '',
      cells: slice.map(entry => entry?.cell ?? null),
    });
    previousMonth = month;
  }

  const activeDays = activity.filter(day => day.answerCount > 0).length;
  const totalAnswers = activity.reduce((sum, day) => sum + day.answerCount, 0);
  return {
    columns,
    activeDays,
    totalAnswers,
    averagePerActiveDay: activeDays === 0 ? 0 : Math.round(totalAnswers / activeDays),
    summary: `Az elmúlt ${activity.length} napból ${activeDays} napon tanultál, összesen ${totalAnswers} választ adtál.`,
  };
}

function buildTrend(activity: StudyStatsActivityDay[]): Trend {
  const width = 600;
  const height = 190;
  const left = 50;
  const right = 26;
  const top = 12;
  const bottom = 28;
  const weeks = new Map<number, { answers: number; correct: number }>();
  for (const day of activity) {
    const ms = parseDay(day.date);
    const key = ms - weekdayMonday0(ms) * DAY_MS;
    const entry = weeks.get(key) ?? { answers: 0, correct: 0 };
    entry.answers += day.answerCount;
    entry.correct += day.correctCount;
    weeks.set(key, entry);
  }

  const ordered = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
  const stepX = ordered.length > 1 ? (width - left - right) / (ordered.length - 1) : 0;
  const plotHeight = height - top - bottom;
  const points: TrendPoint[] = [];
  const paths: string[] = [];
  const xLabels: TrendLabel[] = [];
  let current = '';
  ordered.forEach(([weekMs, entry], index) => {
    const x = ordered.length > 1 ? left + stepX * index : (left + width - right) / 2;
    if (ordered.length < 6 || (ordered.length - 1 - index) % 2 === 0) {
      xLabels.push({ x, text: shortDay.format(weekMs) });
    }

    const accuracy = percent(entry.correct, entry.answers);
    if (accuracy === null) {
      if (current) {
        paths.push(current);
        current = '';
      }
      return;
    }

    const y = top + (1 - accuracy / 100) * plotHeight;
    points.push({
      x,
      y,
      title: `${shortDay.format(weekMs)} hete: ${accuracy}% helyes (${entry.correct}/${entry.answers} válasz)`,
    });
    current += `${current ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  if (current) {
    paths.push(current);
  }

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    paths,
    points,
    xLabels,
    hasData: points.length > 0,
    summary: points.length === 0
      ? 'Még nincs elég adat a heti pontosság megjelenítéséhez.'
      : `Heti pontosság az elmúlt hetekben, az utolsó héten ${percent(
        ordered[ordered.length - 1][1].correct,
        ordered[ordered.length - 1][1].answers) ?? 0}%.`,
  };
}

function sumRange(activity: StudyStatsActivityDay[]): { answers: number; correct: number; seconds: number } {
  return activity.reduce(
    (total, day) => ({
      answers: total.answers + day.answerCount,
      correct: total.correct + day.correctCount,
      seconds: total.seconds + day.secondsStudied,
    }),
    { answers: 0, correct: 0, seconds: 0 });
}

function nextReviewText(card: StudyStatsCard, now: Date): { text: string; isDue: boolean; time: number } {
  if (card.isNew) {
    return { text: 'Új', isDue: false, time: Number.MAX_SAFE_INTEGER };
  }

  if (card.isSuspended) {
    return { text: 'Felfüggesztve', isDue: false, time: Number.MAX_SAFE_INTEGER - 1 };
  }

  const next = parseUtcInstant(card.nextReviewDate);
  if (next.getTime() <= now.getTime()) {
    return { text: 'Esedékes', isDue: true, time: next.getTime() };
  }

  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(next) - startOf(now)) / DAY_MS);
  const text = days <= 0 ? 'Ma'
    : days === 1 ? 'Holnap'
      : days <= 60 ? `${days} nap múlva`
        : fullDate.format(next);
  return { text, isDue: false, time: next.getTime() };
}

function buildSuggestions(
  stats: StudyStats,
  weekAnswers: { current: number; previous: number },
  weekAccuracy: { current: number | null; previous: number | null }): Suggestion[] {
  const suggestions: Suggestion[] = [];
  if (stats.studyDayStreak > 0 && stats.today.answerCount === 0) {
    suggestions.push({
      tone: 'warning',
      text: `Ma még nem tanultál. A ${stats.studyDayStreak} napos sorozatod megtartásához gyakorolj legalább egy kicsit.`,
      action: 'study',
      actionLabel: 'Tanulás',
    });
  }

  if (stats.dueCards > 0) {
    suggestions.push({
      tone: 'primary',
      text: `${stats.dueCards} kártya esedékes most. Minél hamarabb átnézed, annál jobban megmarad.`,
      action: 'study',
      actionLabel: 'Átnézem',
    });
  }

  const dailyGoal = stats.today.dailyNewCardGoal;
  const newCards = stats.maturity.new;
  if (dailyGoal > 0 && stats.today.newCardsIntroduced < dailyGoal && newCards > 0) {
    const remaining = Math.min(dailyGoal - stats.today.newCardsIntroduced, newCards);
    suggestions.push({
      tone: 'primary',
      text: `Még ${remaining} új kártya hiányzik a mai célodhoz.`,
      action: 'study',
      actionLabel: 'Tanulás',
    });
  }

  if (stats.leechCount > 0) {
    suggestions.push({
      tone: 'warning',
      text: `${stats.leechCount} nehéz szó (sokat hibázol rajtuk) vár átnézésre. Érdemes külön gyakorolni őket.`,
      action: 'leech',
      actionLabel: 'Megnézem',
    });
  }

  if (weekAnswers.current >= 15 && weekAnswers.previous >= 15
    && weekAccuracy.current !== null && weekAccuracy.previous !== null) {
    const diff = weekAccuracy.current - weekAccuracy.previous;
    if (diff >= 8) {
      suggestions.push({ tone: 'success', text: `Szép munka! A pontosságod ${diff} ponttal javult az előző héthez képest.` });
    } else if (diff <= -8) {
      suggestions.push({ tone: 'warning', text: `A pontosságod ${-diff} ponttal csökkent az előző héthez képest. Lehet, hogy érdemes lassabban haladni az új szavakkal.` });
    }
  }

  if (suggestions.length === 0 && stats.totalCards > 0 && stats.today.answerCount > 0) {
    suggestions.push({ tone: 'success', text: 'Mára minden esedékes kártyát átnéztél. Jó munka!' });
  }

  return suggestions.slice(0, 3);
}

export function buildStatsView(stats: StudyStats, now: Date): StatsView {
  const activity = stats.activity ?? [];
  const last30 = sumRange(activity.slice(-30));
  const previous30 = sumRange(activity.slice(-60, -30));
  const last7 = sumRange(activity.slice(-7));
  const previous7 = sumRange(activity.slice(-14, -7));
  const accuracy30 = percent(last30.correct, last30.answers);
  const previousAccuracy30 = percent(previous30.correct, previous30.answers);
  const accuracyDelta = accuracy30 !== null && previousAccuracy30 !== null
    && last30.answers >= 10 && previous30.answers >= 10
    ? accuracy30 - previousAccuracy30
    : null;

  // Az új (még nem gyakorolt) kártyák nem kerülnek a sávba, különben egy nagy, érintetlen pakli eltakarná a többit.
  const maturityTotal = stats.maturity.learning + stats.maturity.young + stats.maturity.mature + stats.maturity.suspended;
  const maturityPart = (key: string, label: string, hint: string, count: number): MaturitySegment => ({
    key,
    label,
    hint,
    count,
    percent: key === 'new' || maturityTotal === 0 ? 0 : (count / maturityTotal) * 100,
  });

  const forecast = stats.forecast.map((day, index) => {
    const label = index === 0 ? 'ma' : String(new Date(parseDay(day.date)).getUTCDate());
    return { label, value: day.dueCount, title: `${shortDay.format(parseDay(day.date))}: ${day.dueCount} kártya` };
  });
  const forecastBars = (length: number, step: number): BarItem[] =>
    makeBars(forecast.slice(0, length).map((day, index, all) => ({
      label: index === 0 ? 'ma' : sparseLabel(index, all.length, step, day.label),
      value: day.value,
      title: day.title,
    })));

  const learnedBars = (length: number, step: number): BarItem[] =>
    makeBars(stats.days.slice(-length).map((day, index, all) => ({
      label: sparseLabel(index, all.length, step, String(new Date(parseDay(day.date)).getUTCDate())),
      value: day.newLearned,
      title: `${shortDay.format(parseDay(day.date))}: ${day.newLearned} új megtanult szó (összesen ${day.cumulativeLearned})`,
    })));

  const rows: CardRow[] = stats.cards.map(card => {
    const attempts = card.correctCount + card.incorrectCount;
    const next = nextReviewText(card, now);
    return {
      ...card,
      attempts,
      errorPercent: card.errorRate === null ? null : Math.round(card.errorRate * 100),
      nextText: next.text,
      isDue: next.isDue,
      nextTime: next.time,
    };
  });

  const chipCounts: Record<CardFilter, number> = {
    all: rows.length,
    wrong: rows.filter(row => row.incorrectCount > 0).length,
    leech: rows.filter(row => row.isLeech).length,
    new: rows.filter(row => row.isNew).length,
    learning: rows.filter(row => !row.isNew && !row.isLearned).length,
    learned: rows.filter(row => row.isLearned).length,
  };

  return {
    heat: buildHeat(activity),
    trend: buildTrend(activity),
    accuracy30,
    accuracyDelta,
    weekSeconds: last7.seconds,
    learnedPercent: percent(stats.learnedCards, stats.totalCards) ?? 0,
    todayAccuracy: percent(stats.today.correctCount, stats.today.answerCount),
    goalPercent: stats.today.dailyNewCardGoal > 0
      ? Math.min(100, Math.round((stats.today.newCardsIntroduced / stats.today.dailyNewCardGoal) * 100))
      : 0,
    suggestions: buildSuggestions(
      stats,
      { current: last7.answers, previous: previous7.answers },
      { current: percent(last7.correct, last7.answers), previous: percent(previous7.correct, previous7.answers) }),
    maturity: [
      maturityPart('new', 'Új', 'még nem gyakoroltad', stats.maturity.new),
      maturityPart('learning', 'Tanulás alatt', 'ismétlési köz 7 nap alatt', stats.maturity.learning),
      maturityPart('young', 'Fiatal', 'köz 7–20 nap', stats.maturity.young),
      maturityPart('mature', 'Érett', 'köz 21 nap vagy több', stats.maturity.mature),
      maturityPart('suspended', 'Szüneteltetett', 'felfüggesztett vagy elhalasztott', stats.maturity.suspended),
    ],
    forecast7: forecastBars(7, 1),
    forecast30: forecastBars(30, 5),
    learned14: learnedBars(14, 2),
    learned30: learnedBars(30, 5),
    learnedWeeks: makeBars(stats.weeks.slice(-12).map(week => ({
      label: shortDay.format(parseDay(week.weekStart)),
      value: week.newLearned,
      title: `${shortDay.format(parseDay(week.weekStart))} hete: ${week.newLearned} új megtanult szó`,
    }))),
    decks: stats.decks.map(deck => ({
      ...deck,
      learnedPercent: percent(deck.learnedCards, deck.totalCards) ?? 0,
      accuracy: percent(deck.correctCount, deck.correctCount + deck.incorrectCount),
    })),
    cards: rows,
    chipCounts,
    hasAnswers: stats.retention.answerCount > 0 || activity.some(day => day.answerCount > 0)
      || stats.cards.some(card => card.correctCount + card.incorrectCount > 0),
  };
}

export function filterAndSortCards(
  cards: CardRow[],
  search: string,
  filter: CardFilter,
  sort: CardSort): CardRow[] {
  const query = search.trim().toLocaleLowerCase('hu-HU');
  const matchesFilter = (card: CardRow): boolean => {
    switch (filter) {
      case 'wrong': return card.incorrectCount > 0;
      case 'leech': return card.isLeech;
      case 'new': return card.isNew;
      case 'learning': return !card.isNew && !card.isLearned;
      case 'learned': return card.isLearned;
      default: return true;
    }
  };

  const filtered = cards.filter(card => matchesFilter(card)
    && (query === '' || card.term.toLocaleLowerCase('hu-HU').includes(query)
      || card.deckName.toLocaleLowerCase('hu-HU').includes(query)));

  const byTerm = (a: CardRow, b: CardRow) => a.term.localeCompare(b.term, 'hu-HU', { sensitivity: 'base' });
  const comparers: Record<CardSort, (a: CardRow, b: CardRow) => number> = {
    error: (a, b) => (b.errorPercent ?? -1) - (a.errorPercent ?? -1) || b.incorrectCount - a.incorrectCount || byTerm(a, b),
    incorrect: (a, b) => b.incorrectCount - a.incorrectCount || byTerm(a, b),
    due: (a, b) => a.nextTime - b.nextTime || byTerm(a, b),
    alpha: byTerm,
  };

  return filtered.sort(comparers[sort]);
}
