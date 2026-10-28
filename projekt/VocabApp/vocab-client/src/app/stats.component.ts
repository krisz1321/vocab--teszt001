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
    <main>
      <div class="page-wrap">
        <header>
          <h1>Statisztika</h1>
          <p>Hol tartasz, és mit érdemes még gyakorolnod.</p>
        </header>

        @if (isLoading()) {
          <div role="status">
            <div></div>
            <p>Statisztika betöltése…</p>
          </div>
        }

        @if (errorMessage(); as message) {
          <div role="alert">
            <span>{{ message }}</span>
            <button type="button" (click)="load()">Újra</button>
          </div>
        }

        @if (stats(); as s) {
          @if (vm(); as v) {
            @if (s.totalCards === 0) {
              <div role="status">
                Még nincs kártyád. A Paklik menüben hozhatsz létre paklit vagy importálhatsz szavakat, a statisztika tanulás közben kezd kitöltődni.
              </div>
            }

            <div class="seg" role="tablist" aria-label="Statisztika nézetek">
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
              <section aria-labelledby="stats-today">
                <div>
                  <div>
                    <h2 id="stats-today">Mai nap</h2>
                    <button type="button" (click)="startStudy.emit()">Tanulás indítása</button>
                  </div>
                  <div>
                    <div>
                      <div>Válasz</div>
                      <div>{{ s.today.answerCount }}</div>
                      <div>
                        @if (v.todayAccuracy !== null) { {{ v.todayAccuracy }}% helyes } @else { még nincs }
                      </div>
                    </div>
                    <div>
                      <div>Tanulási idő</div>
                      <div>{{ formatTime(s.today.secondsStudied) }}</div>
                    </div>
                    <div>
                      <div>Esedékes</div>
                      <div>{{ s.dueCards }}</div>
                      <div>kártya</div>
                    </div>
                  </div>
                  @if (s.today.dailyNewCardGoal > 0) {
                    <div>
                      <div>
                        <span>Új kártyák a napi célból</span>
                        <span>{{ s.today.newCardsIntroduced }} / {{ s.today.dailyNewCardGoal }}</span>
                      </div>
                      <div class="meter" role="progressbar" aria-label="Napi új kártya cél"
                        [attr.aria-valuenow]="v.goalPercent" aria-valuemin="0" aria-valuemax="100">
                        <div class="meter-bar"></div>
                      </div>
                    </div>
                  }
                </div>
              </section>

              @if (v.suggestions.length > 0) {
                <section aria-label="Javaslatok">
                  @for (item of v.suggestions; track item.text) {
                    <div class="suggestion" [class.suggestion-warning]="item.tone === 'warning'" [class.suggestion-success]="item.tone === 'success'">
                      <span>{{ item.text }}</span>
                      @if (item.action) {
                        <button type="button" (click)="runSuggestion(item.action)">{{ item.actionLabel }}</button>
                      }
                    </div>
                  }
                </section>
              }

              <div>
                <div>
                  <div class="kpi">
                    <div>
                      <div>Megtanult szavak</div>
                      <div>{{ s.learnedCards }}<span class="kpi-of"> / {{ s.totalCards }}</span></div>
                      <div class="meter" role="progressbar" aria-label="Megtanult szavak aránya"
                        [attr.aria-valuenow]="v.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                        <div class="meter-bar"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div class="kpi">
                    <div>
                      <div>Pontosság, 30 nap</div>
                      <div>{{ v.accuracy30 === null ? '—' : v.accuracy30 + '%' }}</div>
                      <div>
                        @if (v.accuracyDelta !== null) {
                          <span [class.delta-up]="v.accuracyDelta > 0" [class.delta-down]="v.accuracyDelta < 0">
                            {{ v.accuracyDelta > 0 ? '▲ +' : v.accuracyDelta < 0 ? '▼ ' : '● ' }}{{ v.accuracyDelta }} pont
                          </span>
                          <span> az előző 30 naphoz képest</span>
                        } @else {
                          <span>{{ s.retention.correctCount }} / {{ s.retention.answerCount }} helyes válasz</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div class="kpi">
                    <div>
                      <div>Napi sorozat</div>
                      <div>{{ s.studyDayStreak }}<span class="kpi-of"> nap</span></div>
                      <div>Leghosszabb: {{ s.longestStudyDayStreak }} nap</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div class="kpi">
                    <div>
                      <div>Tanulási idő, 7 nap</div>
                      <div>{{ formatTime(v.weekSeconds) }}</div>
                      <div>Összesen: {{ formatTime(s.totalStudySeconds) }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <section aria-labelledby="stats-next7">
                <div>
                  <h2 id="stats-next7">Következő 7 nap</h2>
                  <p>Ennyi kártya lesz esedékes naponta.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: v.forecast7, label: 'Esedékes kártyák a következő 7 napban', dense: false }" />
                </div>
              </section>

              <p>
                MI-hívások: {{ s.aiCallCount }} · Hibás válaszok összesen: {{ s.totalIncorrect }}
              </p>
            }

            <!-- ============================== HALADÁS ============================== -->
            @if (tab() === 'progress') {
              <section aria-labelledby="stats-heat">
                <div>
                  <h2 id="stats-heat">Aktivitás, utolsó 13 hét</h2>
                  <p>{{ v.heat.summary }}</p>
                  <div class="heat-wrap" role="img" [attr.aria-label]="v.heat.summary">
                    <div class="heat-days" aria-hidden="true">
                      <span>H</span><span></span><span>Sze</span><span></span><span>P</span><span></span><span></span>
                    </div>
                    <div class="heat-scroll">
                      <div class="heat-grid">
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
                  <div>
                    <span>
                      Aktív napok: <strong>{{ v.heat.activeDays }}</strong>
                      · napi átlag tanulós napokon: <strong>{{ v.heat.averagePerActiveDay }}</strong> válasz
                    </span>
                    <span class="heat-legend" aria-hidden="true">
                      kevesebb
                      @for (level of [0, 1, 2, 3, 4]; track level) { <i class="heat-cell" [attr.data-level]="level"></i> }
                      több
                    </span>
                  </div>
                </div>
              </section>

              <section aria-labelledby="stats-trend">
                <div>
                  <h2 id="stats-trend">Heti pontosság</h2>
                  <p>A helyes válaszok aránya hetente. Ha emelkedik a vonal, egyre jobban megjegyzed a szavakat.</p>
                  @if (v.trend.hasData) {
                    <svg class="trend" [attr.viewBox]="'0 0 ' + v.trend.width + ' ' + v.trend.height" role="img" [attr.aria-label]="v.trend.summary">
                      @for (tick of [0, 50, 100]; track tick) {
                        <line class="trend-grid"
                          [attr.x1]="v.trend.left" [attr.x2]="v.trend.width - v.trend.right"
                          [attr.y1]="trendY(tick, v.trend)" [attr.y2]="trendY(tick, v.trend)" />
                        <text class="trend-text" text-anchor="end" [attr.x]="v.trend.left - 6" [attr.y]="trendY(tick, v.trend) + 4">{{ tick }}%</text>
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
                    <p>Még nincs elég adat. Pár tanulás után itt látod a fejlődésed.</p>
                  }
                </div>
              </section>

              <section aria-labelledby="stats-learned">
                <div>
                  <div>
                    <h2 id="stats-learned">Újonnan megtanult szavak</h2>
                    <div role="group" aria-label="Időtartam">
                      <button type="button" [class.active]="learnedRange() === '14'" (click)="learnedRange.set('14')">14 nap</button>
                      <button type="button" [class.active]="learnedRange() === '30'" (click)="learnedRange.set('30')">30 nap</button>
                      <button type="button" [class.active]="learnedRange() === 'weeks'" (click)="learnedRange.set('weeks')">12 hét</button>
                    </div>
                  </div>
                  <p>Összesen {{ s.learnedCards }} megtanult szó. Megtanult az a szó, amire háromszor egymás után jól válaszoltál.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: learnedBars(v), label: 'Újonnan megtanult szavak', dense: learnedRange() === '30' }" />
                </div>
              </section>

              <section aria-labelledby="stats-forecast">
                <div>
                  <div>
                    <h2 id="stats-forecast">Esedékes kártyák előrejelzése</h2>
                    <div role="group" aria-label="Előrejelzés időtartama">
                      <button type="button" [class.active]="forecastRange() === 7" (click)="forecastRange.set(7)">7 nap</button>
                      <button type="button" [class.active]="forecastRange() === 30" (click)="forecastRange.set(30)">30 nap</button>
                    </div>
                  </div>
                  <p>A lejárt kártyák a mai napnál szerepelnek.</p>
                  <ng-container *ngTemplateOutlet="barChart; context: { items: forecastRange() === 7 ? v.forecast7 : v.forecast30, label: 'Esedékes kártyák előrejelzése', dense: forecastRange() === 30 }" />
                </div>
              </section>

              <section aria-labelledby="stats-maturity">
                <div>
                  <h2 id="stats-maturity">Tudásszintek</h2>
                  <p>Minél hosszabb az ismétlési köz, annál biztosabban tudod a szót. Csak a már gyakorolt kártyák számítanak.</p>
                  <div class="maturity-bar" role="img" [attr.aria-label]="maturitySummary(v)">
                    @for (segment of v.maturity; track segment.key) {
                      @if (segment.count > 0 && segment.key !== 'new') {
                        <div class="maturity-seg" [attr.data-kind]="segment.key"
                          [attr.title]="segment.label + ': ' + segment.count"></div>
                      }
                    }
                  </div>
                  <ul>
                    @for (segment of v.maturity; track segment.key) {
                      <li>
                        <i class="maturity-dot" [attr.data-kind]="segment.key"></i>
                        <span>
                          <strong>{{ segment.label }}</strong>: {{ segment.count }}
                          <span>{{ segment.hint }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              </section>

              <section aria-labelledby="stats-practice">
                <div>
                  <h2 id="stats-practice">Nyelvtan és mondatok</h2>
                  <p>Az MI-vel ellenőrzött próbálkozásaid. Nem számítanak az ismétlésbe, a napi sorozatba és a tanulási időbe.</p>
                  @if (v.practice.hasPractice) {
                    <div>
                      <div>
                        <div>Nyelvtan</div>
                        <div>{{ v.practice.grammarPercent === null ? '—' : v.practice.grammarPercent + '%' }}</div>
                        <div>{{ s.practice.grammar.correctCount }} / {{ s.practice.grammar.attemptCount }} helyes</div>
                      </div>
                      <div>
                        <div>Mondatok</div>
                        <div>{{ v.practice.compositionPercent === null ? '—' : v.practice.compositionPercent + '%' }}</div>
                        <div>{{ s.practice.composition.correctCount }} / {{ s.practice.composition.attemptCount }} helyes</div>
                      </div>
                    </div>

                    @if (v.practice.weakestTense; as weakest) {
                      <div role="note">
                        Leggyengébb igeidő: <strong>{{ weakest.label }}</strong> ({{ weakest.correct }} / {{ weakest.attempts }}, {{ weakest.percent }}%).
                        Ezt érdemes gyakorolni a Nyelvtanban.
                      </div>
                    }

                    @if (v.practice.errorGroups.length > 0) {
                      <h3>Miben hibázol?</h3>
                      <p>A próbálkozások hány százalékában talált hibát az MI. A kézzel elfogadott válaszok nem számítanak.</p>
                      <div>
                        @for (group of v.practice.errorGroups; track group.title) {
                          <div>
                            <div>{{ group.title }}</div>
                            <ul>
                              @for (row of group.rows; track row.key) {
                                <li>
                                  <div>
                                    <span>{{ row.label }}</span>
                                    <span>{{ row.count }} / {{ row.total }} · {{ row.percent }}%</span>
                                  </div>
                                  <div class="meter" role="progressbar" [attr.aria-label]="group.title + ': hibás ' + row.label.toLowerCase()"
                                    [attr.aria-valuenow]="row.percent" aria-valuemin="0" aria-valuemax="100">
                                    <div class="meter-bar meter-bad"></div>
                                  </div>
                                </li>
                              }
                            </ul>
                          </div>
                        }
                      </div>
                    }

                    <h3>Heti pontosság</h3>
                    @if (v.practice.trend.hasData) {
                      <div aria-hidden="true">
                        @for (line of v.practice.trend.series; track line.key) {
                          <span><i class="trend-key" [attr.data-series]="line.key"></i>{{ line.label }}</span>
                        }
                      </div>
                      <svg class="trend" [attr.viewBox]="'0 0 ' + v.practice.trend.width + ' ' + v.practice.trend.height" role="img" [attr.aria-label]="v.practice.trend.summary">
                        @for (tick of [0, 50, 100]; track tick) {
                          <line class="trend-grid"
                            [attr.x1]="v.practice.trend.left" [attr.x2]="v.practice.trend.width - v.practice.trend.right"
                            [attr.y1]="trendY(tick, v.practice.trend)" [attr.y2]="trendY(tick, v.practice.trend)" />
                          <text class="trend-text" text-anchor="end" [attr.x]="v.practice.trend.left - 6" [attr.y]="trendY(tick, v.practice.trend) + 4">{{ tick }}%</text>
                        }
                        @for (line of v.practice.trend.series; track line.key) {
                          @for (path of line.paths; track $index) {
                            <path class="trend-line" [attr.data-series]="line.key" [attr.d]="path" />
                          }
                          @for (point of line.points; track $index) {
                            <circle class="trend-dot" [attr.data-series]="line.key" r="4" [attr.cx]="point.x" [attr.cy]="point.y"><title>{{ point.title }}</title></circle>
                          }
                        }
                        @for (label of v.practice.trend.xLabels; track $index) {
                          <text class="trend-text" text-anchor="middle" [attr.x]="label.x" [attr.y]="v.practice.trend.height - 8">{{ label.text }}</text>
                        }
                      </svg>
                    } @else {
                      <p>{{ v.practice.trend.summary }}</p>
                    }

                    @if (v.practice.tenses.length > 0) {
                      <h3>Igeidők</h3>
                      <ul>
                        @for (row of v.practice.tenses; track row.key) {
                          <li>
                            <div>
                              <span>{{ row.label }}</span>
                              <span>{{ row.correct }} / {{ row.attempts }} · {{ row.percent }}%</span>
                            </div>
                            <div class="meter" role="progressbar" [attr.aria-label]="row.label + ' helyes válaszai'"
                              [attr.aria-valuenow]="row.percent ?? 0" aria-valuemin="0" aria-valuemax="100">
                              <div class="meter-bar"></div>
                            </div>
                          </li>
                        }
                      </ul>
                    }

                    <p>
                      Mondatokban {{ s.practice.composition.correctWordCount }} / {{ s.practice.composition.wordCount }} szót használtál helyesen.
                    </p>
                  } @else {
                    <p>Még nem gyakoroltál nyelvtant vagy mondatokat. Az ellenőrzött próbálkozásaid itt jelennek meg.</p>
                  }
                </div>
              </section>
            }

            <!-- ============================== SZAVAK ============================== -->
            @if (tab() === 'words') {
              @if (v.decks.length > 0) {
                <section aria-labelledby="stats-decks">
                  <div>
                    <h2 id="stats-decks">Paklik</h2>
                    @for (deck of v.decks; track deck.deckId) {
                      <div class="deck-row">
                        <div>
                          <span>{{ deck.name }}</span>
                          <span>
                            {{ deck.learnedCards }} / {{ deck.totalCards }} megtanult
                            @if (deck.accuracy !== null) { · {{ deck.accuracy }}% helyes }
                            @if (deck.dueCards > 0) { · <span>{{ deck.dueCards }} esedékes</span> }
                          </span>
                        </div>
                        <div class="meter" role="progressbar" [attr.aria-label]="deck.name + ' megtanult szavai'"
                          [attr.aria-valuenow]="deck.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                          <div class="meter-bar"></div>
                        </div>
                      </div>
                    }
                  </div>
                </section>
              }

              @if (leechCards().length > 0) {
                <section class="leech-card" aria-labelledby="stats-leech">
                  <div>
                    <h2 id="stats-leech">Nehéz szavak</h2>
                    <p>Ezekre sokszor hibásan válaszoltál. Érdemes külön gyakorolni őket, például példamondatot írni hozzájuk.</p>
                    <ul>
                      @for (card of leechCards(); track card.term) {
                        <li>
                          <span><strong>{{ card.term }}</strong> <span>{{ card.deckName }}</span></span>
                          <span>{{ card.incorrectCount }} hiba · {{ card.correctCount }} helyes</span>
                        </li>
                      }
                    </ul>
                    @if (v.chipCounts.leech > leechCards().length) {
                      <button type="button" (click)="showFilter('leech')">Mind a {{ v.chipCounts.leech }} nehéz szó</button>
                    }
                  </div>
                </section>
              }

              @if (s.practice.problemWords.length > 0) {
                <section aria-labelledby="stats-practice-words">
                  <div>
                    <h2 id="stats-practice-words">Mondatban elrontott szavak</h2>
                    <p>Ezeket a szavakat használtad rosszul a Nyelvtanban és a Mondatokban. Egy szó lehet megtanult, mondatban mégis nehéz.</p>
                    <ul>
                      @for (word of s.practice.problemWords; track $index) {
                        <li>
                          <span><strong>{{ word.term }}</strong> <span>{{ word.deckName }}</span></span>
                          <span>{{ word.errorCount }} hiba · {{ word.useCount - word.errorCount }} helyes</span>
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              }

              @if (s.confusions.length > 0) {
                <section aria-labelledby="stats-confusions">
                  <div>
                    <h2 id="stats-confusions">Összetévesztett szavak</h2>
                    <p>Amikor egy másik szót írtál be a kért helyett.</p>
                    <ul>
                      @for (item of s.confusions; track $index) {
                        <li>
                          <span><strong>{{ item.term }}</strong> <span aria-label="helyett">↔</span> {{ item.confusedWithTerm }}</span>
                          <span>{{ item.count }}×</span>
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              }

              <section aria-labelledby="stats-words">
                <div>
                  <h2 id="stats-words">Összes szó</h2>
                  <div>
                    <div>
                      <input type="search" placeholder="Keresés szóra vagy paklira…" aria-label="Keresés a szavak között"
                        [value]="search()" (input)="setSearch($any($event.target).value)" />
                    </div>
                    <div>
                      <select aria-label="Rendezés" [value]="sort()" (change)="setSort($any($event.target).value)">
                        <option value="error">Rendezés: hibaarány</option>
                        <option value="incorrect">Rendezés: hibák száma</option>
                        <option value="due">Rendezés: következő ismétlés</option>
                        <option value="alpha">Rendezés: ábécé</option>
                      </select>
                    </div>
                  </div>
                  <div class="chips" role="group" aria-label="Szűrés">
                    @for (chip of chips; track chip.id) {
                      <button type="button" class="chip" [class.is-active]="filter() === chip.id" [attr.aria-pressed]="filter() === chip.id"
                        (click)="showFilter(chip.id)">{{ chip.label }} <span class="chip-count">{{ v.chipCounts[chip.id] }}</span></button>
                    }
                  </div>

                  @if (shownCards().length === 0) {
                    <p>Nincs a szűrésnek megfelelő szó.</p>
                  } @else {
                    <ul class="word-list">
                      @for (card of shownCards(); track card.term + card.deckName) {
                        <li class="word-row">
                          <div>
                            <div class="min-w-0">
                              <span>{{ card.term }}</span>
                              @if (card.isLeech) { <span>nehéz</span> }
                              @if (card.isLearned) { <span>megtanult</span> }
                              @if (card.isSuspended) { <span>szünetel</span> }
                              <div>{{ card.deckName }}</div>
                            </div>
                            <div>
                              <div>{{ card.nextText }}</div>
                              @if (card.interval > 0 && !card.isNew) { <div>köz: {{ card.interval }} nap</div> }
                            </div>
                          </div>
                          @if (card.attempts > 0) {
                            <div>
                              <div class="word-ratio" role="img"
                                [attr.aria-label]="card.correctCount + ' helyes, ' + card.incorrectCount + ' hibás válasz'">
                                <span class="word-ratio-ok"></span>
                                <span class="word-ratio-bad"></span>
                              </div>
                              <span>{{ card.correctCount }} helyes · {{ card.incorrectCount }} hiba ({{ card.errorPercent }}%)</span>
                            </div>
                          } @else {
                            <div>Még nem válaszoltál rá.</div>
                          }
                        </li>
                      }
                    </ul>
                    <div>
                      <span>{{ shownCards().length }} / {{ filteredCards().length }} szó látszik</span>
                      @if (shownCards().length < filteredCards().length) {
                        <button type="button" (click)="showMore()">Továbbiak</button>
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
                <span class="bar-value">{{ bar.value }}</span>
              }
              <div class="bar" [class.bar-zero]="bar.value === 0"></div>
            </div>
            <div class="bar-label">{{ bar.label }}</div>
          </div>
        }
      </div>
    </ng-template>
  `,
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
          // A szerver magyar ProblemDetails-címe pontosabb, mint a státuszkódból kikövetkeztetett szöveg.
          const title = (error.error as { title?: unknown } | null)?.title;
          if (typeof title === 'string' && title.trim()) {
            this.errorMessage.set(`A statisztika betöltése sikertelen. ${title.trim()}`);
            return;
          }

          this.errorMessage.set(error.status === 404
            ? 'A statisztika betöltése sikertelen: a kért adat nem található.'
            : 'A statisztika betöltése sikertelen. Próbáld újra.');
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

  trendY(percent: number, frame: { top: number; height: number; bottom: number }): number {
    const { top, height, bottom } = frame;
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
