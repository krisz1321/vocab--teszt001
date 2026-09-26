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

interface StudyStats {
  totalCards: number;
  dueCards: number;
  totalIncorrect: number;
  learnedCards: number;
  studyDayStreak: number;
  longestStudyDayStreak: number;
  totalStudySeconds: number;
  todayStudySeconds: number;
  days: StudyStatsDay[];
  weeks: StudyStatsWeek[];
  cards: StudyStatsCard[];
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="container py-5">
      <div class="mx-auto" style="max-width: 760px;">
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
          <div class="row g-3 mb-4">
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Kártyák</div>
                <div class="fs-3 fw-semibold">{{ stats.totalCards }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Esedékes</div>
                <div class="fs-3 fw-semibold">{{ stats.dueCards }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Hibák összesen</div>
                <div class="fs-3 fw-semibold">{{ stats.totalIncorrect }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Megtanult szavak</div>
                <div class="fs-3 fw-semibold">{{ stats.learnedCards }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Napi sorozat</div>
                <div class="fs-3 fw-semibold">{{ stats.studyDayStreak }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
                <div class="text-body-secondary">Leghosszabb sorozat</div>
                <div class="fs-3 fw-semibold">{{ stats.longestStudyDayStreak }}</div>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="border rounded p-3 h-100">
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
              <table class="table align-middle">
                <thead>
                  <tr>
                    <th scope="col">Szó</th>
                    <th scope="col">Helyes</th>
                    <th scope="col">Hibák</th>
                    <th scope="col">Hibaarány</th>
                    <th scope="col">Helyes sorozat</th>
                    <th scope="col">Megtanult</th>
                    <th scope="col">Időköz (nap)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (card of stats.cards; track card.term) {
                    <tr>
                      <td>{{ card.term }}</td>
                      <td>{{ card.correctCount }}</td>
                      <td>{{ card.incorrectCount }}</td>
                      <td>{{ formatErrorRate(card.errorRate) }}</td>
                      <td>{{ card.streak }}</td>
                      <td>{{ card.isLearned ? 'Igen' : 'Nem' }}</td>
                      <td>{{ card.interval }}</td>
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
        background-color: #0d6efd;
        border-radius: 0.2rem 0.2rem 0 0;
      }
      .learn-bar-empty {
        background-color: #dee2e6;
      }
      .learn-label {
        margin-top: 0.35rem;
        font-size: 0.75rem;
        color: #6c757d;
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
