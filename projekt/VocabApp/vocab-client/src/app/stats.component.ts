import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { finalize } from 'rxjs';

interface StudyStatsCard {
  term: string;
  incorrectCount: number;
  streak: number;
  interval: number;
  correctCount: number;
  errorRate: number | null;
  isLearned: boolean;
  nextReviewDate: string;
}

interface StudyStatsDay {
  date: string;
  newLearned: number;
  cumulativeLearned: number;
}

interface StudyStatsWeek {
  weekStart: string;
  newLearned: number;
}

interface StudyStatsConfusion {
  term: string;
  confusedWithTerm: string;
  count: number;
}

interface StudyStats {
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
  cards: StudyStatsCard[];
  confusions: StudyStatsConfusion[];
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="mb-4">
          <h1 class="display-6 fw-semibold">Statisztika</h1>
          <p class="text-body-secondary mb-0">A kártyák haladása és a legtöbbet elrontott szavak.</p>
        </header>

        @if (isLoading) {
          <div class="text-center py-5" role="status">
            <div class="spinner-border text-primary"></div>
            <p class="mt-3 mb-0">Statisztika betöltése…</p>
          </div>
        }

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (stats && !isLoading) {
          <div class="row g-2 g-md-3 mb-4 stat-grid">
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">MI-hívások</div>
                <div class="fs-3 fw-semibold">{{ stats.aiCallCount }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Kártyák</div>
                <div class="fs-3 fw-semibold">{{ stats.totalCards }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Esedékes</div>
                <div class="fs-3 fw-semibold">{{ stats.dueCards }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Hibák összesen</div>
                <div class="fs-3 fw-semibold">{{ stats.totalIncorrect }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Megtanult szavak</div>
                <div class="fs-3 fw-semibold">{{ stats.learnedCards }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Napi sorozat</div>
                <div class="fs-3 fw-semibold">{{ stats.studyDayStreak }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Leghosszabb sorozat</div>
                <div class="fs-3 fw-semibold">{{ stats.longestStudyDayStreak }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="border rounded p-2 p-md-3 h-100 stat-tile">
                <div class="text-body-secondary">Teljes idő</div>
                <div class="fs-3 fw-semibold">{{ formatStudyTime(stats.totalStudySeconds) }}</div>
                <div class="text-body-secondary mt-2">Mai idő</div>
                <div class="fw-semibold">{{ formatStudyTime(stats.todayStudySeconds) }}</div>
              </div>
            </div>
          </div>

          <h2 class="h5 mb-3">Megtanult szavak, elmúlt 14 nap</h2>
          <div class="learn-chart mb-4">
            @for (day of stats.days; track day.date) {
              <div class="learn-col">
                <div class="learn-plot">
                  <div
                    class="learn-bar"
                    [class.learn-bar-empty]="maxCumulative(stats.days) === 0"
                    [style.height.%]="barHeight(day.cumulativeLearned, maxCumulative(stats.days))"
                    [attr.title]="'új: ' + day.newLearned + ', összesen: ' + day.cumulativeLearned">
                  </div>
                </div>
                <div class="learn-label">{{ dayOfMonth(day.date) }}</div>
              </div>
            }
          </div>

          <h2 class="h5 mb-3">Új megtanult szavak, elmúlt 4 hét</h2>
          <div class="learn-chart learn-chart-weeks mb-4">
            @for (week of stats.weeks; track week.weekStart) {
              <div class="learn-col">
                <div class="learn-plot">
                  <div
                    class="learn-bar"
                    [class.learn-bar-empty]="maxWeekly(stats.weeks) === 0"
                    [style.height.%]="barHeight(week.newLearned, maxWeekly(stats.weeks))">
                  </div>
                </div>
                <div class="learn-label">{{ weekLabel(week.weekStart) }}</div>
              </div>
            }
          </div>

          @if (stats.cards.length === 0) {
            <div class="alert alert-info">Még nincs tanulható kártya.</div>
          } @else {
            <div class="table-responsive">
              <table class="table align-middle stats-table">
                <thead>
                  <tr>
                    <th scope="col">Szó</th>
                    <th scope="col">Helyes</th>
                    <th scope="col">Hibák</th>
                    <th scope="col">Hibaarány</th>
                    <th scope="col" class="d-none d-md-table-cell">Helyes sorozat</th>
                    <th scope="col">Megtanult</th>
                    <th scope="col" class="d-none d-md-table-cell">Időköz (nap)</th>
                    <th scope="col" class="d-none d-md-table-cell">Következő ismétlés</th>
                  </tr>
                </thead>
                <tbody>
                  @for (card of stats.cards; track card.term) {
                    <tr>
                      <td class="text-break term-cell">{{ card.term }}</td>
                      <td>{{ card.correctCount }}</td>
                      <td>{{ card.incorrectCount }}</td>
                      <td>{{ formatErrorRate(card.errorRate) }}</td>
                      <td class="d-none d-md-table-cell">{{ card.streak }}</td>
                      <td>{{ card.isLearned ? 'Igen' : 'Nem' }}</td>
                      <td class="d-none d-md-table-cell">{{ card.interval }}</td>
                      <td class="d-none d-md-table-cell">{{ formatNextReview(card.nextReviewDate) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <h2 class="h5 mb-3 mt-4">Összetévesztett szavak</h2>
          @if (stats.confusions.length === 0) {
            <div class="alert alert-info">Még nincs olyan hibás válasz, ami egy másik kártyád szava lett volna.</div>
          } @else {
            <div class="table-responsive">
              <table class="table align-middle stats-table">
                <thead>
                  <tr>
                    <th scope="col">Kérdezett szó</th>
                    <th scope="col">Beírt szó</th>
                    <th scope="col">Alkalom</th>
                  </tr>
                </thead>
                <tbody>
                  @for (confusion of stats.confusions; track $index) {
                    <tr>
                      <td class="text-break">{{ confusion.term }}</td>
                      <td class="text-break">{{ confusion.confusedWithTerm }}</td>
                      <td>{{ confusion.count }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </div>
    </main>
  `,
  styles: [
    `
      .stat-tile .text-body-secondary { font-size: 0.85rem; }
      @media (max-width: 767.98px) {
        .stat-tile .fs-3 { font-size: 1.35rem !important; }
        .stats-table { font-size: 0.9rem; }
        .stats-table .term-cell { max-width: 9rem; }
        .stats-table th, .stats-table td { padding: 0.4rem 0.35rem; }
        .learn-plot { height: 6rem; }
      }
      .learn-chart {
        display: flex;
        align-items: flex-end;
        gap: 0.35rem;
      }
      .learn-col {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .learn-plot {
        width: 100%;
        height: 8rem;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .learn-bar {
        width: 100%;
        max-width: 2.25rem;
        background-color: var(--app-primary);
        border-radius: 0.2rem 0.2rem 0 0;
      }
      .learn-bar-empty {
        background-color: var(--app-border);
      }
      .learn-label {
        margin-top: 0.35rem;
        font-size: 0.75rem;
        color: var(--app-muted);
        text-align: center;
      }
    `,
  ],
})
export class StatsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  stats: StudyStats | null = null;
  isLoading = false;
  errorMessage: string | null = null;

  ngOnInit(): void {
    this.isLoading = true;
    this.http.get<StudyStats>('/api/study/stats')
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: stats => this.stats = stats,
        error: (error: HttpErrorResponse) => {
          this.errorMessage = error.status === 404
            ? 'A statisztika betöltése sikertelen: a kért adat nem található.'
            : 'A statisztika betöltése sikertelen. Kérlek, próbáld újra.';
        },
      });
  }

  formatStudyTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    if (seconds === 0) {
      return '0 perc';
    }

    if (seconds < 60) {
      return `${seconds} mp`;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) {
      return `${minutes} perc`;
    }

    return `${hours} óra ${minutes} perc`;
  }

  formatErrorRate(rate: number | null): string {
    if (rate === null) {
      return '—';
    }

    return `${Math.round(rate * 100)}%`;
  }

  formatNextReview(value: string): string {
    return new Intl.DateTimeFormat('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }

  barHeight(value: number, max: number): number {
    if (max <= 0) {
      return 8;
    }

    return (value / max) * 100;
  }

  maxCumulative(days: StudyStatsDay[]): number {
    return days.reduce((max, day) => Math.max(max, day.cumulativeLearned), 0);
  }

  maxWeekly(weeks: StudyStatsWeek[]): number {
    return weeks.reduce((max, week) => Math.max(max, week.newLearned), 0);
  }

  dayOfMonth(value: string): number {
    return new Date(value).getUTCDate();
  }

  weekLabel(value: string): string {
    const date = new Date(value);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${month}.${day}`;
  }
}
