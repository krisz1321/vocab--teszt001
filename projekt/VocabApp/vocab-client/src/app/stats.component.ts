import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import {
  BarItem,
  CardFilter,
  CardSort,
  StatsTab,
  StatsView,
  StudyStats,
  buildStatsView,
  filterAndSortCards,
  formatStudyTime,
} from './stats.model';

const TAB_STORAGE_KEY = 'stats-tab';
const PAGE_SIZE = 25;

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="mb-3">
          <h1 class="h3 mb-1">Statisztika</h1>
          <p class="text-body-secondary mb-0">Mit értél el, hol tartasz, és mit érdemes még gyakorolnod.</p>
        </header>

        @if (isLoading()) {
          <div class="text-center py-5" role="status">
            <div class="spinner-border text-primary"></div>
            <p class="mt-3 mb-0">Statisztika betöltése…</p>
          </div>
        }

        @if (errorMessage(); as message) {
          <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
            <span>{{ message }}</span>
            <button type="button" class="btn btn-sm btn-outline-danger" (click)="load()">Újra</button>
          </div>
        }

        @if (stats(); as s) {
          @if (vm(); as v) {
            @if (s.totalCards === 0) {
              <div class="alert alert-info" role="status">
                Még nincs egyetlen kártyád sem. A Paklik menüben hozhatsz létre új paklit vagy importálhatsz szavakat, a statisztika a tanulással kezd el kitöltődni.
              </div>
            }

            <div class="seg mb-3" role="tablist" aria-label="Statisztika nézetek">
              @for (item of tabs; track item.id) {
                <button
                  type="button"
                  role="tab"
                  [class.is-active]="tab() === item.id"
                  [attr.aria-selected]="tab() === item.id"
                  (click)="selectTab(item.id)">{{ item.label }}</button>
              }
            </div>

            <!-- ============================== ÁTTEKINTÉS ============================== -->
            @if (tab() === 'overview') {
              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-today">
                <div class="card-body p-3 p-md-4">
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                    <h2 id="stats-today" class="h5 mb-0">Mai nap</h2>
                    <button type="button" class="btn btn-primary btn-sm px-3" (click)="startStudy.emit()">Tanulás indítása</button>
                  </div>
                  <div class="row g-3">
                    <div class="col-4">
                      <div class="text-body-secondary small">Válasz</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ s.today.answerCount }}</div>
                      <div class="text-body-secondary small mt-1">
                        @if (v.todayAccuracy !== null) { {{ v.todayAccuracy }}% helyes } @else { még nincs }
                      </div>
                    </div>
                    <div class="col-4">
                      <div class="text-body-secondary small">Tanulási idő</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ formatTime(s.today.secondsStudied) }}</div>
                    </div>
                    <div class="col-4">
                      <div class="text-body-secondary small">Esedékes</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1" [class.text-danger]="s.dueCards > 0">{{ s.dueCards }}</div>
                      <div class="text-body-secondary small mt-1">kártya</div>
                    </div>
                  </div>
                  @if (s.today.dailyNewCardGoal > 0) {
                    <div class="mt-3">
                      <div class="d-flex justify-content-between small mb-1">
                        <span class="text-body-secondary">Új kártyák a napi célból</span>
                        <span class="fw-semibold">{{ s.today.newCardsIntroduced }} / {{ s.today.dailyNewCardGoal }}</span>
                      </div>
                      <div class="meter" role="progressbar" aria-label="Napi új kártya cél"
                        [attr.aria-valuenow]="v.goalPercent" aria-valuemin="0" aria-valuemax="100">
                        <div class="meter-bar" [style.width.%]="v.goalPercent"></div>
                      </div>
                    </div>
                  }
                </div>
              </section>

              @if (v.suggestions.length > 0) {
                <section class="mb-3" aria-label="Javaslatok">
                  @for (item of v.suggestions; track item.text) {
                    <div class="suggestion mb-2" [class.suggestion-warning]="item.tone === 'warning'" [class.suggestion-success]="item.tone === 'success'">
                      <span class="flex-grow-1">{{ item.text }}</span>
                      @if (item.action) {
                        <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0" (click)="runSuggestion(item.action)">{{ item.actionLabel }}</button>
                      }
                    </div>
                  }
                </section>
              }

              <div class="row g-2 g-md-3 mb-3">
                <div class="col-6 col-md-3">
                  <div class="card border-0 shadow-sm h-100 kpi">
                    <div class="card-body p-3">
                      <div class="text-body-secondary small">Megtanult szavak</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ s.learnedCards }}<span class="kpi-of"> / {{ s.totalCards }}</span></div>
                      <div class="meter mt-2" role="progressbar" aria-label="Megtanult szavak aránya"
                        [attr.aria-valuenow]="v.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                        <div class="meter-bar" [style.width.%]="v.learnedPercent"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="card border-0 shadow-sm h-100 kpi">
                    <div class="card-body p-3">
                      <div class="text-body-secondary small">Pontosság, 30 nap</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ v.accuracy30 === null ? '—' : v.accuracy30 + '%' }}</div>
                      <div class="small mt-2">
                        @if (v.accuracyDelta !== null) {
                          <span [class.delta-up]="v.accuracyDelta > 0" [class.delta-down]="v.accuracyDelta < 0">
                            {{ v.accuracyDelta > 0 ? '▲ +' : v.accuracyDelta < 0 ? '▼ ' : '● ' }}{{ v.accuracyDelta }} pont
                          </span>
                          <span class="text-body-secondary"> az előző 30 naphoz képest</span>
                        } @else {
                          <span class="text-body-secondary">{{ s.retention.correctCount }} / {{ s.retention.answerCount }} helyes válasz</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="card border-0 shadow-sm h-100 kpi">
                    <div class="card-body p-3">
                      <div class="text-body-secondary small">Napi sorozat</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ s.studyDayStreak }}<span class="kpi-of"> nap</span></div>
                      <div class="text-body-secondary small mt-2">Leghosszabb: {{ s.longestStudyDayStreak }} nap</div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="card border-0 shadow-sm h-100 kpi">
                    <div class="card-body p-3">
                      <div class="text-body-secondary small">Tanulási idő, 7 nap</div>
                      <div class="fs-3 fw-semibold lh-1 mt-1">{{ formatTime(v.weekSeconds) }}</div>
                      <div class="text-body-secondary small mt-2">Összesen: {{ formatTime(s.totalStudySeconds) }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-next7">
                <div class="card-body p-3 p-md-4">
                  <h2 id="stats-next7" class="h6 fw-semibold mb-1">Következő 7 nap</h2>
                  <p class="text-body-secondary small mb-3">Ennyi kártya lesz esedékes naponta.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: v.forecast7, label: 'Esedékes kártyák a következő 7 napban', dense: false }" />
                </div>
              </section>

              <p class="text-body-secondary small mb-0">
                MI-hívások: {{ s.aiCallCount }} · Hibás válaszok összesen: {{ s.totalIncorrect }}
              </p>
            }

            <!-- ============================== HALADÁS ============================== -->
            @if (tab() === 'progress') {
              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-heat">
                <div class="card-body p-3 p-md-4">
                  <h2 id="stats-heat" class="h6 fw-semibold mb-1">Aktivitás, utolsó 13 hét</h2>
                  <p class="text-body-secondary small mb-3">{{ v.heat.summary }}</p>
                  <div class="heat-wrap" role="img" [attr.aria-label]="v.heat.summary">
                    <div class="heat-days" aria-hidden="true">
                      <span>H</span><span></span><span>Sze</span><span></span><span>P</span><span></span><span></span>
                    </div>
                    <div class="heat-scroll">
                      <div class="heat-grid" [style.grid-template-columns]="'repeat(' + v.heat.columns.length + ', minmax(0, 1fr))'">
                        @for (column of v.heat.columns; track $index) {
                          <div class="heat-col">
                            <div class="heat-month">{{ column.monthLabel }}</div>
                            @for (cell of column.cells; track $index) {
                              @if (cell) {
                                <div class="heat-cell" [attr.data-level]="cell.level" [attr.title]="cell.title"></div>
                              } @else {
                                <div class="heat-cell heat-empty"></div>
                              }
                            }
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 small">
                    <span class="text-body-secondary">
                      Aktív napok: <strong class="text-body">{{ v.heat.activeDays }}</strong>
                      · napi átlag tanulós napokon: <strong class="text-body">{{ v.heat.averagePerActiveDay }}</strong> válasz
                    </span>
                    <span class="heat-legend text-body-secondary" aria-hidden="true">
                      kevesebb
                      @for (level of [0, 1, 2, 3, 4]; track level) { <i class="heat-cell" [attr.data-level]="level"></i> }
                      több
                    </span>
                  </div>
                </div>
              </section>

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-trend">
                <div class="card-body p-3 p-md-4">
                  <h2 id="stats-trend" class="h6 fw-semibold mb-1">Heti pontosság</h2>
                  <p class="text-body-secondary small mb-3">A helyes válaszok aránya hetente. Az emelkedő vonal azt jelenti, hogy egyre jobban megjegyzed a szavakat.</p>
                  @if (v.trend.hasData) {
                    <svg class="trend" [attr.viewBox]="'0 0 ' + v.trend.width + ' ' + v.trend.height" role="img" [attr.aria-label]="v.trend.summary">
                      @for (tick of [0, 50, 100]; track tick) {
                        <line class="trend-grid"
                          [attr.x1]="v.trend.left" [attr.x2]="v.trend.width - v.trend.right"
                          [attr.y1]="trendY(tick, v)" [attr.y2]="trendY(tick, v)" />
                        <text class="trend-text" text-anchor="end" [attr.x]="v.trend.left - 6" [attr.y]="trendY(tick, v) + 4">{{ tick }}%</text>
                      }
                      @for (path of v.trend.paths; track $index) {
                        <path class="trend-line" [attr.d]="path" />
                      }
                      @for (point of v.trend.points; track $index) {
                        <circle class="trend-dot" r="4" [attr.cx]="point.x" [attr.cy]="point.y"><title>{{ point.title }}</title></circle>
                      }
                      @for (label of v.trend.xLabels; track $index) {
                        <text class="trend-text" text-anchor="middle" [attr.x]="label.x" [attr.y]="v.trend.height - 8">{{ label.text }}</text>
                      }
                    </svg>
                  } @else {
                    <p class="text-body-secondary mb-0">Még nincs elég adat. Pár tanulás után itt látod a fejlődésed.</p>
                  }
                </div>
              </section>

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-learned">
                <div class="card-body p-3 p-md-4">
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                    <h2 id="stats-learned" class="h6 fw-semibold mb-0">Újonnan megtanult szavak</h2>
                    <div class="btn-group btn-group-sm" role="group" aria-label="Időtartam">
                      <button type="button" class="btn btn-outline-secondary" [class.active]="learnedRange() === '14'" (click)="learnedRange.set('14')">14 nap</button>
                      <button type="button" class="btn btn-outline-secondary" [class.active]="learnedRange() === '30'" (click)="learnedRange.set('30')">30 nap</button>
                      <button type="button" class="btn btn-outline-secondary" [class.active]="learnedRange() === 'weeks'" (click)="learnedRange.set('weeks')">12 hét</button>
                    </div>
                  </div>
                  <p class="text-body-secondary small mb-3">Összesen {{ s.learnedCards }} megtanult szó. Egy szó akkor számít megtanultnak, ha háromszor egymás után jól válaszoltál rá.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: learnedBars(v), label: 'Újonnan megtanult szavak', dense: learnedRange() === '30' }" />
                </div>
              </section>

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-forecast">
                <div class="card-body p-3 p-md-4">
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                    <h2 id="stats-forecast" class="h6 fw-semibold mb-0">Esedékes kártyák előrejelzése</h2>
                    <div class="btn-group btn-group-sm" role="group" aria-label="Előrejelzés időtartama">
                      <button type="button" class="btn btn-outline-secondary" [class.active]="forecastRange() === 7" (click)="forecastRange.set(7)">7 nap</button>
                      <button type="button" class="btn btn-outline-secondary" [class.active]="forecastRange() === 30" (click)="forecastRange.set(30)">30 nap</button>
                    </div>
                  </div>
                  <p class="text-body-secondary small mb-3">A lejárt kártyák a mai napnál szerepelnek.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: forecastRange() === 7 ? v.forecast7 : v.forecast30, label: 'Esedékes kártyák előrejelzése', dense: forecastRange() === 30 }" />
                </div>
              </section>

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-maturity">
                <div class="card-body p-3 p-md-4">
                  <h2 id="stats-maturity" class="h6 fw-semibold mb-1">Tudásszintek</h2>
                  <p class="text-body-secondary small mb-3">Minél hosszabb az ismétlési köz, annál biztosabban tudod a szót. A sáv csak a már gyakorolt kártyákat mutatja.</p>
                  <div class="maturity-bar mb-3" role="img" [attr.aria-label]="maturitySummary(v)">
                    @for (segment of v.maturity; track segment.key) {
                      @if (segment.count > 0 && segment.key !== 'new') {
                        <div class="maturity-seg" [attr.data-kind]="segment.key" [style.flex-grow]="segment.count"
                          [attr.title]="segment.label + ': ' + segment.count"></div>
                      }
                    }
                  </div>
                  <ul class="list-unstyled row g-2 mb-0 small">
                    @for (segment of v.maturity; track segment.key) {
                      <li class="col-6 col-md-4 d-flex align-items-start gap-2">
                        <i class="maturity-dot mt-1" [attr.data-kind]="segment.key"></i>
                        <span>
                          <strong>{{ segment.label }}</strong>: {{ segment.count }}
                          <span class="text-body-secondary d-block">{{ segment.hint }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              </section>
            }

            <!-- ============================== SZAVAK ============================== -->
            @if (tab() === 'words') {
              @if (v.decks.length > 0) {
                <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-decks">
                  <div class="card-body p-3 p-md-4">
                    <h2 id="stats-decks" class="h6 fw-semibold mb-3">Paklik</h2>
                    @for (deck of v.decks; track deck.deckId) {
                      <div class="deck-row">
                        <div class="d-flex flex-wrap justify-content-between gap-2">
                          <span class="fw-semibold text-break">{{ deck.name }}</span>
                          <span class="small text-body-secondary">
                            {{ deck.learnedCards }} / {{ deck.totalCards }} megtanult
                            @if (deck.accuracy !== null) { · {{ deck.accuracy }}% helyes }
                            @if (deck.dueCards > 0) { · <span class="text-danger fw-semibold">{{ deck.dueCards }} esedékes</span> }
                          </span>
                        </div>
                        <div class="meter mt-1" role="progressbar" [attr.aria-label]="deck.name + ' megtanult szavai'"
                          [attr.aria-valuenow]="deck.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                          <div class="meter-bar" [style.width.%]="deck.learnedPercent"></div>
                        </div>
                      </div>
                    }
                  </div>
                </section>
              }

              @if (leechCards().length > 0) {
                <section class="card border-0 shadow-sm mb-3 leech-card" aria-labelledby="stats-leech">
                  <div class="card-body p-3 p-md-4">
                    <h2 id="stats-leech" class="h6 fw-semibold mb-1">Nehéz szavak</h2>
                    <p class="text-body-secondary small mb-3">Ezekre sokszor hibásan válaszoltál. Érdemes külön figyelmet szentelni nekik, például példamondatot írni hozzájuk.</p>
                    <ul class="list-unstyled mb-0">
                      @for (card of leechCards(); track card.term) {
                        <li class="d-flex justify-content-between gap-2 py-1 border-top">
                          <span class="text-break"><strong>{{ card.term }}</strong> <span class="text-body-secondary small">{{ card.deckName }}</span></span>
                          <span class="small text-nowrap">{{ card.incorrectCount }} hiba · {{ card.correctCount }} helyes</span>
                        </li>
                      }
                    </ul>
                    @if (v.chipCounts.leech > leechCards().length) {
                      <button type="button" class="btn btn-link btn-sm px-0 mt-2" (click)="showFilter('leech')">Mind a {{ v.chipCounts.leech }} nehéz szó</button>
                    }
                  </div>
                </section>
              }

              @if (s.confusions.length > 0) {
                <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-confusions">
                  <div class="card-body p-3 p-md-4">
                    <h2 id="stats-confusions" class="h6 fw-semibold mb-1">Összetévesztett szavak</h2>
                    <p class="text-body-secondary small mb-3">Amikor egy másik szót írtál be a kért helyett.</p>
                    <ul class="list-unstyled mb-0">
                      @for (item of s.confusions; track $index) {
                        <li class="d-flex justify-content-between gap-2 py-1 border-top">
                          <span class="text-break"><strong>{{ item.term }}</strong> <span class="text-body-secondary" aria-label="helyett">↔</span> {{ item.confusedWithTerm }}</span>
                          <span class="small text-nowrap">{{ item.count }}×</span>
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              }

              <section class="card border-0 shadow-sm mb-3" aria-labelledby="stats-words">
                <div class="card-body p-3 p-md-4">
                  <h2 id="stats-words" class="h6 fw-semibold mb-3">Összes szó</h2>
                  <div class="row g-2 mb-3">
                    <div class="col-12 col-md-7">
                      <input type="search" class="form-control" placeholder="Keresés szóra vagy paklira…" aria-label="Keresés a szavak között"
                        [value]="search()" (input)="setSearch($any($event.target).value)" />
                    </div>
                    <div class="col-12 col-md-5">
                      <select class="form-select" aria-label="Rendezés" [value]="sort()" (change)="setSort($any($event.target).value)">
                        <option value="error">Rendezés: hibaarány</option>
                        <option value="incorrect">Rendezés: hibák száma</option>
                        <option value="due">Rendezés: következő ismétlés</option>
                        <option value="alpha">Rendezés: ábécé</option>
                      </select>
                    </div>
                  </div>
                  <div class="chips mb-3" role="group" aria-label="Szűrés">
                    @for (chip of chips; track chip.id) {
                      <button type="button" class="chip" [class.is-active]="filter() === chip.id" [attr.aria-pressed]="filter() === chip.id"
                        (click)="showFilter(chip.id)">{{ chip.label }} <span class="chip-count">{{ v.chipCounts[chip.id] }}</span></button>
                    }
                  </div>

                  @if (shownCards().length === 0) {
                    <p class="text-body-secondary mb-0">Nincs a szűrésnek megfelelő szó.</p>
                  } @else {
                    <ul class="list-unstyled mb-0 word-list">
                      @for (card of shownCards(); track card.term + card.deckName) {
                        <li class="word-row">
                          <div class="d-flex justify-content-between align-items-start gap-2">
                            <div class="min-w-0">
                              <span class="fw-semibold text-break">{{ card.term }}</span>
                              @if (card.isLeech) { <span class="badge text-bg-danger ms-1">nehéz</span> }
                              @if (card.isLearned) { <span class="badge text-bg-success ms-1">megtanult</span> }
                              @if (card.isSuspended) { <span class="badge text-bg-secondary ms-1">szünetel</span> }
                              <div class="text-body-secondary small text-truncate">{{ card.deckName }}</div>
                            </div>
                            <div class="text-end small flex-shrink-0">
                              <div [class.text-danger]="card.isDue" [class.fw-semibold]="card.isDue">{{ card.nextText }}</div>
                              @if (card.interval > 0 && !card.isNew) { <div class="text-body-secondary">köz: {{ card.interval }} nap</div> }
                            </div>
                          </div>
                          @if (card.attempts > 0) {
                            <div class="d-flex align-items-center gap-2 mt-1 small">
                              <div class="word-ratio flex-grow-1" role="img"
                                [attr.aria-label]="card.correctCount + ' helyes, ' + card.incorrectCount + ' hibás válasz'">
                                <span class="word-ratio-ok" [style.flex-grow]="card.correctCount"></span>
                                <span class="word-ratio-bad" [style.flex-grow]="card.incorrectCount"></span>
                              </div>
                              <span class="text-body-secondary text-nowrap">{{ card.correctCount }} helyes · {{ card.incorrectCount }} hiba ({{ card.errorPercent }}%)</span>
                            </div>
                          } @else {
                            <div class="text-body-secondary small mt-1">Még nem válaszoltál rá.</div>
                          }
                        </li>
                      }
                    </ul>
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                      <span class="text-body-secondary small">{{ shownCards().length }} / {{ filteredCards().length }} szó látszik</span>
                      @if (shownCards().length < filteredCards().length) {
                        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="showMore()">Továbbiak</button>
                      }
                    </div>
                  }
                </div>
              </section>
            }
          }
        }
      </div>
    </main>

    <ng-template #barChart let-items="items" let-label="label" let-dense="dense">
      <div class="bar-chart" [class.bar-chart-dense]="dense" role="img" [attr.aria-label]="barSummary(label, items)">
        @for (bar of items; track $index) {
          <div class="bar-col" [attr.title]="bar.title">
            <div class="bar-plot">
              @if (bar.value > 0 && !dense) {
                <span class="bar-value" [style.bottom]="'calc(' + bar.height + '% + 2px)'">{{ bar.value }}</span>
              }
              <div class="bar" [class.bar-zero]="bar.value === 0" [style.height.%]="bar.height"></div>
            </div>
            <div class="bar-label">{{ bar.label }}</div>
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      .meter { height: 0.45rem; border-radius: 999px; background: var(--app-surface-2); overflow: hidden; }
      .meter-bar { height: 100%; border-radius: 999px; background: var(--app-primary); }
      .kpi-of { font-size: 1rem; font-weight: 500; color: var(--app-muted); }
      .delta-up { color: var(--app-success); font-weight: 600; }
      .delta-down { color: var(--app-danger); font-weight: 600; }
      .min-w-0 { min-width: 0; }
      @media (max-width: 767.98px) {
        .kpi .fs-3 { font-size: 1.35rem !important; }
      }

      .suggestion {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.9rem;
        border-radius: var(--app-radius);
        border: 1px solid color-mix(in srgb, var(--app-primary) 35%, transparent);
        background: color-mix(in srgb, var(--app-primary) 10%, var(--app-surface));
      }
      .suggestion-warning {
        border-color: color-mix(in srgb, var(--app-danger) 40%, transparent);
        background: color-mix(in srgb, var(--app-danger) 9%, var(--app-surface));
      }
      .suggestion-success {
        border-color: color-mix(in srgb, var(--app-success) 40%, transparent);
        background: color-mix(in srgb, var(--app-success) 10%, var(--app-surface));
      }

      /* Oszlopdiagram */
      .bar-chart { display: flex; align-items: flex-end; gap: 0.35rem; }
      .bar-chart-dense { gap: 0.15rem; }
      .bar-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; }
      .bar-plot { position: relative; width: 100%; height: 8rem; display: flex; align-items: flex-end; justify-content: center; }
      .bar {
        width: 100%;
        max-width: 2.25rem;
        min-height: 3px;
        background-color: var(--app-primary);
        border-radius: 0.2rem 0.2rem 0 0;
      }
      .bar-zero { background-color: var(--app-border); }
      .bar-value { position: absolute; left: 0; right: 0; text-align: center; font-size: 0.75rem; font-weight: 600; }
      .bar-label { margin-top: 0.35rem; min-height: 1.1em; font-size: 0.75rem; color: var(--app-muted); text-align: center; white-space: nowrap; }
      @media (max-width: 575.98px) {
        .bar-plot { height: 6.5rem; }
        .bar-label { font-size: 0.7rem; }
      }

      /* Aktivitási naptár */
      .heat-wrap { display: flex; gap: 0.5rem; }
      .heat-days {
        display: grid;
        grid-template-rows: 1rem repeat(7, 1.35rem);
        gap: 3px;
        font-size: 0.7rem;
        color: var(--app-muted);
      }
      .heat-days span { display: flex; align-items: center; }
      .heat-days::before { content: ''; }
      .heat-scroll { flex: 1 1 auto; min-width: 0; overflow-x: auto; }
      .heat-grid { display: grid; gap: 3px; }
      .heat-col { display: grid; grid-template-rows: 1rem repeat(7, 1.35rem); gap: 3px; }
      .heat-month { width: 0; font-size: 0.7rem; color: var(--app-muted); line-height: 1rem; white-space: nowrap; overflow: visible; }
      .heat-cell {
        display: inline-block;
        width: 100%;
        height: 1.35rem;
        border-radius: 3px;
        background: var(--app-surface-2);
        border: 1px solid var(--app-border);
      }
      .heat-empty { background: transparent; border-color: transparent; }
      .heat-cell[data-level='1'] { background: color-mix(in srgb, var(--app-primary) 25%, var(--app-surface)); border-color: transparent; }
      .heat-cell[data-level='2'] { background: color-mix(in srgb, var(--app-primary) 48%, var(--app-surface)); border-color: transparent; }
      .heat-cell[data-level='3'] { background: color-mix(in srgb, var(--app-primary) 72%, var(--app-surface)); border-color: transparent; }
      .heat-cell[data-level='4'] { background: var(--app-primary); border-color: transparent; }
      .heat-legend { display: inline-flex; align-items: center; gap: 3px; }
      .heat-legend .heat-cell { width: 0.9rem; height: 0.9rem; }

      /* Trend */
      .trend { width: 100%; height: auto; display: block; }
      .trend-grid { stroke: var(--app-border); stroke-width: 1; }
      .trend-text { fill: var(--app-muted); font-size: 11px; }
      @media (max-width: 575.98px) { .trend-text { font-size: 19px; } }
      .trend-line { fill: none; stroke: var(--app-primary); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
      .trend-dot { fill: var(--app-surface); stroke: var(--app-primary); stroke-width: 2.5; }

      /* Tudásszintek */
      .maturity-bar { display: flex; height: 1.1rem; border-radius: 999px; overflow: hidden; background: var(--app-surface-2); gap: 2px; }
      .maturity-seg, .maturity-dot { background: var(--app-border); }
      .maturity-dot { display: inline-block; flex: 0 0 auto; width: 0.8rem; height: 0.8rem; border-radius: 3px; }
      [data-kind='new'] { background: color-mix(in srgb, var(--app-muted) 45%, var(--app-surface)); }
      [data-kind='learning'] { background: var(--app-accent); }
      [data-kind='young'] { background: color-mix(in srgb, var(--app-primary) 55%, var(--app-surface)); }
      [data-kind='mature'] { background: var(--app-primary); }
      [data-kind='suspended'] { background: repeating-linear-gradient(135deg, var(--app-border), var(--app-border) 3px, var(--app-surface-2) 3px, var(--app-surface-2) 6px); }

      /* Paklik, szólista */
      .deck-row + .deck-row { margin-top: 0.9rem; }
      .leech-card { border-left: 4px solid var(--app-danger) !important; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip {
        border: 1px solid var(--app-border);
        background: var(--app-surface);
        color: var(--app-text);
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
        font-size: 0.85rem;
      }
      .chip.is-active { background: rgba(var(--app-primary-rgb), 0.13); border-color: var(--app-primary); color: var(--app-primary); font-weight: 600; }
      .chip-count { color: var(--app-muted); font-weight: 500; margin-left: 0.15rem; }
      .word-row { padding: 0.65rem 0; border-top: 1px solid var(--app-border); }
      .word-ratio { display: flex; height: 0.4rem; border-radius: 999px; overflow: hidden; background: var(--app-surface-2); min-width: 3rem; }
      .word-ratio-ok { background: var(--app-success); }
      .word-ratio-bad { background: var(--app-danger); }
    `,
  ],
})
export class StatsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly startStudy = output<void>();

  readonly tabs: { id: StatsTab; label: string }[] = [
    { id: 'overview', label: 'Áttekintés' },
    { id: 'progress', label: 'Haladás' },
    { id: 'words', label: 'Szavak' },
  ];
  readonly chips: { id: CardFilter; label: string }[] = [
    { id: 'all', label: 'Mind' },
    { id: 'wrong', label: 'Hibás' },
    { id: 'leech', label: 'Nehéz' },
    { id: 'new', label: 'Új' },
    { id: 'learning', label: 'Tanulás alatt' },
    { id: 'learned', label: 'Megtanult' },
  ];

  readonly stats = signal<StudyStats | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly tab = signal<StatsTab>(this.readStoredTab());
  readonly forecastRange = signal<7 | 30>(7);
  readonly learnedRange = signal<'14' | '30' | 'weeks'>('14');
  readonly search = signal('');
  readonly filter = signal<CardFilter>('all');
  readonly sort = signal<CardSort>('error');
  private readonly visibleCount = signal(PAGE_SIZE);

  readonly vm = computed(() => {
    const stats = this.stats();
    return stats ? buildStatsView(stats, new Date()) : null;
  });
  readonly filteredCards = computed(() => {
    const view = this.vm();
    return view ? filterAndSortCards(view.cards, this.search(), this.filter(), this.sort()) : [];
  });
  readonly shownCards = computed(() => this.filteredCards().slice(0, this.visibleCount()));
  readonly leechCards = computed(() => {
    const view = this.vm();
    return view
      ? filterAndSortCards(view.cards, '', 'leech', 'incorrect').slice(0, 5)
      : [];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.http.get<StudyStats>('/api/study/stats')
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: stats => this.stats.set(stats),
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(error.status === 404
            ? 'A statisztika betöltése sikertelen: a kért adat nem található.'
            : 'A statisztika betöltése sikertelen. Kérlek, próbáld újra.');
        },
      });
  }

  selectTab(tab: StatsTab): void {
    this.tab.set(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // A böngésző tárolója nem elérhető; a fül csak erre a megjelenésre érvényes.
    }
  }

  runSuggestion(action: 'study' | 'leech'): void {
    if (action === 'study') {
      this.startStudy.emit();
      return;
    }

    this.showFilter('leech');
    this.selectTab('words');
  }

  showFilter(filter: CardFilter): void {
    this.filter.set(filter);
    this.visibleCount.set(PAGE_SIZE);
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.visibleCount.set(PAGE_SIZE);
  }

  setSort(value: CardSort): void {
    this.sort.set(value);
    this.visibleCount.set(PAGE_SIZE);
  }

  showMore(): void {
    this.visibleCount.update(count => count + PAGE_SIZE);
  }

  formatTime(seconds: number): string {
    return formatStudyTime(seconds);
  }

  learnedBars(view: StatsView): BarItem[] {
    switch (this.learnedRange()) {
      case '30': return view.learned30;
      case 'weeks': return view.learnedWeeks;
      default: return view.learned14;
    }
  }

  trendY(percent: number, view: StatsView): number {
    const { top, height, bottom } = view.trend;
    return top + (1 - percent / 100) * (height - top - bottom);
  }

  barSummary(label: string, items: BarItem[]): string {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return `${label}: összesen ${total}`;
  }

  maturitySummary(view: StatsView): string {
    return 'Tudásszintek: ' + view.maturity.map(segment => `${segment.label} ${segment.count}`).join(', ');
  }

  private readStoredTab(): StatsTab {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);
      return stored === 'progress' || stored === 'words' ? stored : 'overview';
    } catch {
      return 'overview';
    }
  }
}
