import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { IconComponent } from './icon.component';
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
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-wide">
      <header class="page-head">
        <div class="ph-text">
          <h1 class="h1">Statisztika</h1>
          <p class="lead">Hol tartasz, és mit érdemes még gyakorolnod.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="startStudy.emit()"><app-icon name="play" /> Tanulás most</button>
      </header>

      @if (isLoading()) {
        <div class="loading" role="status">
          <div class="spinner"></div>
          <p>Statisztika betöltése…</p>
        </div>
      }

      @if (errorMessage(); as message) {
        <div class="notice notice-bad" role="alert">
          <app-icon name="warn" />
          <div>
            <span>{{ message }}</span>
            <span><button type="button" class="btn btn-sm" (click)="load()">Újra</button></span>
          </div>
        </div>
      }

      @if (stats(); as s) {
        @if (vm(); as v) {
          @if (s.totalCards === 0) {
            <div class="notice notice-info" role="status">
              <app-icon name="info" />
              <div>Még nincs kártyád. A Paklik menüben hozhatsz létre paklit vagy importálhatsz szavakat, a statisztika tanulás közben kezd kitöltődni.</div>
            </div>
          }

          <div class="tabs" role="tablist" aria-label="Statisztika nézetek">
            @for (item of tabs; track item.id) {
              <button
                type="button"
                role="tab"
                [class.is-on]="tab() === item.id"
                [attr.aria-selected]="tab() === item.id"
                (click)="selectTab(item.id)">{{ item.label }}</button>
            }
          </div>

          <!-- ============================== ÁTTEKINTÉS ============================== -->
          @if (tab() === 'overview') {
            <section class="panel today-panel" aria-labelledby="stats-today">
              <div class="chart-head">
                <h2 class="h2" id="stats-today">Mai nap</h2>
                <span>{{ s.dueCards }} esedékes kártya</span>
              </div>
              <div class="today">
                <span class="today-item"><strong>{{ s.today.answerCount }}</strong> válasz</span>
                <span class="today-item">
                  @if (v.todayAccuracy !== null) { <strong>{{ v.todayAccuracy }}%</strong> helyes } @else { még nincs helyes arány }
                </span>
                <span class="today-item"><app-icon name="clock" /><strong>{{ formatTime(s.today.secondsStudied) }}</strong></span>
                <span class="today-item"><i class="dot dot-due"></i><strong [class.due-text]="s.dueCards > 0">{{ s.dueCards }}</strong> esedékes</span>
              </div>
              @if (s.today.dailyNewCardGoal > 0) {
                <div class="meter-row">
                  <div class="label-row">
                    <span class="label">Új kártyák a napi célból</span>
                    <span class="tnum">{{ s.today.newCardsIntroduced }} / {{ s.today.dailyNewCardGoal }}</span>
                  </div>
                  <div class="progress" role="progressbar" aria-label="Napi új kártya cél"
                    [attr.aria-valuenow]="v.goalPercent" aria-valuemin="0" aria-valuemax="100">
                    <i [style.width.%]="v.goalPercent"></i>
                  </div>
                </div>
              }
            </section>

            @if (v.suggestions.length > 0) {
              <section class="stack" aria-label="Javaslatok">
                @for (item of v.suggestions; track item.text) {
                  <div class="note" [class.note-warn]="item.tone === 'warning'" [class.note-ok]="item.tone === 'success'">
                    <app-icon [name]="item.tone === 'warning' ? 'warn' : item.tone === 'success' ? 'check' : 'bulb'" />
                    <div>{{ item.text }}</div>
                    @if (item.action) {
                      <button type="button" class="btn btn-sm" (click)="runSuggestion(item.action)">{{ item.actionLabel }}</button>
                    }
                  </div>
                }
              </section>
            }

            <div class="kpis">
              <div class="panel kpi">
                <span class="k-label">Megtanult szavak</span>
                <span class="k-val">{{ s.learnedCards }}<span class="kpi-of"> / {{ s.totalCards }}</span></span>
                <div class="progress" role="progressbar" aria-label="Megtanult szavak aránya"
                  [attr.aria-valuenow]="v.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                  <i [style.width.%]="v.learnedPercent"></i>
                </div>
              </div>
              <div class="panel kpi">
                <span class="k-label">Pontosság, 30 nap</span>
                <span class="k-val">{{ v.accuracy30 === null ? '—' : v.accuracy30 + '%' }}</span>
                <span class="k-sub">
                  @if (v.accuracyDelta !== null) {
                    <span [class.delta-up]="v.accuracyDelta > 0" [class.delta-down]="v.accuracyDelta < 0">
                      {{ v.accuracyDelta > 0 ? '▲ +' : v.accuracyDelta < 0 ? '▼ ' : '● ' }}{{ v.accuracyDelta }} pont
                    </span>
                    <span> az előző 30 naphoz képest</span>
                  } @else {
                    <span>{{ s.retention.correctCount }} / {{ s.retention.answerCount }} helyes válasz</span>
                  }
                </span>
              </div>
              <div class="panel kpi">
                <span class="k-label">Napi sorozat</span>
                <span class="k-val">{{ s.studyDayStreak }}<span class="kpi-of"> nap</span></span>
                <span class="k-sub">Leghosszabb: {{ s.longestStudyDayStreak }} nap</span>
              </div>
              <div class="panel kpi">
                <span class="k-label">Tanulási idő, 7 nap</span>
                <span class="k-val">{{ formatTime(v.weekSeconds) }}</span>
                <span class="k-sub">Összesen: {{ formatTime(s.totalStudySeconds) }}</span>
              </div>
            </div>

            <section class="panel" aria-labelledby="stats-next7">
              <div class="chart-head">
                <h2 class="h2" id="stats-next7">Következő 7 nap</h2>
                <span>Ennyi kártya lesz esedékes naponta.</span>
              </div>
              <ng-container *ngTemplateOutlet="barChart; context: { items: v.forecast7, label: 'Esedékes kártyák a következő 7 napban', dense: false }" />
            </section>

            <p class="help">
              MI-hívások: {{ s.aiCallCount }} · Hibás válaszok összesen: {{ s.totalIncorrect }}
            </p>
          }

          <!-- ============================== HALADÁS ============================== -->
          @if (tab() === 'progress') {
            <div class="stats-grid">
              <section class="panel" aria-labelledby="stats-heat">
                <div class="chart-head">
                  <h2 class="h2" id="stats-heat">Aktivitás, utolsó 13 hét</h2>
                  <span>{{ v.heat.activeDays }} tanulónap</span>
                </div>
                <div class="heat-scroll" role="img" [attr.aria-label]="v.heat.summary">
                  <div class="heat-grid" [style.grid-template-columns]="'auto repeat(' + v.heat.columns.length + ', minmax(0, 1fr))'">
                    <div class="heat-days" aria-hidden="true">
                      <span></span><span>H</span><span></span><span>Sze</span><span></span><span>P</span><span></span><span></span>
                    </div>
                    @for (column of v.heat.columns; track $index) {
                      <div class="heat-col">
                        <div class="heat-month">{{ column.monthLabel }}</div>
                        @for (cell of column.cells; track $index) {
                          @if (cell) {
                            <div class="heat-cell" [attr.data-level]="cell.level" [attr.data-tip]="cell.title" [attr.aria-label]="cell.title"></div>
                          } @else {
                            <div class="heat-cell heat-empty"></div>
                          }
                        }
                      </div>
                    }
                  </div>
                </div>
                <div class="heat-foot">
                  <span class="help">
                    Napi átlag tanulós napokon: <strong>{{ v.heat.averagePerActiveDay }}</strong> válasz
                  </span>
                  <span class="heat-legend" aria-hidden="true">
                    Kevesebb
                    @for (level of [0, 1, 2, 3, 4]; track level) { <i class="heat-cell" [attr.data-level]="level"></i> }
                    Több
                  </span>
                </div>
              </section>

              <section class="panel" aria-labelledby="stats-trend">
                <div class="chart-head">
                  <h2 class="h2" id="stats-trend">Heti pontosság</h2>
                  <span>helyes válaszok aránya</span>
                </div>
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
                  <p class="help">Ha emelkedik a vonal, egyre jobban megjegyzed a szavakat.</p>
                } @else {
                  <p class="muted">Még nincs elég adat. Pár tanulás után itt látod a fejlődésed.</p>
                }
              </section>

              <section class="panel" aria-labelledby="stats-learned">
                <div class="chart-head">
                  <h2 class="h2" id="stats-learned">Újonnan megtanult szavak</h2>
                  <div class="seg seg-sm" role="group" aria-label="Időtartam">
                    <button type="button" [class.is-on]="learnedRange() === '14'" [attr.aria-pressed]="learnedRange() === '14'" (click)="learnedRange.set('14')">14 nap</button>
                    <button type="button" [class.is-on]="learnedRange() === '30'" [attr.aria-pressed]="learnedRange() === '30'" (click)="learnedRange.set('30')">30 nap</button>
                    <button type="button" [class.is-on]="learnedRange() === 'weeks'" [attr.aria-pressed]="learnedRange() === 'weeks'" (click)="learnedRange.set('weeks')">12 hét</button>
                  </div>
                </div>
                <ng-container *ngTemplateOutlet="barChart; context: { items: learnedBars(v), label: 'Újonnan megtanult szavak', dense: learnedRange() === '30' }" />
                <p class="help">Összesen {{ s.learnedCards }} megtanult szó. Megtanult az a szó, amire háromszor egymás után jól válaszoltál.</p>
              </section>

              <section class="panel" aria-labelledby="stats-forecast">
                <div class="chart-head">
                  <h2 class="h2" id="stats-forecast">Esedékes kártyák előrejelzése</h2>
                  <div class="seg seg-sm" role="group" aria-label="Előrejelzés időtartama">
                    <button type="button" [class.is-on]="forecastRange() === 7" [attr.aria-pressed]="forecastRange() === 7" (click)="forecastRange.set(7)">7 nap</button>
                    <button type="button" [class.is-on]="forecastRange() === 30" [attr.aria-pressed]="forecastRange() === 30" (click)="forecastRange.set(30)">30 nap</button>
                  </div>
                </div>
                <ng-container *ngTemplateOutlet="barChart; context: { items: forecastRange() === 7 ? v.forecast7 : v.forecast30, label: 'Esedékes kártyák előrejelzése', dense: forecastRange() === 30 }" />
                <p class="help">A lejárt kártyák a mai napnál szerepelnek.</p>
              </section>

              <section class="panel" aria-labelledby="stats-maturity">
                <div class="chart-head">
                  <h2 class="h2" id="stats-maturity">Tudásszintek</h2>
                </div>
                <div class="maturity" role="img" [attr.aria-label]="maturitySummary(v)">
                  @for (segment of v.maturity; track segment.key) {
                    @if (segment.count > 0 && segment.key !== 'new') {
                      <span class="maturity-seg" [attr.data-kind]="segment.key" [style.flex-grow]="segment.count"
                        [attr.data-tip]="segment.label + ': ' + segment.count"></span>
                    }
                  }
                </div>
                <ul class="legend">
                  @for (segment of v.maturity; track segment.key) {
                    <li>
                      <i class="maturity-dot" [attr.data-kind]="segment.key"></i>
                      <span><strong>{{ segment.label }}</strong> {{ segment.count }} <span class="help">· {{ segment.hint }}</span></span>
                    </li>
                  }
                </ul>
                <p class="help">Minél hosszabb az ismétlési köz, annál biztosabban tudod a szót. A sávban csak a már gyakorolt kártyák szerepelnek.</p>
              </section>
            </div>

            <section class="panel practice-panel" aria-labelledby="stats-practice">
              <div class="chart-head">
                <h2 class="h2" id="stats-practice">Nyelvtan és mondatok</h2>
                <span>nem számít az ismétlésbe, a sorozatba és a tanulási időbe</span>
              </div>
              @if (v.practice.hasPractice) {
                <div class="kpis kpis-2">
                  <div class="panel kpi">
                    <span class="k-label">Nyelvtan</span>
                    <span class="k-val">{{ v.practice.grammarPercent === null ? '—' : v.practice.grammarPercent + '%' }}</span>
                    <span class="k-sub">{{ s.practice.grammar.correctCount }} / {{ s.practice.grammar.attemptCount }} helyes</span>
                  </div>
                  <div class="panel kpi">
                    <span class="k-label">Mondatok</span>
                    <span class="k-val">{{ v.practice.compositionPercent === null ? '—' : v.practice.compositionPercent + '%' }}</span>
                    <span class="k-sub">{{ s.practice.composition.correctCount }} / {{ s.practice.composition.attemptCount }} helyes</span>
                  </div>
                </div>

                @if (v.practice.weakestTense; as weakest) {
                  <div class="notice" role="note">
                    <app-icon name="warn" />
                    <div>
                      <span>Leggyengébb igeidő: <strong>{{ weakest.label }}</strong> ({{ weakest.correct }} / {{ weakest.attempts }}, {{ weakest.percent }}%). Ezt érdemes gyakorolni a Nyelvtanban.</span>
                    </div>
                  </div>
                }

                <div class="stats-grid practice-grid">
                  <div class="practice-main">
                    @if (v.practice.tenses.length > 0) {
                      <div>
                        <p class="sub-h">Pontosság igeidőnként</p>
                        <div class="hbars">
                          @for (row of v.practice.tenses; track row.key) {
                            <div class="hbar">
                              <span>
                                {{ row.label }}
                                @if (v.practice.weakestTense?.key === row.key) {
                                  <br><span class="weak-tag"><app-icon name="warn" /> Leggyengébb</span>
                                }
                              </span>
                              <span class="track" role="progressbar" [attr.aria-label]="row.label + ' helyes válaszai'"
                                [attr.aria-valuenow]="row.percent ?? 0" aria-valuemin="0" aria-valuemax="100">
                                <i [class.weak]="v.practice.weakestTense?.key === row.key" [style.width.%]="row.percent ?? 0"></i>
                              </span>
                              <span class="val" [attr.title]="row.correct + ' / ' + row.attempts">{{ row.percent }}%</span>
                            </div>
                          }
                        </div>
                      </div>
                    }

                    <p class="sub-h">Heti pontosság</p>
                    @if (v.practice.trend.hasData) {
                      <div class="legend" aria-hidden="true">
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
                      <p class="muted">{{ v.practice.trend.summary }}</p>
                    }
                  </div>

                  @if (v.practice.errorGroups.length > 0) {
                    <div>
                      <p class="sub-h">Miben hibázol?</p>
                      @for (group of v.practice.errorGroups; track group.title) {
                        <p class="help group-title">{{ group.title }}</p>
                        <div class="hbars">
                          @for (row of group.rows; track row.key) {
                            <div class="hbar">
                              <span>{{ row.label }}</span>
                              <span class="track" role="progressbar" [attr.aria-label]="group.title + ': hibás ' + row.label.toLowerCase()"
                                [attr.aria-valuenow]="row.percent" aria-valuemin="0" aria-valuemax="100">
                                <i class="bad" [style.width.%]="row.percent"></i>
                              </span>
                              <span class="val" [attr.title]="row.count + ' / ' + row.total">{{ row.percent }}%</span>
                            </div>
                          }
                        </div>
                      }
                      <p class="help">A próbálkozások hány százalékában talált hibát az MI. A kézzel elfogadott válaszok nem számítanak.</p>
                    </div>
                  }
                </div>

                <p class="help">
                  Mondatokban {{ s.practice.composition.correctWordCount }} / {{ s.practice.composition.wordCount }} szót használtál helyesen.
                </p>
              } @else {
                <p class="muted">Még nem gyakoroltál nyelvtant vagy mondatokat. Az ellenőrzött próbálkozásaid itt jelennek meg.</p>
              }
            </section>
          }

          <!-- ============================== SZAVAK ============================== -->
          @if (tab() === 'words') {
            <div class="stats-grid">
              @if (v.decks.length > 0) {
                <section class="panel" aria-labelledby="stats-decks">
                  <div class="chart-head">
                    <h2 class="h2" id="stats-decks">Paklik</h2>
                    <span>{{ v.decks.length }} pakli</span>
                  </div>
                  <div class="lrows">
                    @for (deck of v.decks; track deck.deckId) {
                      <div class="deck-stat">
                        <div class="label-row">
                          <span class="term-cell">{{ deck.name }}</span>
                          <span class="help">
                            {{ deck.learnedCards }} / {{ deck.totalCards }} megtanult
                            @if (deck.accuracy !== null) { · {{ deck.accuracy }}% helyes }
                            @if (deck.dueCards > 0) { · <span class="due-text">{{ deck.dueCards }} esedékes</span> }
                          </span>
                        </div>
                        <div class="progress" role="progressbar" [attr.aria-label]="deck.name + ' megtanult szavai'"
                          [attr.aria-valuenow]="deck.learnedPercent" aria-valuemin="0" aria-valuemax="100">
                          <i [style.width.%]="deck.learnedPercent"></i>
                        </div>
                      </div>
                    }
                  </div>
                </section>
              }

              @if (leechCards().length > 0) {
                <section class="panel" aria-labelledby="stats-leech">
                  <div class="chart-head">
                    <h2 class="h2" id="stats-leech">Nehéz szavak</h2>
                    <span>{{ v.chipCounts.leech }} szó</span>
                  </div>
                  <div class="lrows">
                    @for (card of leechCards(); track card.term) {
                      <div class="lrow">
                        <span class="term-cell">{{ card.term }}</span>
                        <span class="sub">{{ card.deckName }}</span>
                        <span class="val">{{ card.incorrectCount }} hiba · {{ card.correctCount }} helyes</span>
                      </div>
                    }
                  </div>
                  <p class="help">Ezekre sokszor hibásan válaszoltál. Érdemes külön gyakorolni őket, például példamondatot írni hozzájuk.</p>
                  @if (v.chipCounts.leech > leechCards().length) {
                    <div><button type="button" class="btn btn-sm" (click)="showFilter('leech')">Mind a {{ v.chipCounts.leech }} nehéz szó</button></div>
                  }
                </section>
              }

              @if (s.practice.problemWords.length > 0) {
                <section class="panel" aria-labelledby="stats-practice-words">
                  <div class="chart-head">
                    <h2 class="h2" id="stats-practice-words">Mondatban elrontott szavak</h2>
                  </div>
                  <div class="lrows">
                    @for (word of s.practice.problemWords; track $index) {
                      <div class="lrow">
                        <span class="term-cell">{{ word.term }}</span>
                        <span class="sub">{{ word.deckName }}</span>
                        <span class="val">{{ word.errorCount }} hiba · {{ word.useCount - word.errorCount }} helyes</span>
                      </div>
                    }
                  </div>
                  <p class="help">Ezeket a szavakat használtad rosszul a Nyelvtanban és a Mondatokban. Egy szó lehet megtanult, mondatban mégis nehéz.</p>
                </section>
              }

              @if (s.confusions.length > 0) {
                <section class="panel" aria-labelledby="stats-confusions">
                  <div class="chart-head">
                    <h2 class="h2" id="stats-confusions">Összetévesztett szavak</h2>
                  </div>
                  <div class="lrows">
                    @for (item of s.confusions; track $index) {
                      <div class="lrow">
                        <span class="term-cell">{{ item.term }}</span>
                        <span class="sub">helyett ezt írtad: {{ item.confusedWithTerm }}</span>
                        <span class="val">{{ item.count }}×</span>
                      </div>
                    }
                  </div>
                  <p class="help">Amikor egy másik szót írtál be a kért helyett.</p>
                </section>
              }
            </div>

            <section class="panel words-panel" aria-labelledby="stats-words">
              <div class="chart-head">
                <h2 class="h2" id="stats-words">Összes szó</h2>
              </div>
              <div class="filter-row">
                <div class="search-mini">
                  <app-icon name="search" />
                  <input type="search" placeholder="Keresés szóra vagy paklira…" aria-label="Keresés a szavak között"
                    [value]="search()" (input)="setSearch($any($event.target).value)" />
                </div>
                <select class="sort-select" aria-label="Rendezés" [value]="sort()" (change)="setSort($any($event.target).value)">
                  <option value="error">Rendezés: hibaarány</option>
                  <option value="incorrect">Rendezés: hibák száma</option>
                  <option value="due">Rendezés: következő ismétlés</option>
                  <option value="alpha">Rendezés: ábécé</option>
                </select>
              </div>
              <div class="chips" role="group" aria-label="Szűrés">
                @for (chip of chips; track chip.id) {
                  <button type="button" class="chip" [class.is-on]="filter() === chip.id" [attr.aria-pressed]="filter() === chip.id"
                    (click)="showFilter(chip.id)">{{ chip.label }} <span class="count">{{ v.chipCounts[chip.id] }}</span></button>
                }
              </div>

              @if (shownCards().length === 0) {
                <p class="muted">Nincs a szűrésnek megfelelő szó.</p>
              } @else {
                <ul class="word-list">
                  @for (card of shownCards(); track card.term + card.deckName) {
                    <li class="word-row">
                      <div class="word-main">
                        <span class="term-cell">{{ card.term }}</span>
                        @if (card.isLeech) { <span class="badge b-leech">nehéz</span> }
                        @if (card.isLearned) { <span class="badge b-learned">megtanult</span> }
                        @if (card.isSuspended) { <span class="badge b-paused">szünetel</span> }
                        <span class="help word-deck">{{ card.deckName }}</span>
                      </div>
                      <div class="word-next">
                        <span [class.due-text]="card.isDue">{{ card.nextText }}</span>
                        @if (card.interval > 0 && !card.isNew) { <span class="help">köz: {{ card.interval }} nap</span> }
                      </div>
                      @if (card.attempts > 0) {
                        <div class="word-ratio-wrap">
                          <div class="word-ratio" role="img"
                            [attr.aria-label]="card.correctCount + ' helyes, ' + card.incorrectCount + ' hibás válasz'">
                            <span class="word-ratio-ok" [style.flex-grow]="card.correctCount"></span>
                            <span class="word-ratio-bad" [style.flex-grow]="card.incorrectCount"></span>
                          </div>
                          <span class="help">{{ card.correctCount }} helyes · {{ card.incorrectCount }} hiba ({{ card.errorPercent }}%)</span>
                        </div>
                      } @else {
                        <div class="word-ratio-wrap help">Még nem válaszoltál rá.</div>
                      }
                    </li>
                  }
                </ul>
                <div class="table-foot">
                  <span>{{ shownCards().length }} / {{ filteredCards().length }} szó látszik</span>
                  @if (shownCards().length < filteredCards().length) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="showMore()">Továbbiak betöltése</button>
                  }
                </div>
              }
            </section>
          }
        }
      }
    </div>

    <ng-template #barChart let-items="items" let-label="label" let-dense="dense">
      <div class="bar-chart" [class.bar-chart-dense]="dense" role="img" [attr.aria-label]="barSummary(label, items)">
        @for (bar of items; track $index) {
          <div class="bar-col" [attr.data-tip]="bar.title">
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
