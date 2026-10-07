import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';

interface SharedInfo {
  version: number;
  sharedAt: string;
  updatedAt: string;
  saveCount: number;
  isActive: boolean;
  hasUnpublishedChanges: boolean;
}

interface Deck {
  id: number;
  name: string;
  description: string | null;
  cardCount: number;
  learnedCount: number;
  dueCount: number;
  isPublic: boolean;
  exampleLevel: string | null;
  share: SharedInfo | null;
  sourceSharedDeckId: number | null;
  sourceVersion: number | null;
  latestSharedVersion: number | null;
  updateAvailable: boolean;
}

interface PublicDeck {
  id: number;
  name: string;
  description: string | null;
  cardCount: number;
  ownerUsername: string;
  exampleLevel: string | null;
  levelIsAutomatic: boolean;
  version: number;
  sharedAt: string;
  updatedAt: string;
  saveCount: number;
  alreadySaved: boolean;
}

type PublicSort = 'name' | 'saves' | 'sharedAt' | 'updatedAt' | 'cards' | 'version';

interface VocabCard {
  id: number;
  deckId: number;
  term: string;
  definition: string;
  example: string | null;
  targetMeanings: string | null;
  tags: string | null;
  isLearned: boolean;
  markedKnown: boolean;
  suspension: CardSuspension;
  isLeech: boolean;
}

interface CardSearchResult {
  id: number;
  deckId: number;
  deckName: string;
  term: string;
  definition: string;
  targetMeanings: string | null;
  tags: string | null;
  isLearned: boolean;
  suspension: CardSuspension;
  isLeech: boolean;
}

interface LearnedCard {
  id: number;
  term: string;
  definition: string;
  example: string | null;
  targetMeanings: string | null;
  deckName: string;
  learnedAt: string;
  firstReviewedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewDate: string;
  streak: number;
  interval: number;
  easeFactor: number;
  correctCount: number;
  incorrectCount: number;
  markedKnown: boolean;
}

interface ProblemDetails {
  title?: string;
}

interface ImportResult {
  importedCount: number;
  skippedCount: number;
  skippedRows: string[];
}

interface PasteRow {
  term: string;
  definition: string;
  example: string;
  targetMeanings: string;
  aiError: string | null;
  meaningSimplified: boolean;
}

interface DeckFillResponse {
  items: { index: number; definition: string | null; example: string | null; targetMeanings: string | null; error: string | null }[];
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
}

interface AiFillSettings {
  exampleLevel: string;
  aiFillBatchSize: number;
  aiFillDailyLimit: number;
  aiFillRemainingToday: number;
}

type TermSeparator = 'tab' | 'comma' | 'custom';
type RowSeparator = 'newline' | 'semicolon' | 'custom';

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  action: () => void;
}

type Section = 'mine' | 'public';
type DetailTab = 'cards' | 'settings';
type CardFilter = 'all' | 'open' | 'learned' | 'suspended' | 'leech';
type CardSuspension = 'none' | 'suspended' | 'buried';

@Component({
  selector: 'app-decks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="container py-4 py-md-5">
      <div class="mx-auto page-wrap decks-page">
        <header class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
          <div>
            <h1 class="display-6 fw-semibold mb-1">Paklik</h1>
            <p class="text-body-secondary mb-0">Hozz létre, szerkessz és oszd meg a szókártya-paklijaidat.</p>
          </div>
          <div class="dseg" role="tablist" aria-label="Paklik">
            <button type="button" role="tab" class="dseg-btn" [class.active]="section === 'mine'" [attr.aria-selected]="section === 'mine'" (click)="setSection('mine')">
              Saját paklik <span class="dseg-count">{{ decks.length }}</span>
            </button>
            <button type="button" role="tab" class="dseg-btn" [class.active]="section === 'public'" [attr.aria-selected]="section === 'public'" (click)="setSection('public')">
              Közös paklik <span class="dseg-count">{{ publicDecks.length }}</span>
            </button>
          </div>
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger d-flex justify-content-between align-items-start gap-2" role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" class="btn-close" aria-label="Bezárás" (click)="errorMessage = null"></button>
          </div>
        }

        @if (section === 'mine') {
          <div class="deck-layout" [class.show-detail]="mobileDetailOpen">
            <aside class="deck-list-panel" aria-label="Paklijaim">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h2 class="panel-title mb-0">Paklijaim</h2>
                <button type="button" class="btn btn-primary btn-sm" (click)="toggleCreate()" [attr.aria-expanded]="creating">
                  {{ creating ? 'Mégse' : '+ Új pakli' }}
                </button>
              </div>

              @if (decks.length > 0) {
                <input
                  class="form-control form-control-sm mb-2"
                  type="search"
                  name="globalSearch"
                  placeholder="Keresés minden pakliban…"
                  aria-label="Keresés minden pakliban"
                  autocomplete="off"
                  [(ngModel)]="globalQuery"
                  (ngModelChange)="onGlobalSearchChange()">
                @if (globalActive) {
                  @if (isGlobalSearching && globalResults.length === 0) {
                    <div class="text-center py-3" role="status"><div class="spinner-border spinner-border-sm text-primary"></div></div>
                  } @else if (globalResults.length === 0) {
                    <p class="text-body-secondary small mb-2">Nincs találat.</p>
                  } @else {
                    <ul class="deck-list global-results mb-2" aria-label="Keresési találatok">
                      @for (result of globalResults; track result.id) {
                        <li>
                          <button type="button" class="deck-item" (click)="openSearchResult(result)">
                            <span class="d-flex justify-content-between align-items-start gap-2">
                              <span class="deck-name text-break">{{ result.term }}</span>
                              <span class="chip" [attr.title]="'Pakli: ' + result.deckName">{{ result.deckName }}</span>
                            </span>
                            <span class="deck-meta text-break">{{ result.definition }}</span>
                            @if (result.isLeech || result.suspension !== 'none' || result.tags) {
                              <span class="d-flex flex-wrap gap-1 mt-1">
                                @if (result.isLeech) {
                                  <span class="chip chip-leech ms-0">Nehéz szó</span>
                                }
                                @if (result.suspension === 'suspended') {
                                  <span class="chip chip-paused ms-0">Felfüggesztve</span>
                                } @else if (result.suspension === 'buried') {
                                  <span class="chip chip-paused ms-0">Elnapolva holnapig</span>
                                }
                                @for (tag of tagList(result.tags); track tag) {
                                  <span class="chip">{{ tag }}</span>
                                }
                              </span>
                            }
                          </button>
                        </li>
                      }
                    </ul>
                  }
                }
              }

              @if (creating) {
                <form class="create-box" (ngSubmit)="createDeck()">
                  <label class="form-label small mb-1" for="deckName">A pakli neve</label>
                  <input
                    id="deckName"
                    name="deckName"
                    class="form-control"
                    maxlength="100"
                    placeholder="pl. Utazás, Munka, B2 igék"
                    autocomplete="off"
                    [(ngModel)]="newDeckName"
                    [disabled]="isSavingDeck">
                  <label class="form-label small mb-1 mt-2" for="deckDescription">Leírás (nem kötelező)</label>
                  <textarea
                    id="deckDescription"
                    name="deckDescription"
                    class="form-control"
                    rows="2"
                    maxlength="500"
                    placeholder="Miről szól a pakli? Mások ebben is kereshetnek."
                    [(ngModel)]="newDeckDescription"
                    [disabled]="isSavingDeck"></textarea>
                  <label class="form-label small mb-1 mt-2" for="deckLevel">Mondatszint</label>
                  <select
                    id="deckLevel"
                    name="deckLevel"
                    class="form-select"
                    [(ngModel)]="newDeckLevel"
                    [disabled]="isSavingDeck">
                    @for (level of exampleLevels; track level) {
                      <option [value]="level">{{ level }}{{ level === accountLevel ? ' (fiók szintje)' : '' }}</option>
                    }
                  </select>
                  <div class="form-text">Az MI ilyen nehézségű definíciókat és példamondatokat készít ehhez a paklihoz. Később a pakli beállításaiban módosítható.</div>
                  <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-primary btn-sm" [disabled]="isSavingDeck || !newDeckName.trim()">
                      @if (isSavingDeck) {
                        <span class="spinner-border spinner-border-sm me-1"></span>
                      }
                      Létrehozás
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="toggleCreate()">Mégse</button>
                  </div>
                </form>
              }

              @if (isLoadingDecks) {
                <div class="text-center py-4" role="status">
                  <div class="spinner-border text-primary"></div>
                </div>
              } @else {
                @if (decks.length === 0) {
                  <div class="empty-box">
                    <p class="fw-semibold mb-1">Még nincs paklid</p>
                    <p class="text-body-secondary small mb-3">Hozz létre egy újat, vagy másolj le egy kész paklit a közösből.</p>
                    <div class="d-flex flex-wrap gap-2">
                      <button type="button" class="btn btn-primary btn-sm" (click)="creating = true">+ Új pakli</button>
                      <button type="button" class="btn btn-outline-primary btn-sm" (click)="setSection('public')">Kész paklik böngészése</button>
                    </div>
                  </div>
                }
                <ul class="deck-list" [hidden]="globalActive">
                  @for (deck of decks; track deck.id) {
                    <li>
                      <button
                        type="button"
                        class="deck-item"
                        [class.active]="!viewingLearned && selectedDeckId === deck.id"
                        [attr.aria-current]="!viewingLearned && selectedDeckId === deck.id ? 'true' : null"
                        (click)="selectDeck(deck.id, true)">
                        <span class="d-flex justify-content-between align-items-start gap-2">
                          <span class="deck-name text-break">{{ deck.name }}</span>
                          <span class="d-flex flex-wrap justify-content-end gap-1">
                            @if (deck.isPublic && deck.share; as share) {
                              <span class="chip chip-shared" title="Ez a pakli megosztva van">Megosztva · v{{ share.version }}</span>
                              @if (share.hasUnpublishedChanges) {
                                <span class="chip chip-pending" title="A pakli a legutóbbi megosztás óta módosult. Frissítsd a megosztást a Beállítások és megosztás fülön.">Frissítésre vár</span>
                              }
                            }
                            @if (deck.updateAvailable) {
                              <span class="chip chip-pending" [attr.title]="'A készítő újabb verziót tett közzé (v' + deck.latestSharedVersion + ')'">Új verzió: v{{ deck.latestSharedVersion }}</span>
                            }
                          </span>
                        </span>
                        <span class="deck-meta">
                          {{ deck.cardCount }} kártya
                          @if (deck.dueCount > 0) {
                            · <span class="due">{{ deck.dueCount }} esedékes</span>
                          }
                        </span>
                        <span class="mini-progress" aria-hidden="true"><span [style.width.%]="learnedPercent(deck)"></span></span>
                      </button>
                    </li>
                  }
                  <li>
                    <button
                      type="button"
                      class="deck-item deck-item-special"
                      [class.active]="viewingLearned"
                      [attr.aria-current]="viewingLearned ? 'true' : null"
                      (click)="selectLearned(true)">
                      <span class="deck-name">Megtanult szavak</span>
                      <span class="deck-meta">{{ learnedTotal }} kártya az összes paklidból</span>
                    </button>
                  </li>
                </ul>
              }
            </aside>

            <section class="deck-detail-panel" aria-live="polite">
              @if (importMessage) {
                <div class="alert alert-dismissible mb-3" [class.alert-success]="importSkipped.length === 0" [class.alert-warning]="importSkipped.length > 0" role="status">
                  <div>{{ importMessage }}</div>
                  @if (importSkipped.length > 0) {
                    <ul class="mb-0 mt-2 small">
                      @for (line of importSkipped; track $index) {
                        <li>{{ line }}</li>
                      }
                    </ul>
                  }
                  <button type="button" class="btn-close" aria-label="Bezárás" (click)="importMessage = null; importSkipped = []"></button>
                </div>
              }

              @if (viewingLearned) {
                <button type="button" class="back-link d-lg-none" (click)="closeDetail()">← Vissza a paklikhoz</button>
                <div class="detail-head">
                  <h2 class="h4 mb-1">Megtanult szavak</h2>
                  <div class="text-body-secondary small">Az összes paklidból azok a kártyák, amelyeket már megtanultál.</div>
                </div>
                <div class="toolbar">
                  <input
                    class="form-control"
                    type="search"
                    name="learnedSearch"
                    placeholder="Keresés a megtanult szavak között…"
                    aria-label="Keresés a megtanult szavak között"
                    [(ngModel)]="learnedSearch">
                  <div class="dseg dseg-sm" role="group" aria-label="Nézet">
                    <button type="button" class="dseg-btn" [class.active]="learnedDetailed" (click)="learnedDetailed = true">Részletes</button>
                    <button type="button" class="dseg-btn" [class.active]="!learnedDetailed" (click)="learnedDetailed = false">Rövid</button>
                  </div>
                </div>
                @if (isLoadingCards) {
                  <div class="text-center py-4" role="status"><div class="spinner-border text-primary"></div></div>
                } @else if (learnedCards.length === 0) {
                  <div class="empty-box">
                    <p class="fw-semibold mb-1">Még nincs megtanult szavad</p>
                    <p class="text-body-secondary small mb-0">Egy kártya akkor kerül ide, ha tanulás közben elég sokszor jól válaszoltál rá, vagy a paklidban „Ismerem”-nek jelölted.</p>
                  </div>
                } @else if (visibleLearned.length === 0) {
                  <div class="empty-box"><p class="mb-0">Nincs a keresésnek megfelelő szó.</p></div>
                } @else {
                  <ul class="card-rows">
                    @for (card of visibleLearned; track card.id) {
                      <li class="card-row">
                        <div class="card-main text-break">
                          <div class="card-term">{{ card.term }}</div>
                          @if (learnedDetailed) {
                            <div class="card-def">{{ card.definition }}</div>
                            @if (card.targetMeanings) {
                              <div class="card-tm">{{ card.targetMeanings }}</div>
                            }
                            @if (card.example) {
                              <div class="card-ex">„{{ card.example }}”</div>
                            }
                            <div class="meta-grid">
                              <span>Pakli: <strong>{{ card.deckName }}</strong></span>
                              <span>Megtanulva: {{ formatLocalTime(card.learnedAt) }}</span>
                              <span>Következő ismétlés: {{ formatLocalTime(card.nextReviewDate) }}</span>
                              <span>Helyes: {{ card.correctCount }} · Hibás: {{ card.incorrectCount }}</span>
                              <span>Sorozat: {{ card.streak }} · Időköz: {{ card.interval }} nap</span>
                              @if (card.markedKnown) {
                                <span>Ismertnek jelölve</span>
                              }
                            </div>
                          }
                        </div>
                        <div class="card-actions">
                          <button
                            type="button"
                            class="btn btn-outline-secondary btn-sm"
                            title="Visszateszi a kártyát a tanulandók közé"
                            [disabled]="resettingLearnedCardId === card.id"
                            (click)="resetLearned(card)">
                            Mégse tudom
                          </button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              } @else {
              @if (selectedDeck; as deck) {
                <button type="button" class="back-link d-lg-none" (click)="closeDetail()">← Vissza a paklikhoz</button>
                <div class="detail-head">
                  <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div class="min-w-0">
                      <h2 class="h4 text-break mb-1">{{ deck.name }}</h2>
                      @if (deck.description) {
                        <p class="deck-description text-break mb-1">{{ deck.description }}</p>
                      }
                      <div class="text-body-secondary small d-flex flex-wrap align-items-center gap-2">
                        <span>{{ deck.cardCount }} kártya</span>
                        <span>· {{ deck.learnedCount }} megtanult</span>
                        <span>· {{ deck.dueCount }} esedékes</span>
                        @if (deck.isPublic && deck.share; as share) {
                          <span class="chip chip-shared">Megosztva · v{{ share.version }} · {{ deck.exampleLevel ?? accountLevel }}</span>
                          @if (share.hasUnpublishedChanges) {
                            <span class="chip chip-pending">Frissítésre vár</span>
                          }
                        }
                        @if (deck.updateAvailable) {
                          <span class="chip chip-pending">Új verzió: v{{ deck.latestSharedVersion }}</span>
                        }
                      </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="btn btn-primary"
                        [disabled]="deck.cardCount === 0"
                        [attr.title]="deck.cardCount === 0 ? 'Előbb vegyél fel kártyát' : 'Tanulás ezzel a paklival'"
                        (click)="studyDeck.emit(deck.id)">
                        Tanulás
                      </button>
                      <button type="button" class="btn btn-outline-primary" (click)="openNewCard()">+ Új kártya</button>
                    </div>
                  </div>
                  <div class="tabs" role="tablist">
                    <button type="button" role="tab" class="dtab-btn" [class.active]="detailTab === 'cards'" [attr.aria-selected]="detailTab === 'cards'" (click)="detailTab = 'cards'">
                      Kártyák <span class="dseg-count">{{ cards.length }}</span>
                    </button>
                    <button type="button" role="tab" class="dtab-btn" [class.active]="detailTab === 'settings'" [attr.aria-selected]="detailTab === 'settings'" (click)="openSettings()">
                      Beállítások és megosztás
                    </button>
                  </div>
                </div>

                @if (detailTab === 'cards') {
                  @if (cardEditorOpen) {
                    <form class="editor" (ngSubmit)="saveCard()" aria-label="Kártya szerkesztő">
                      <div class="d-flex justify-content-between align-items-center mb-3">
                        <h3 class="h6 mb-0">{{ editingCardId === null ? 'Új kártya' : 'Kártya szerkesztése' }}</h3>
                        <button type="button" class="btn-close" aria-label="Szerkesztő bezárása" (click)="closeEditor()"></button>
                      </div>
                      <div class="row g-3">
                        <div class="col-12 col-md-5">
                          <label class="form-label" for="card-term">Szó vagy kifejezés</label>
                          <input
                            id="card-term"
                            name="term"
                            class="form-control"
                            maxlength="100"
                            autocomplete="off"
                            placeholder="pl. serendipity"
                            [(ngModel)]="term"
                            [disabled]="isSavingCard">
                        </div>
                        <div class="col-12 col-md-7 d-flex align-items-end">
                          <button
                            type="button"
                            class="btn btn-outline-primary w-100 w-md-auto"
                            (click)="autoFill()"
                            [disabled]="!term.trim() || isSavingCard || isBusyAi"
                            title="Az MI kitölti az angol definíciót és a magyar jelentést, ha még üresek">
                            @if (isAutoFilling) {
                              <span class="spinner-border spinner-border-sm me-1"></span>
                            }
                            Kitöltés MI-vel
                          </button>
                        </div>
                        <div class="col-12">
                          <div class="d-flex justify-content-between align-items-end">
                            <label class="form-label mb-1" for="card-definition">Angol definíció</label>
                            <button type="button" class="btn btn-link btn-sm p-0" (click)="generateDefinition()" [disabled]="isBusyAi || isSavingCard || !term.trim()">
                              @if (isGeneratingDefinition) {
                                <span class="spinner-border spinner-border-sm me-1"></span>
                              }
                              Generálás
                            </button>
                          </div>
                          <textarea
                            id="card-definition"
                            name="definition"
                            class="form-control"
                            rows="2"
                            maxlength="500"
                            [(ngModel)]="definition"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard || isGeneratingDefinition"></textarea>
                        </div>
                        <div class="col-12 col-md-6">
                          <div class="d-flex justify-content-between align-items-end">
                            <label class="form-label mb-1" for="card-meanings">Magyar jelentés</label>
                            <button type="button" class="btn btn-link btn-sm p-0" (click)="generateTargetMeaning()" [disabled]="isBusyAi || isSavingCard || !term.trim() || !definition.trim()">
                              @if (isGeneratingTargetMeaning) {
                                <span class="spinner-border spinner-border-sm me-1"></span>
                              }
                              Generálás
                            </button>
                          </div>
                          <textarea
                            id="card-meanings"
                            name="targetMeanings"
                            class="form-control"
                            rows="2"
                            maxlength="300"
                            placeholder="étel, kaja"
                            [(ngModel)]="targetMeanings"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard || isGeneratingTargetMeaning"></textarea>
                          <div class="form-text">Több elfogadott alak vesszővel elválasztva.</div>
                        </div>
                        <div class="col-12 col-md-6">
                          <label class="form-label mb-1" for="card-example">Példamondat (nem kötelező)</label>
                          <textarea
                            id="card-example"
                            name="example"
                            class="form-control"
                            rows="2"
                            maxlength="500"
                            [(ngModel)]="example"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard"></textarea>
                        </div>
                        <div class="col-12">
                          <label class="form-label mb-1" for="card-tags">Címkék (nem kötelező)</label>
                          <input
                            id="card-tags"
                            name="tags"
                            class="form-control"
                            maxlength="150"
                            autocomplete="off"
                            placeholder="ige, b2, utazás"
                            [(ngModel)]="tags"
                            [disabled]="isSavingCard">
                          <div class="form-text">Legfeljebb {{ maxTags }} címke, vesszővel elválasztva, egyenként legfeljebb {{ maxTagLength }} karakter.</div>
                        </div>
                      </div>
                      @if (cardError) {
                        <div class="alert alert-danger py-2 mt-3 mb-0" role="alert">{{ cardError }}</div>
                      }
                      <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                        <button type="submit" class="btn btn-primary" [disabled]="isSavingCard || isBusyAi">
                          @if (isSavingCard) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          {{ editingCardId === null ? 'Kártya felvétele' : 'Mentés' }}
                        </button>
                        <button type="button" class="btn btn-outline-secondary" [disabled]="isSavingCard" (click)="closeEditor()">
                          {{ editingCardId === null ? 'Kész' : 'Mégse' }}
                        </button>
                        <span class="text-body-secondary small ms-auto d-none d-md-inline">Ctrl + Enter: mentés</span>
                      </div>
                    </form>
                  }

                  @if (isLoadingCards) {
                    <div class="text-center py-4" role="status"><div class="spinner-border text-primary"></div></div>
                  } @else if (cards.length === 0) {
                    <div class="empty-box">
                      <p class="fw-semibold mb-1">Ebben a pakliban még nincs kártya</p>
                      <p class="text-body-secondary small mb-3">Vegyél fel kártyákat kézzel, tölts fel egy CSV-t, vagy másolj le egy kész paklit.</p>
                      <div class="d-flex flex-wrap gap-2">
                        <button type="button" class="btn btn-primary btn-sm" (click)="openNewCard()">+ Első kártya felvétele</button>
                        <button type="button" class="btn btn-outline-primary btn-sm" (click)="openSettings()">CSV importálása</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="setSection('public')">Kész paklik böngészése</button>
                      </div>
                    </div>
                  } @else {
                    <div class="toolbar">
                      <input
                        class="form-control"
                        type="search"
                        name="cardSearch"
                        placeholder="Keresés a kártyák között…"
                        aria-label="Keresés a kártyák között"
                        [(ngModel)]="cardSearch">
                      <div class="dseg dseg-sm" role="group" aria-label="Szűrés">
                        <button type="button" class="dseg-btn" [class.active]="cardFilter === 'all'" (click)="cardFilter = 'all'">Mind</button>
                        <button type="button" class="dseg-btn" [class.active]="cardFilter === 'open'" (click)="cardFilter = 'open'">Tanulandó</button>
                        <button type="button" class="dseg-btn" [class.active]="cardFilter === 'learned'" (click)="cardFilter = 'learned'">Megtanult</button>
                        <button type="button" class="dseg-btn" [class.active]="cardFilter === 'suspended'" (click)="cardFilter = 'suspended'">Szüneteltetett</button>
                        <button type="button" class="dseg-btn" [class.active]="cardFilter === 'leech'" (click)="cardFilter = 'leech'">Nehéz</button>
                      </div>
                      @if (deckTags.length > 0) {
                        <select class="form-select tag-select" name="tagFilter" aria-label="Szűrés címkére" [(ngModel)]="tagFilter">
                          <option value="">Minden címke</option>
                          @for (tag of deckTags; track tag) {
                            <option [value]="tag">{{ tag }}</option>
                          }
                        </select>
                      }
                    </div>
                    @if (cardSearch.trim() || cardFilter !== 'all' || activeTagFilter) {
                      <div class="text-body-secondary small mb-2">{{ visibleCards.length }} / {{ cards.length }} kártya</div>
                    }
                    @if (visibleCards.length === 0) {
                      <div class="empty-box"><p class="mb-0">Nincs a szűrésnek megfelelő kártya.</p></div>
                    } @else {
                      <ul class="card-rows">
                        @for (card of visibleCards; track card.id) {
                          <li class="card-row" [class.is-editing]="editingCardId === card.id">
                            <div class="card-main text-break">
                              <div class="card-term">
                                {{ card.term }}
                                @if (card.isLearned) {
                                  <span class="chip chip-ok">Megtanult</span>
                                }
                                @if (card.isLeech) {
                                  <span class="chip chip-leech" title="Sokszor elrontott szó. A küszöböt a Profil haladó beállításaiban állíthatod.">Nehéz szó</span>
                                }
                                @if (card.suspension === 'suspended') {
                                  <span class="chip chip-paused">Felfüggesztve</span>
                                } @else if (card.suspension === 'buried') {
                                  <span class="chip chip-paused">Elnapolva holnapig</span>
                                }
                              </div>
                              <div class="card-def">{{ card.definition }}</div>
                              @if (card.targetMeanings) {
                                <div class="card-tm">{{ card.targetMeanings }}</div>
                              }
                              @if (card.example) {
                                <div class="card-ex">„{{ card.example }}”</div>
                              }
                              @if (card.tags) {
                                <div class="card-tags">
                                  @for (tag of tagList(card.tags); track tag) {
                                    <button type="button" class="chip chip-tag" [class.active]="tagFilter === tag" (click)="tagFilter = tagFilter === tag ? '' : tag" [attr.title]="'Szűrés erre a címkére: ' + tag">{{ tag }}</button>
                                  }
                                </div>
                              }
                            </div>
                            <div class="card-actions">
                              <div class="form-check form-switch mb-0" [attr.title]="card.isLearned ? 'Megtanult szó. Kikapcsolva újra a tanulandó kártyák közé kerül.' : 'Jelöld meg, ha már ismered, és nem akarod tanulni'">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  role="switch"
                                  [id]="'known-' + card.id"
                                  [checked]="card.isLearned"
                                  [disabled]="markingKnownCardId === card.id"
                                  (change)="setKnown(card, $event)">
                                <label class="form-check-label small" [attr.for]="'known-' + card.id">Ismerem</label>
                              </div>
                              @if (card.suspension === 'none') {
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'buried')"
                                  [attr.aria-label]="'Elnapolás holnapig: ' + card.term"
                                  title="Elnapolás holnapig">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                                </button>
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'suspended')"
                                  [attr.aria-label]="'Felfüggesztés: ' + card.term"
                                  title="Felfüggesztés, amíg vissza nem kapcsolod">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>
                                </button>
                              } @else {
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'none')"
                                  [attr.aria-label]="'Visszakapcsolás a tanulásba: ' + card.term"
                                  title="Visszakapcsolás a tanulásba">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4l13 8-13 8Z"/></svg>
                                </button>
                              }
                              <button type="button" class="icon-btn" (click)="editCard(card)" [attr.aria-label]="'Szerkesztés: ' + card.term" title="Szerkesztés">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              </button>
                              <button
                                type="button"
                                class="icon-btn icon-btn-danger"
                                [disabled]="deletingCardId === card.id"
                                (click)="deleteCard(card)"
                                [attr.aria-label]="'Törlés: ' + card.term"
                                title="Törlés">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                              </button>
                            </div>
                          </li>
                        }
                      </ul>
                    }
                  }
                } @else {
                  <div class="settings">
                    <section class="setting-block">
                      <h3 class="h6">Pakli neve</h3>
                      <form class="d-flex flex-wrap gap-2" (ngSubmit)="renameDeck(deck)">
                        <input
                          id="rename-deck"
                          name="renameDraft"
                          class="form-control flex-grow-1"
                          style="min-width: 12rem; width: auto;"
                          maxlength="100"
                          autocomplete="off"
                          aria-label="Pakli neve"
                          [(ngModel)]="renameDraft"
                          [disabled]="isRenaming">
                        <button type="submit" class="btn btn-primary" [disabled]="isRenaming || !renameDraft.trim() || renameDraft.trim() === deck.name">
                          @if (isRenaming) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          Átnevezés
                        </button>
                      </form>
                    </section>

                    <section class="setting-block">
                      <h3 class="h6">Leírás</h3>
                      <p class="text-body-secondary small mb-2">Rövid leírás a paklihoz. Megosztáskor a közös paklik között is látszik, és a keresés is figyelembe veszi.</p>
                      <form class="d-flex flex-column gap-2" (ngSubmit)="saveDescription(deck)">
                        <textarea
                          id="deck-description"
                          name="descriptionDraft"
                          class="form-control"
                          rows="3"
                          maxlength="500"
                          aria-label="Pakli leírása"
                          [(ngModel)]="descriptionDraft"
                          [disabled]="isSavingDescription"></textarea>
                        <div class="d-flex align-items-center gap-2">
                          <button type="submit" class="btn btn-primary" [disabled]="isSavingDescription || descriptionDraft.trim() === (deck.description ?? '')">
                            @if (isSavingDescription) {
                              <span class="spinner-border spinner-border-sm me-1"></span>
                            }
                            Leírás mentése
                          </button>
                          <span class="text-body-secondary small">{{ descriptionDraft.length }}/500</span>
                        </div>
                      </form>
                    </section>

                    <section class="setting-block">
                      <h3 class="h6">Példamondatok szintje</h3>
                      <p class="text-body-secondary small mb-2">Az MI ilyen nehézségű példamondatokat és definíciókat készít ehhez a paklihoz. Ha nem választasz, a fiókod szintje ({{ accountLevel }}) érvényes.</p>
                      <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select
                          class="form-select"
                          style="width: auto;"
                          name="exampleLevel"
                          aria-label="Példamondatok szintje"
                          [ngModel]="deck.exampleLevel ?? ''"
                          (ngModelChange)="saveExampleLevel(deck, $event)"
                          [disabled]="savingLevelDeckId === deck.id">
                          <option value="">Fiók szintje ({{ accountLevel }})</option>
                          @for (level of exampleLevels; track level) {
                            <option [value]="level">{{ level }}</option>
                          }
                        </select>
                        @if (savingLevelDeckId === deck.id) {
                          <span class="spinner-border spinner-border-sm"></span>
                        }
                      </div>
                    </section>

                    <section class="setting-block">
                      <h3 class="h6">Megosztás</h3>
                      @if (deck.isPublic && deck.share; as share) {
                        <p class="small mb-2">
                          <span class="chip chip-shared">Megosztva · v{{ share.version }}</span>
                          A pakli látható a <strong>Közös paklik</strong> között ({{ deck.exampleLevel ?? accountLevel }} szinttel). Mások megnézhetik és lemásolhatják, de a te paklidat nem módosíthatják.
                        </p>
                        <dl class="share-stats small">
                          <div><dt>Verzió</dt><dd>v{{ share.version }}</dd></div>
                          <div><dt>Megosztva</dt><dd>{{ formatLocalTime(share.sharedAt) }}</dd></div>
                          <div><dt>Utoljára frissítve</dt><dd>{{ formatLocalTime(share.updatedAt) }}</dd></div>
                          <div><dt>Lementették</dt><dd>{{ share.saveCount }} felhasználó</dd></div>
                        </dl>
                        @if (share.hasUnpublishedChanges) {
                          <div class="alert alert-warning small py-2" role="status">
                            A legutóbbi megosztás óta módosítottad a paklit (a nevét, leírását, szintjét vagy a kártyáit). A Közös paklik között még a v{{ share.version }} látszik.
                          </div>
                          <button
                            type="button"
                            class="btn btn-primary me-2 mb-2"
                            [disabled]="publishingDeckId === deck.id || deck.cardCount === 0"
                            (click)="publishUpdate(deck)">
                            @if (publishingDeckId === deck.id) {
                              <span class="spinner-border spinner-border-sm me-1"></span>
                            }
                            Megosztás frissítése (v{{ share.version + 1 }})
                          </button>
                        } @else {
                          <p class="text-body-secondary small mb-2">A megosztott verzió megegyezik a paklival. Ha módosítod, itt frissítheted a megosztást.</p>
                        }
                        <button type="button" class="btn btn-outline-secondary mb-2" [disabled]="sharingDeckId === deck.id" (click)="toggleShare(deck)">
                          @if (sharingDeckId === deck.id) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          Megosztás visszavonása
                        </button>
                      } @else {
                        <p class="text-body-secondary small mb-2">
                          Megosztva a pakli bekerül a <strong>Közös paklik</strong> közé: mások megnézhetik és lemásolhatják, de nem módosíthatják az eredetit. A felhasználóneved a pakli mellett látszik. A megosztás a pakli akkori állapotát teszi közzé: a későbbi módosításokat a „Megosztás frissítése" gombbal teheted közzé új verzióként. A megosztást bármikor visszavonhatod.
                        </p>
                        @if (deck.share; as past) {
                          <p class="text-body-secondary small mb-2">
                            Ez a pakli korábban meg volt osztva (v{{ past.version }}, {{ past.saveCount }} mentés). Újra megosztva ezek az adatok megmaradnak.
                          </p>
                        }
                        <button
                          type="button"
                          class="btn btn-primary"
                          [disabled]="sharingDeckId === deck.id || deck.cardCount === 0"
                          [attr.title]="deck.cardCount === 0 ? 'Üres paklit nem érdemes megosztani' : null"
                          (click)="toggleShare(deck)">
                          @if (sharingDeckId === deck.id) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          Pakli megosztása
                        </button>
                        @if (deck.cardCount === 0) {
                          <span class="text-body-secondary small ms-2">Előbb vegyél fel kártyát.</span>
                        }
                      }
                    </section>

                    @if (deck.sourceVersion !== null) {
                      <section class="setting-block">
                        <h3 class="h6">Forrás</h3>
                        <p class="small mb-2">Ezt a paklit a Közös paklik közül mentetted le (v{{ deck.sourceVersion }}). A tartalma nem változik, ha a készítő frissíti a megosztását.</p>
                        @if (deck.updateAvailable && deck.sourceSharedDeckId !== null) {
                          <p class="small mb-2"><span class="chip chip-pending">Új verzió: v{{ deck.latestSharedVersion }}</span> A készítő újabb verziót tett közzé.</p>
                          <button type="button" class="btn btn-outline-primary" [disabled]="copyingDeckId === deck.sourceSharedDeckId" (click)="saveNewVersion(deck)">
                            @if (copyingDeckId === deck.sourceSharedDeckId) {
                              <span class="spinner-border spinner-border-sm me-1"></span>
                            }
                            Új verzió mentése új paklinak
                          </button>
                        }
                      </section>
                    }

                    <section class="setting-block">
                      <h3 class="h6">Import és export</h3>
                      <p class="text-body-secondary small mb-2">
                        CSV fájl <code>term,definition,example</code> fejléccel (opcionálisan <code>,targetMeanings</code> és <code>,tags</code> oszloppal), legfeljebb {{ maxImportRows }} sorral. A hibás sorok kimaradnak, a többi bekerül. Szöveget (például Quizletből) beillesztve is importálhatsz, ilyenkor az MI ki tudja tölteni a definíciót és a példamondatot.
                      </p>
                      <div class="d-flex flex-wrap gap-2">
                        <button type="button" class="btn btn-primary" [disabled]="isImporting" (click)="openPasteImport()">Beillesztés szövegből</button>
                        <label class="btn btn-outline-primary mb-0" [class.disabled]="isImporting">
                          @if (isImporting) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          CSV importálása
                          <input type="file" accept=".csv,text/csv" class="d-none" [disabled]="isImporting" (change)="importDeck($event)">
                        </label>
                        <button type="button" class="btn btn-outline-secondary" [disabled]="isExporting || deck.cardCount === 0" (click)="exportDeck()">
                          @if (isExporting) {
                            <span class="spinner-border spinner-border-sm me-1"></span>
                          }
                          Exportálás CSV-be
                        </button>
                        <button type="button" class="btn btn-link" (click)="downloadCsvTemplate()">Minta CSV letöltése</button>
                      </div>
                    </section>

                    <section class="setting-block danger-zone">
                      <h3 class="h6 text-danger">Veszélyes terület</h3>
                      <p class="text-body-secondary small mb-2">A pakli törlésekor a benne lévő kártyák és a hozzájuk tartozó tanulási adatok is véglegesen törlődnek.</p>
                      <button type="button" class="btn btn-outline-danger" [disabled]="deletingDeckId === deck.id" (click)="deleteDeck(deck)">
                        Pakli törlése
                      </button>
                    </section>
                  </div>
                }
              } @else if (!isLoadingDecks) {
                <div class="empty-box empty-box-lg">
                  <p class="h5 mb-2">Válassz egy paklit</p>
                  <p class="text-body-secondary mb-3">A bal oldali listából kiválaszthatsz egy paklit a kártyák szerkesztéséhez, vagy létrehozhatsz egy újat.</p>
                  <button type="button" class="btn btn-primary" (click)="creating = true">+ Új pakli</button>
                </div>
              }
              }
            </section>
          </div>
        } @else {
          <section aria-label="Közös paklik">
            <p class="text-body-secondary">Más felhasználók megosztott paklijai. Nézd meg a tartalmukat, és másold a sajátjaid közé, ha tetszik.</p>
            <form class="toolbar" (ngSubmit)="searchPublicDecks()">
              <input
                class="form-control"
                type="search"
                name="publicQuery"
                placeholder="Keresés a nevekben és leírásokban…"
                aria-label="Keresés a közös paklik között"
                [(ngModel)]="publicQuery"
                (ngModelChange)="onPublicQueryChange()">
              <input
                class="form-control"
                style="flex: 0 1 12rem;"
                type="search"
                name="publicOwner"
                maxlength="30"
                placeholder="Felhasználónév…"
                aria-label="Szűrés a megosztó felhasználónevére"
                [(ngModel)]="publicOwner"
                (ngModelChange)="onPublicQueryChange()">
              <select
                class="form-select"
                style="width: auto;"
                name="publicSort"
                aria-label="Rendezés"
                [(ngModel)]="publicSort"
                (ngModelChange)="onPublicSortChange()">
                <option value="name">Rendezés: név</option>
                <option value="saves">Rendezés: mentések</option>
                <option value="sharedAt">Rendezés: megosztás ideje</option>
                <option value="updatedAt">Rendezés: utolsó frissítés</option>
                <option value="cards">Rendezés: kártyák száma</option>
                <option value="version">Rendezés: verzió</option>
              </select>
              <button
                type="button"
                class="btn btn-outline-secondary"
                [attr.aria-label]="publicDesc ? 'Csökkenő sorrend' : 'Növekvő sorrend'"
                [attr.title]="publicDesc ? 'Csökkenő sorrend (váltás növekvőre)' : 'Növekvő sorrend (váltás csökkenőre)'"
                (click)="togglePublicSortDirection()">
                {{ publicDesc ? '↓ Csökkenő' : '↑ Növekvő' }}
              </button>
              <div class="dseg dseg-sm dseg-wrap" role="group" aria-label="Szint">
                <button type="button" class="dseg-btn" [class.active]="publicLevelFilter === ''" (click)="publicLevelFilter = ''">Mind</button>
                @for (level of exampleLevels; track level) {
                  <button type="button" class="dseg-btn" [class.active]="publicLevelFilter === level" (click)="publicLevelFilter = level">{{ level }}</button>
                }
              </div>
            </form>

            @if (isLoadingPublic && publicDecks.length === 0) {
              <div class="text-center py-4" role="status"><div class="spinner-border text-primary"></div></div>
            } @else if (filteredPublicDecks().length === 0) {
              <div class="empty-box">
                <p class="fw-semibold mb-1">{{ hasPublicFilter() ? 'Nincs találat' : 'Még nincs közös pakli' }}</p>
                <p class="text-body-secondary small mb-0">
                  {{ hasPublicFilter() ? 'Próbálj másik keresőszót, felhasználónevet vagy szintet.' : 'Oszd meg az első paklidat a saját paklid Beállítások és megosztás fülén.' }}
                </p>
              </div>
            } @else {
              <div class="public-grid">
                @for (deck of filteredPublicDecks(); track deck.id) {
                  <article class="public-card" [class.open]="previewDeckId === deck.id">
                    <div class="d-flex justify-content-between align-items-start gap-2">
                      <h3 class="h6 mb-1 text-break">{{ deck.name }}</h3>
                      @if (deck.exampleLevel) {
                        <span class="chip chip-level" [attr.title]="deck.levelIsAutomatic ? 'Automatikus szint: a készítő fiókszintje (' + deck.exampleLevel + ')' : 'A pakli példamondatai ' + deck.exampleLevel + ' szintre készültek'">
                          {{ deck.exampleLevel }}
                        </span>
                      }
                    </div>
                    @if (deck.description) {
                      <p class="deck-description small text-break mb-2">{{ deck.description }}</p>
                    }
                    <div class="text-body-secondary small mb-1">
                      {{ deck.cardCount }} kártya · készítette:
                      <button
                        type="button"
                        class="owner-link"
                        [attr.title]="'Csak ' + deck.ownerUsername + ' paklijainak mutatása'"
                        (click)="filterByOwner(deck.ownerUsername)">{{ deck.ownerUsername }}</button>
                      @if (hasDeckNamed(deck.name)) {
                        <span class="chip ms-1" title="Már van ilyen nevű paklid">Már van ilyen paklid</span>
                      }
                    </div>
                    <div class="deck-facts text-body-secondary small mb-3">
                      <span class="chip" title="A megosztott pakli verziója">v{{ deck.version }}</span>
                      <span>Megosztva: {{ formatLocalTime(deck.sharedAt) }}</span>
                      @if (deck.version > 1) {
                        <span>Frissítve: {{ formatLocalTime(deck.updatedAt) }}</span>
                      }
                      <span>{{ deck.saveCount }} mentés</span>
                      @if (deck.alreadySaved) {
                        <span class="chip chip-saved" title="Ezt a paklit már lementetted magadhoz">Már mentetted</span>
                      }
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                      <button type="button" class="btn btn-outline-secondary btn-sm" [attr.aria-expanded]="previewDeckId === deck.id" (click)="togglePreview(deck)">
                        {{ previewDeckId === deck.id ? 'Előnézet bezárása' : 'Előnézet' }}
                      </button>
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="copyingDeckId === deck.id" (click)="copyDeck(deck)">
                        @if (copyingDeckId === deck.id) {
                          <span class="spinner-border spinner-border-sm me-1"></span>
                        }
                        Másolás a paklijaim közé
                      </button>
                    </div>
                    @if (previewDeckId === deck.id) {
                      @if (isLoadingPreview) {
                        <div class="text-center py-3" role="status"><div class="spinner-border spinner-border-sm text-primary"></div></div>
                      } @else if (previewCards.length === 0) {
                        <div class="text-body-secondary small mt-3">Ebben a pakliban nincs kártya.</div>
                      } @else {
                        <ul class="preview-list">
                          @for (card of previewCards; track card.id) {
                            <li class="text-break">
                              <strong>{{ card.term }}</strong>
                              <span class="text-body-secondary"> – {{ card.definition }}</span>
                              @if (card.targetMeanings) {
                                <div class="small">{{ card.targetMeanings }}</div>
                              }
                            </li>
                          }
                        </ul>
                      }
                    }
                  </article>
                }
              </div>
            }
          </section>
        }
      </div>
    </main>

    @if (pasteOpen) {
      <div class="confirm-backdrop" (click)="requestClosePaste()">
        <div class="confirm-dialog paste-dialog" role="dialog" aria-modal="true" aria-labelledby="paste-title" (click)="$event.stopPropagation()">
          <div class="d-flex justify-content-between align-items-start gap-3 mb-2">
            <h2 id="paste-title" class="h5 mb-0">Beillesztés szövegből</h2>
            <button type="button" class="btn-close" aria-label="Bezárás" (click)="requestClosePaste()"></button>
          </div>
          <p class="text-body-secondary small mb-3">
            Másold be a szavakat soronként egy szóval. Ha már megvan a magyar jelentés (például Quizlet exportból), írd a szó után az elválasztó jel mögé: az lesz a <strong>magyar jelentés</strong>.
            Ha <strong>csak angol szavaid vannak</strong>, az is jó: kapcsold be lent a „Magyar jelentés készítése MI-vel” opciót, és az MI megírja a magyar jelentést is.
            Az angol definíciót és a példamondatot is kitöltetheted MI-vel.
          </p>

          <label class="form-label small fw-semibold" for="paste-text">Szöveg</label>
          <textarea
            id="paste-text"
            class="form-control mb-3"
            rows="6"
            [(ngModel)]="pasteText"
            [disabled]="pasteAiRunning || pasteSaving"
            placeholder="Magyar jelentéssel:&#10;within walking distance&#9;csak pár percnyire van gyalog&#10;&#10;Vagy csak angol szavak (a jelentést az MI írja):&#10;ability&#10;benefit"></textarea>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <div class="small fw-semibold mb-1">Szó és jelentés között</div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="pasteTermSep" id="ts-tab" value="tab" [(ngModel)]="pasteTermSep">
                <label class="form-check-label" for="ts-tab">Tabulátor</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="pasteTermSep" id="ts-comma" value="comma" [(ngModel)]="pasteTermSep">
                <label class="form-check-label" for="ts-comma">Vessző</label>
              </div>
              <div class="form-check d-flex align-items-center gap-2">
                <input class="form-check-input mt-0" type="radio" name="pasteTermSep" id="ts-custom" value="custom" [(ngModel)]="pasteTermSep">
                <label class="form-check-label" for="ts-custom">Egyéni</label>
                <input type="text" class="form-control form-control-sm paste-sep-input" name="pasteTermCustom" [(ngModel)]="pasteTermCustom" (focus)="pasteTermSep = 'custom'" placeholder="pl. -" aria-label="Egyéni szó és jelentés közti elválasztó">
              </div>
            </div>
            <div class="col-md-6">
              <div class="small fw-semibold mb-1">Sorok között</div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="pasteRowSep" id="rs-newline" value="newline" [(ngModel)]="pasteRowSep">
                <label class="form-check-label" for="rs-newline">Új sor</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="pasteRowSep" id="rs-semicolon" value="semicolon" [(ngModel)]="pasteRowSep">
                <label class="form-check-label" for="rs-semicolon">Pontosvessző</label>
              </div>
              <div class="form-check d-flex align-items-center gap-2">
                <input class="form-check-input mt-0" type="radio" name="pasteRowSep" id="rs-custom" value="custom" [(ngModel)]="pasteRowSep">
                <label class="form-check-label" for="rs-custom">Egyéni</label>
                <input type="text" class="form-control form-control-sm paste-sep-input" name="pasteRowCustom" [(ngModel)]="pasteRowCustom" (focus)="pasteRowSep = 'custom'" placeholder="pl. \\n\\n" aria-label="Egyéni sorok közti elválasztó">
              </div>
            </div>
          </div>

          <div class="form-check mb-1">
            <input class="form-check-input" type="checkbox" id="paste-auto" name="pasteAuto" [(ngModel)]="pasteAuto">
            <label class="form-check-label" for="paste-auto">MI automatikus kitöltés beolvasáskor</label>
          </div>
          <div class="form-check mb-1">
            <input class="form-check-input" type="checkbox" id="paste-simplify" name="pasteSimplify" [(ngModel)]="pasteSimplify">
            <label class="form-check-label" for="paste-simplify">Magyar jelentés készítése és egyszerűsítése MI-vel</label>
          </div>
          <p class="small text-body-secondary mb-2">
            @if (pasteSimplify) {
              Bekapcsolva: ha egy sorban <strong>nincs magyar jelentés</strong>, az MI megírja (2–4 rövid, gyakori jelentés). Ha van, a hosszú jelentéslistát rövidíti le (az eredeti csak támpont). A kitöltés után a táblában bármit átírhatsz.
            } @else {
              Kapcsold be, ha csak angol szavakat írtál be, és az MI-vel szeretnél hozzájuk magyar jelentést. Ha már van jelentés, ezzel rövidebbé, jobban tanulhatóvá is teheted.
            }
          </p>
          <p class="small text-body-secondary mb-3">
            Definíció és példamondat{{ pasteSimplify ? ' (és magyar jelentés)' : '' }} készül a pakli szintjén ({{ pasteLevel }}), {{ aiFillBatchSize }} szavanként egy MI-hívásban.
            Mai keret: {{ aiFillRemaining ?? '…' }} / {{ aiFillLimit }} (a korlát jelenleg nincs érvényben).
          </p>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <button type="button" class="btn btn-primary" [disabled]="!pasteText.trim() || pasteAiRunning || pasteSaving" (click)="parsePaste()">
              {{ pasteAuto ? 'Beolvasás és MI-kitöltés' : 'Sorok beolvasása' }}
            </button>
          </div>

          @if (pasteError) {
            <div class="alert alert-warning py-2" role="alert">{{ pasteError }}</div>
          }
          @if (pasteRows.length > 0 && !pasteSimplify && pasteNoMeaningCount > 0 && !pasteAiRunning) {
            <div class="alert alert-info py-2 d-flex flex-wrap justify-content-between align-items-center gap-2" role="status">
              <span>{{ pasteNoMeaningCount }} sorban nincs magyar jelentés. Az MI megírhatja őket.</span>
              <button type="button" class="btn btn-sm btn-outline-primary" (click)="fillPasteMeanings()" [disabled]="pasteSaving">Magyar jelentés készítése MI-vel</button>
            </div>
          }
          @if (pasteRows.length > slowImportRows) {
            <div class="alert alert-warning py-2" role="status">
              {{ pasteRows.length }} sort készülsz importálni. {{ slowImportRows }} sor fölött a beolvasás, az MI-kitöltés és a mentés is lassú lehet, és a napi MI-keret is hamar elfogyhat. Nagyobb listát érdemes több részletben importálni.
            </div>
          }
          @if (pasteTrimmedCount > 0) {
            <div class="alert alert-info py-2" role="status">{{ pasteTrimmedCount }} sor szövege hosszabb volt a megengedettnél, ezért levágtam (a szó 100, a magyar jelentés 300 karakterig).</div>
          }

          @if (pasteRows.length > 0) {
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <div class="small">
                <strong>{{ pasteRows.length }} sor</strong>
                @if (pasteMissingCount > 0) {
                  · <span class="text-danger">{{ pasteMissingCount }} sorból hiányzik a definíció</span>
                } @else {
                  · minden sorban van definíció
                }
              </div>
              <div class="d-flex gap-2">
                @if (pasteAiRunning) {
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancelPasteAi()">Megszakítás</button>
                } @else {
                  <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="pasteSaving || pasteAiEligibleCount === 0" (click)="startPasteAi()">
                    Hiányzók kitöltése MI-vel
                  </button>
                }
              </div>
            </div>

            @if (pasteAiRunning || pasteAiTotal > 0) {
              <div class="mb-2">
                <div class="progress" role="progressbar" aria-label="MI-kitöltés folyamata" [attr.aria-valuenow]="pasteAiDone" aria-valuemin="0" [attr.aria-valuemax]="pasteAiTotal">
                  <div class="progress-bar" [class.progress-bar-striped]="pasteAiRunning" [class.progress-bar-animated]="pasteAiRunning" [style.width.%]="pasteAiTotal ? (pasteAiDone * 100 / pasteAiTotal) : 0"></div>
                </div>
                <div class="small text-body-secondary mt-1">
                  MI: {{ pasteAiDone }}/{{ pasteAiTotal }} sor feldolgozva{{ pasteAiRunning ? '…' : '' }}
                  @if (pasteAiFailedCount > 0) {
                    · <span class="text-danger">{{ pasteAiFailedCount }} sor kitöltetlen maradt (részletek a sorok mellett)</span>
                  }
                </div>
              </div>
            }

            <div class="table-responsive paste-table-wrap">
              <table class="table table-sm align-top paste-table mb-2">
                <thead>
                  <tr>
                    <th scope="col">Szó</th>
                    <th scope="col">Definíció</th>
                    <th scope="col">Példamondat</th>
                    <th scope="col">Magyar jelentés</th>
                    <th scope="col"><span class="visually-hidden">Törlés</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of pasteRows; track row; let i = $index) {
                    <tr>
                      <td><input type="text" class="form-control form-control-sm" name="pt{{ i }}" maxlength="100" [(ngModel)]="row.term" aria-label="Szó"></td>
                      <td>
                        <textarea class="form-control form-control-sm" rows="2" name="pd{{ i }}" maxlength="500" [(ngModel)]="row.definition" [class.is-invalid]="!row.definition.trim()" aria-label="Definíció"></textarea>
                        @if (row.aiError) {
                          <div class="small text-danger">{{ row.aiError }}</div>
                        } @else if (row.definition.trim() && rowIssue(row)) {
                          <div class="small text-danger">{{ rowIssue(row) }}</div>
                        }
                      </td>
                      <td><textarea class="form-control form-control-sm" rows="2" name="pe{{ i }}" maxlength="500" [(ngModel)]="row.example" aria-label="Példamondat"></textarea></td>
                      <td><input type="text" class="form-control form-control-sm" name="pm{{ i }}" maxlength="300" [(ngModel)]="row.targetMeanings" aria-label="Magyar jelentés"></td>
                      <td><button type="button" class="btn btn-sm btn-outline-danger" aria-label="Sor törlése" (click)="removePasteRow(i)">✕</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
            <span class="small text-body-secondary">
              @if (pasteRows.length > maxImportRows) {
                Legfeljebb {{ maxImportRows }} sor importálható egyszerre.
              } @else if (pasteRows.length > 0 && !canSavePaste && !pasteAiRunning) {
                A mentéshez minden sorban kell szó és definíció.
              }
            </span>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary" [disabled]="pasteSaving" (click)="requestClosePaste()">Mégse</button>
              <button type="button" class="btn btn-primary" [disabled]="!canSavePaste" (click)="savePaste()">
                @if (pasteSaving) {
                  <span class="spinner-border spinner-border-sm me-1"></span>
                }
                Mentés{{ pasteRows.length > 0 ? ' (' + pasteRows.length + ' kártya)' : '' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    @if (pendingConfirm; as confirmation) {
      <div class="confirm-backdrop" (click)="pendingConfirm = null">
        <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" (click)="$event.stopPropagation()">
          <h2 id="confirm-title" class="h5">{{ confirmation.title }}</h2>
          <p id="confirm-text" class="mb-4">{{ confirmation.message }}</p>
          <div class="d-flex flex-wrap justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="pendingConfirm = null">Mégse</button>
            <button
              type="button"
              class="btn"
              [class.btn-danger]="confirmation.danger"
              [class.btn-primary]="!confirmation.danger"
              (click)="runConfirm()">
              {{ confirmation.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (toastMessage) {
      <div class="toast-box" role="status" aria-live="polite">
        <span>{{ toastMessage }}</span>
        <button type="button" class="btn-close btn-close-white" aria-label="Bezárás" (click)="toastMessage = null"></button>
      </div>
    }
  `,
  styles: [`
    .min-w-0 { min-width: 0; }
    .dseg { display: inline-flex; gap: .25rem; padding: .25rem; background: var(--app-surface-2); border: 1px solid var(--app-border); border-radius: 999px; }
    .dseg-wrap { flex-wrap: wrap; border-radius: 1rem; }
    .dseg-btn, .dtab-btn { border: 0; background: transparent; color: var(--app-muted); font-family: inherit; font-size: .95rem; font-weight: 600; cursor: pointer; flex: 0 0 auto; }
    .dseg-btn { display: inline-flex; flex-direction: row; align-items: center; gap: .3rem; padding: .4rem .9rem; border-radius: 999px; white-space: nowrap; }
    .dseg-sm .dseg-btn { padding: .3rem .7rem; font-size: .875rem; }
    .dseg-btn.active { background: var(--app-primary); color: var(--app-on-primary); }
    .dseg-btn:not(.active):hover { color: var(--app-text); }
    .dseg-count { display: inline-block; min-width: 1.4rem; padding: 0 .4rem; border-radius: 999px; background: rgba(127, 127, 127, .2); font-size: .75rem; text-align: center; }
    .dseg-btn.active .dseg-count { background: rgba(255, 255, 255, .25); }

    .deck-layout { display: grid; grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
    .deck-list-panel, .deck-detail-panel { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: var(--app-radius); padding: 1rem; }
    .deck-list-panel { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; }
    .panel-title { font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; color: var(--app-muted); font-weight: 700; }
    .create-box { padding: .75rem; margin-bottom: .75rem; border: 1px dashed var(--app-border); border-radius: var(--app-radius-sm); background: var(--app-surface-2); }
    .deck-list[hidden] { display: none; }
    .deck-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
    .deck-item { width: 100%; display: flex; flex-direction: column; gap: .2rem; text-align: left; padding: .65rem .8rem; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); background: transparent; color: var(--app-text); cursor: pointer; transition: border-color .15s, background .15s; }
    .deck-item:hover { border-color: var(--app-primary); background: var(--app-surface-2); }
    .deck-item.active { border-color: var(--app-primary); background: color-mix(in srgb, var(--app-primary) 12%, transparent); box-shadow: inset 3px 0 0 var(--app-primary); }
    .deck-item-special { border-style: dashed; }
    .deck-name { font-weight: 650; }
    .deck-meta { font-size: .8rem; color: var(--app-muted); }
    .deck-meta .due { color: var(--app-primary); font-weight: 600; }
    .mini-progress { display: block; height: .25rem; margin-top: .2rem; border-radius: 999px; background: var(--app-border); overflow: hidden; }
    .mini-progress > span { display: block; height: 100%; background: var(--app-success); }

    .chip { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .72rem; font-weight: 600; border: 1px solid var(--app-border); color: var(--app-muted); white-space: nowrap; }
    .chip-shared { color: var(--app-primary); border-color: color-mix(in srgb, var(--app-primary) 45%, transparent); background: color-mix(in srgb, var(--app-primary) 10%, transparent); }
    .chip-ok { color: var(--app-success); border-color: color-mix(in srgb, var(--app-success) 45%, transparent); background: color-mix(in srgb, var(--app-success) 10%, transparent); margin-left: .35rem; }
    .chip-leech { color: var(--app-danger); border-color: color-mix(in srgb, var(--app-danger) 45%, transparent); background: color-mix(in srgb, var(--app-danger) 10%, transparent); margin-left: .35rem; }
    .chip-paused { color: var(--app-muted); margin-left: .35rem; }
    .chip-level { color: var(--app-primary); border-color: color-mix(in srgb, var(--app-primary) 45%, transparent); }
    .chip-pending { color: var(--app-text); border: 1px dashed var(--app-primary); background: transparent; }
    .chip-saved { color: var(--app-success); border-color: color-mix(in srgb, var(--app-success) 45%, transparent); background: color-mix(in srgb, var(--app-success) 10%, transparent); }
    .owner-link { padding: 0; border: 0; background: none; color: var(--app-primary); font-weight: 600; cursor: pointer; }
    .owner-link:hover { text-decoration: underline; }
    .deck-facts { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; }
    .share-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .5rem .75rem; margin: 0 0 1rem; }
    .share-stats dt { font-weight: 600; color: var(--app-muted); }
    .share-stats dd { margin: 0; }

    .back-link { display: inline-block; margin-bottom: .75rem; padding: 0; border: 0; background: none; color: var(--app-primary); font-weight: 600; }
    .detail-head { margin-bottom: 1rem; }
    .tabs { display: flex; gap: .25rem; margin-top: 1rem; border-bottom: 1px solid var(--app-border); overflow-x: auto; }
    .dtab-btn { display: inline-flex; flex-direction: row; align-items: center; gap: .3rem; padding: .55rem .9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .dtab-btn.active { color: var(--app-primary); border-bottom-color: var(--app-primary); }
    .dtab-btn:not(.active):hover { color: var(--app-text); }

    .toolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: 1rem 0 .75rem; }
    .toolbar .form-control { flex: 1 1 14rem; min-width: 0; }

    .editor { padding: 1rem; margin-bottom: 1rem; border: 1px solid var(--app-primary); border-radius: var(--app-radius-sm); background: color-mix(in srgb, var(--app-primary) 5%, var(--app-surface)); }
    .card-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); overflow: hidden; }
    .card-row { display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem; padding: .75rem .9rem; border-top: 1px solid var(--app-border); background: var(--app-surface); }
    .card-row:first-child { border-top: 0; }
    .card-row:hover { background: var(--app-surface-2); }
    .card-row.is-editing { background: color-mix(in srgb, var(--app-primary) 10%, var(--app-surface)); }
    .card-main { min-width: 0; flex: 1 1 auto; }
    .card-term { font-weight: 700; }
    .card-def { margin-top: .1rem; }
    .card-tm { margin-top: .15rem; color: var(--app-primary); font-weight: 600; font-size: .92rem; }
    .card-tags { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .3rem; }
    .chip-tag { background: transparent; cursor: pointer; font-weight: 500; }
    .chip-tag:hover, .chip-tag.active { color: var(--app-primary); border-color: var(--app-primary); }
    .tag-select { width: auto; max-width: 11rem; }
    .card-ex { margin-top: .15rem; color: var(--app-muted); font-style: italic; font-size: .9rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .1rem .75rem; margin-top: .5rem; font-size: .8rem; color: var(--app-muted); }
    .card-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 2.1rem; height: 2.1rem; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); background: transparent; color: var(--app-text); cursor: pointer; }
    .icon-btn:hover { border-color: var(--app-primary); color: var(--app-primary); }
    .icon-btn-danger:hover { border-color: var(--app-danger); color: var(--app-danger); }
    .icon-btn:disabled { opacity: .5; cursor: not-allowed; }

    .settings { display: flex; flex-direction: column; gap: 1rem; }
    .setting-block { padding: 1rem; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); }
    .danger-zone { border-color: color-mix(in srgb, var(--app-danger) 45%, var(--app-border)); }

    .deck-description { color: var(--app-muted); white-space: pre-line; }
    .public-card .deck-description { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .empty-box { padding: 1.25rem; border: 1px dashed var(--app-border); border-radius: var(--app-radius-sm); background: var(--app-surface-2); }
    .empty-box-lg { padding: 2.5rem 1.5rem; text-align: center; }

    .public-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: .9rem; align-items: start; }
    .public-card { padding: 1rem; border: 1px solid var(--app-border); border-radius: var(--app-radius); background: var(--app-surface); }
    .public-card.open { grid-column: 1 / -1; border-color: var(--app-primary); }
    .preview-list { list-style: none; margin: 1rem 0 0; padding: 0; max-height: 18rem; overflow-y: auto; border-top: 1px solid var(--app-border); }
    .preview-list li { padding: .5rem 0; border-bottom: 1px solid var(--app-border); }

    .confirm-backdrop { position: fixed; inset: 0; z-index: 1080; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(0, 0, 0, .5); }
    .confirm-dialog { width: min(28rem, 100%); padding: 1.5rem; border-radius: var(--app-radius); background: var(--app-surface); color: var(--app-text); border: 1px solid var(--app-border); box-shadow: 0 1rem 3rem rgba(0, 0, 0, .35); }
    .paste-dialog { width: min(64rem, 100%); max-height: calc(100vh - 2rem); overflow-y: auto; }
    .paste-sep-input { width: 7rem; }
    .paste-table-wrap { max-height: 22rem; overflow-y: auto; }
    .paste-table { min-width: 40rem; }
    .paste-table th { position: sticky; top: 0; background: var(--app-surface); z-index: 1; }
    .toast-box { position: fixed; right: 1rem; bottom: 1rem; z-index: 1090; display: flex; align-items: center; gap: .75rem; max-width: min(26rem, calc(100vw - 2rem)); padding: .75rem 1rem; border-radius: var(--app-radius-sm); background: #1f2937; color: #fff; box-shadow: 0 .5rem 1.5rem rgba(0, 0, 0, .3); }

    @media (max-width: 991.98px) {
      .deck-layout { grid-template-columns: minmax(0, 1fr); }
      .deck-list-panel { position: static; max-height: none; }
      .deck-layout:not(.show-detail) .deck-detail-panel { display: none; }
      .deck-layout.show-detail .deck-list-panel { display: none; }
      .toast-box { bottom: 5.5rem; }
    }
    @media (max-width: 575.98px) {
      .card-row { flex-direction: column; }
      .card-actions { width: 100%; justify-content: space-between; }
    }
    @media (min-width: 768px) { .w-md-auto { width: auto !important; } }
  `],
})
export class DecksComponent implements OnInit, OnDestroy {
  @Output() readonly studyDeck = new EventEmitter<number>();

  private readonly http = inject(HttpClient);

  section: Section = 'mine';
  detailTab: DetailTab = 'cards';
  mobileDetailOpen = false;
  creating = false;
  decks: Deck[] = [];
  publicDecks: PublicDeck[] = [];
  cards: VocabCard[] = [];
  learnedCards: LearnedCard[] = [];
  viewingLearned = false;
  learnedDetailed = true;
  learnedSearch = '';
  cardSearch = '';
  globalQuery = '';
  globalResults: CardSearchResult[] = [];
  isGlobalSearching = false;
  private globalSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private globalSearchGeneration = 0;
  cardFilter: CardFilter = 'all';
  previewCards: VocabCard[] = [];
  previewDeckId: number | null = null;
  selectedDeckId: number | null = null;
  newDeckName = '';
  newDeckDescription = '';
  newDeckLevel = 'B1';
  renameDraft = '';
  descriptionDraft = '';
  publicQuery = '';
  publicOwner = '';
  publicSort: PublicSort = 'name';
  publicDesc = false;
  term = '';
  definition = '';
  example = '';
  targetMeanings = '';
  tags = '';
  tagFilter = '';
  readonly maxTags = 5;
  readonly maxTagLength = 24;
  editingCardId: number | null = null;
  cardEditorOpen = false;
  errorMessage: string | null = null;
  toastMessage: string | null = null;
  cardError: string | null = null;
  pendingConfirm: PendingConfirm | null = null;
  importMessage: string | null = null;
  importSkipped: string[] = [];
  isLoadingDecks = false;
  isLoadingCards = false;
  isLoadingPublic = false;
  isLoadingPreview = false;
  isSavingDeck = false;
  isRenaming = false;
  isSavingDescription = false;
  isSavingCard = false;
  isGeneratingDefinition = false;
  isGeneratingTargetMeaning = false;
  isAutoFilling = false;
  isExporting = false;
  isImporting = false;
  deletingDeckId: number | null = null;
  deletingCardId: number | null = null;
  markingKnownCardId: number | null = null;
  suspendingCardId: number | null = null;
  resettingLearnedCardId: number | null = null;
  sharingDeckId: number | null = null;
  publishingDeckId: number | null = null;
  copyingDeckId: number | null = null;
  savingLevelDeckId: number | null = null;
  readonly exampleLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  publicLevelFilter = '';
  accountLevel = 'B1';

  pasteOpen = false;
  pasteText = '';
  pasteTermSep: TermSeparator = 'tab';
  pasteTermCustom = '';
  pasteRowSep: RowSeparator = 'newline';
  pasteRowCustom = '';
  pasteAuto = false;
  pasteSimplify = false;
  pasteRows: PasteRow[] = [];
  pasteError: string | null = null;
  readonly maxImportRows = 10000;
  readonly slowImportRows = 200;
  pasteSaving = false;
  pasteTrimmedCount = 0;
  pasteAiRunning = false;
  pasteAiDone = 0;
  pasteAiTotal = 0;
  aiFillBatchSize = 5;
  aiFillLimit = 100;
  aiFillRemaining: number | null = null;

  private pasteAiSub: Subscription | null = null;
  private previewRequest = 0;
  private cardsRequest = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private publicSearchTimer: ReturnType<typeof setTimeout> | null = null;

  get selectedDeck(): Deck | null {
    return this.decks.find(deck => deck.id === this.selectedDeckId) ?? null;
  }

  get learnedTotal(): number {
    return this.decks.reduce((sum, deck) => sum + deck.learnedCount, 0);
  }

  get isBusyAi(): boolean {
    return this.isGeneratingDefinition || this.isGeneratingTargetMeaning || this.isAutoFilling;
  }

  tagList(tags: string | null): string[] {
    return tags ? tags.split(',').filter(tag => tag.length > 0) : [];
  }

  get deckTags(): string[] {
    const tags = new Set<string>();
    for (const card of this.cards) {
      for (const tag of this.tagList(card.tags)) {
        tags.add(tag);
      }
    }

    return [...tags].sort((a, b) => a.localeCompare(b, 'hu'));
  }

  get activeTagFilter(): string {
    return this.deckTags.includes(this.tagFilter) ? this.tagFilter : '';
  }

  get visibleCards(): VocabCard[] {
    const query = this.cardSearch.trim().toLowerCase();
    const tagFilter = this.activeTagFilter;
    return this.cards.filter(card => {
      if (tagFilter && !this.tagList(card.tags).includes(tagFilter)) {
        return false;
      }

      if (this.cardFilter === 'learned' && !card.isLearned) {
        return false;
      }

      if (this.cardFilter === 'open' && card.isLearned) {
        return false;
      }

      if (this.cardFilter === 'suspended' && card.suspension === 'none') {
        return false;
      }

      if (this.cardFilter === 'leech' && !card.isLeech) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [card.term, card.definition, card.targetMeanings ?? '', card.example ?? '', card.tags ?? '']
        .some(text => text.toLowerCase().includes(query));
    });
  }

  get visibleLearned(): LearnedCard[] {
    const query = this.learnedSearch.trim().toLowerCase();
    if (!query) {
      return this.learnedCards;
    }

    return this.learnedCards.filter(card =>
      [card.term, card.definition, card.targetMeanings ?? '', card.deckName]
        .some(text => text.toLowerCase().includes(query)));
  }

  get pasteLevel(): string {
    return this.selectedDeck?.exampleLevel ?? this.accountLevel;
  }

  get pasteMissingCount(): number {
    return this.pasteRows.filter(row => !row.definition.trim()).length;
  }

  get pasteNoMeaningCount(): number {
    return this.pasteRows.filter(row => !row.targetMeanings.trim()).length;
  }

  get pasteAiEligibleCount(): number {
    return this.pasteRows.filter(row => this.isAiEligible(row)).length;
  }

  get pasteAiFailedCount(): number {
    return this.pasteRows.filter(row => row.aiError).length;
  }

  get canSavePaste(): boolean {
    return this.pasteRows.length > 0
      && this.pasteRows.length <= this.maxImportRows
      && this.pasteRows.every(row => this.rowIssue(row) === null)
      && !this.pasteAiRunning
      && !this.pasteSaving;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pendingConfirm) {
      this.pendingConfirm = null;
    } else if (this.pasteOpen && !this.pasteSaving) {
      this.requestClosePaste();
    }
  }

  ngOnInit(): void {
    this.loadAiFillSettings();
    this.loadDecks(true);
    this.searchPublicDecks();
  }

  ngOnDestroy(): void {
    this.pasteAiSub?.unsubscribe();

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    if (this.publicSearchTimer) {
      clearTimeout(this.publicSearchTimer);
    }

    if (this.globalSearchTimer) {
      clearTimeout(this.globalSearchTimer);
    }
  }

  setSection(section: Section): void {
    this.section = section;
    this.errorMessage = null;
    if (section === 'public' && this.publicDecks.length === 0) {
      this.searchPublicDecks();
    }
  }

  learnedPercent(deck: Deck): number {
    return deck.cardCount === 0 ? 0 : Math.round((deck.learnedCount / deck.cardCount) * 100);
  }

  hasDeckNamed(name: string): boolean {
    const key = name.trim().toLowerCase();
    return this.decks.some(deck => deck.name.trim().toLowerCase() === key);
  }

  hasPublicFilter(): boolean {
    return !!(this.publicQuery.trim() || this.publicOwner.trim() || this.publicLevelFilter);
  }

  filteredPublicDecks(): PublicDeck[] {
    return this.publicLevelFilter
      ? this.publicDecks.filter((deck) => deck.exampleLevel === this.publicLevelFilter)
      : this.publicDecks;
  }

  // ---------- értesítések és megerősítés

  toast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.toastTimer = null;
    }, 5000);
  }

  askConfirm(title: string, message: string, confirmLabel: string, danger: boolean, action: () => void): void {
    this.pendingConfirm = { title, message, confirmLabel, danger, action };
  }

  runConfirm(): void {
    const confirmation = this.pendingConfirm;
    this.pendingConfirm = null;
    confirmation?.action();
  }

  // ---------- paklik

  toggleCreate(): void {
    this.creating = !this.creating;
    this.newDeckName = '';
    this.newDeckDescription = '';
    this.newDeckLevel = this.accountLevel;
    if (this.creating) {
      setTimeout(() => document.getElementById('deckName')?.focus(), 50);
    }
  }

  createDeck(): void {
    const name = this.newDeckName.trim();
    if (!name) {
      this.errorMessage = 'Add meg a pakli nevét.';
      return;
    }

    if (name.length > 100) {
      this.errorMessage = 'A pakli neve legfeljebb 100 karakter lehet.';
      return;
    }

    this.errorMessage = null;
    this.isSavingDeck = true;
    this.http.post<Deck>('/api/decks', {
      name,
      description: this.newDeckDescription.trim() || null,
      exampleLevel: this.exampleLevels.includes(this.newDeckLevel) ? this.newDeckLevel : null,
    }).pipe(
      finalize(() => {
        this.isSavingDeck = false;
      }),
    ).subscribe({
      next: (deck) => {
        this.newDeckName = '';
        this.newDeckDescription = '';
        this.creating = false;
        this.decks = [...this.decks, deck].sort((left, right) => left.id - right.id);
        this.selectDeck(deck.id, true);
        this.toast(`A(z) „${deck.name}” pakli létrejött. Vegyél fel bele kártyákat!`);
        this.openNewCard();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli létrehozása sikertelen.');
      },
    });
  }

  get globalActive(): boolean {
    return this.globalQuery.trim().length >= 2;
  }

  onGlobalSearchChange(): void {
    if (this.globalSearchTimer) {
      clearTimeout(this.globalSearchTimer);
      this.globalSearchTimer = null;
    }

    const generation = ++this.globalSearchGeneration;
    if (!this.globalActive) {
      this.globalResults = [];
      this.isGlobalSearching = false;
      return;
    }

    this.isGlobalSearching = true;
    this.globalSearchTimer = setTimeout(() => {
      this.http.get<CardSearchResult[]>('/api/cards/search', { params: { q: this.globalQuery.trim() } }).pipe(
        finalize(() => {
          if (generation === this.globalSearchGeneration) {
            this.isGlobalSearching = false;
          }
        }),
      ).subscribe({
        next: (results) => {
          if (generation === this.globalSearchGeneration) {
            this.globalResults = results;
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation === this.globalSearchGeneration) {
            this.errorMessage = this.readError(error, 'A keresés sikertelen.');
          }
        },
      });
    }, 300);
  }

  openSearchResult(result: CardSearchResult): void {
    this.selectDeck(result.deckId, true);
    this.detailTab = 'cards';
    this.cardFilter = 'all';
    this.tagFilter = '';
    this.cardSearch = result.term;
  }

  selectDeck(deckId: number, openDetail = false): void {
    if (openDetail) {
      this.mobileDetailOpen = true;
    }

    if (!this.viewingLearned && this.selectedDeckId === deckId) {
      return;
    }

    this.viewingLearned = false;
    this.selectedDeckId = deckId;
    this.detailTab = 'cards';
    this.cardSearch = '';
    this.cardFilter = 'all';
    this.tagFilter = '';
    this.importMessage = null;
    this.importSkipped = [];
    const selected = this.decks.find(deck => deck.id === deckId);
    this.renameDraft = selected?.name ?? '';
    this.descriptionDraft = selected?.description ?? '';
    this.closeEditor();
    this.loadCards();
    this.rememberSelection(deckId);
  }

  selectLearned(openDetail = false): void {
    if (openDetail) {
      this.mobileDetailOpen = true;
    }

    if (this.viewingLearned) {
      return;
    }

    this.viewingLearned = true;
    this.learnedDetailed = true;
    this.learnedSearch = '';
    this.selectedDeckId = null;
    this.importMessage = null;
    this.importSkipped = [];
    this.closeEditor();
    this.loadLearned();
  }

  closeDetail(): void {
    this.mobileDetailOpen = false;
  }

  openSettings(): void {
    const deck = this.selectedDeck;
    if (deck) {
      this.renameDraft = deck.name;
      this.descriptionDraft = deck.description ?? '';
    }

    this.detailTab = 'settings';
  }

  saveDescription(deck: Deck): void {
    const description = this.descriptionDraft.trim();
    if (description.length > 500) {
      this.errorMessage = 'A pakli leírása legfeljebb 500 karakter lehet.';
      return;
    }

    this.errorMessage = null;
    this.isSavingDescription = true;
    this.http.put<Deck>(`/api/decks/${deck.id}/description`, { description: description || null }).pipe(
      finalize(() => {
        this.isSavingDescription = false;
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.descriptionDraft = updated.description ?? '';
        this.toast('A leírás mentve.');
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A leírás mentése sikertelen.');
      },
    });
  }

  renameDeck(deck: Deck): void {
    const name = this.renameDraft.trim();
    if (!name || name.length > 100) {
      this.errorMessage = 'A pakli neve kötelező, és legfeljebb 100 karakter lehet.';
      return;
    }

    this.errorMessage = null;
    this.isRenaming = true;
    this.http.put<Deck>(`/api/decks/${deck.id}`, { name }).pipe(
      finalize(() => {
        this.isRenaming = false;
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.renameDraft = updated.name;
        this.toast(`A pakli új neve: „${updated.name}”.`);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli átnevezése sikertelen.');
      },
    });
  }

  saveExampleLevel(deck: Deck, value: string): void {
    const exampleLevel = value === '' ? null : value;
    if (exampleLevel === deck.exampleLevel) {
      return;
    }

    if (exampleLevel !== null && !this.exampleLevels.includes(exampleLevel)) {
      this.errorMessage = 'A mondatszint A1, A2, B1, B2, C1 vagy C2 lehet.';
      return;
    }

    const previous = deck.exampleLevel;
    deck.exampleLevel = exampleLevel;
    this.errorMessage = null;
    this.savingLevelDeckId = deck.id;
    this.http.put<Deck>(`/api/decks/${deck.id}/example-level`, { exampleLevel }).pipe(
      finalize(() => {
        if (this.savingLevelDeckId === deck.id) {
          this.savingLevelDeckId = null;
        }
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.toast('A mondatszint mentve.');
      },
      error: (error: HttpErrorResponse) => {
        this.decks = this.decks.map(item => item.id === deck.id ? { ...item, exampleLevel: previous } : item);
        this.errorMessage = this.readError(error, 'A mondatszint mentése sikertelen.');
      },
    });
  }

  toggleShare(deck: Deck): void {
    this.errorMessage = null;
    this.sharingDeckId = deck.id;
    const body: { isPublic: boolean; exampleLevel?: string } = { isPublic: !deck.isPublic };
    if (!deck.isPublic && deck.exampleLevel) {
      body.exampleLevel = deck.exampleLevel;
    }

    this.http.put<Deck>(`/api/decks/${deck.id}/share`, body).pipe(
      finalize(() => {
        this.sharingDeckId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.toast(updated.isPublic
          ? `A(z) „${updated.name}” pakli megosztva. Mostantól megjelenik a Közös paklik között.`
          : `A(z) „${updated.name}” pakli megosztása visszavonva.`);
        this.searchPublicDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A megosztás módosítása sikertelen.');
      },
    });
  }

  publishUpdate(deck: Deck): void {
    this.errorMessage = null;
    this.publishingDeckId = deck.id;
    this.http.post<Deck>(`/api/decks/${deck.id}/share/update`, {}).pipe(
      finalize(() => {
        this.publishingDeckId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.toast(`A(z) „${updated.name}” megosztása frissítve: új verzió v${updated.share?.version ?? ''}.`);
        this.searchPublicDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A megosztás frissítése sikertelen.');
        this.loadDecks();
      },
    });
  }

  deleteDeck(deck: Deck): void {
    this.askConfirm(
      'Pakli törlése',
      `Biztosan törlöd a(z) „${deck.name}” paklit? A benne lévő ${deck.cardCount} kártya és a hozzájuk tartozó tanulási adatok is véglegesen törlődnek.`,
      'Pakli törlése',
      true,
      () => this.performDeleteDeck(deck),
    );
  }

  private performDeleteDeck(deck: Deck): void {
    this.errorMessage = null;
    this.deletingDeckId = deck.id;
    this.http.delete(`/api/decks/${deck.id}`).pipe(
      finalize(() => {
        this.deletingDeckId = null;
      }),
    ).subscribe({
      next: () => {
        this.decks = this.decks.filter(item => item.id !== deck.id);
        this.toast(`A(z) „${deck.name}” pakli törölve.`);
        if (this.selectedDeckId === deck.id) {
          this.selectedDeckId = null;
          this.cards = [];
          this.closeEditor();
          this.mobileDetailOpen = false;
          if (this.decks.length > 0) {
            this.selectDeck(this.decks[0].id);
          }
        }

        if (deck.isPublic) {
          this.searchPublicDecks();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli törlése sikertelen.');
      },
    });
  }

  // ---------- kártyák

  openNewCard(): void {
    this.detailTab = 'cards';
    this.editingCardId = null;
    this.term = '';
    this.definition = '';
    this.example = '';
    this.targetMeanings = '';
    this.tags = '';
    this.cardError = null;
    this.cardEditorOpen = true;
    this.focusTerm();
  }

  editCard(card: VocabCard): void {
    this.editingCardId = card.id;
    this.term = card.term;
    this.definition = card.definition;
    this.example = card.example ?? '';
    this.targetMeanings = card.targetMeanings ?? '';
    this.tags = this.tagList(card.tags).join(', ');
    this.errorMessage = null;
    this.cardError = null;
    this.cardEditorOpen = true;
    this.focusTerm();
  }

  closeEditor(): void {
    this.cardEditorOpen = false;
    this.cardError = null;
    this.editingCardId = null;
    this.term = '';
    this.definition = '';
    this.example = '';
    this.targetMeanings = '';
    this.tags = '';
  }

  private focusTerm(): void {
    setTimeout(() => {
      const input = document.getElementById('card-term');
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input?.focus({ preventScroll: true });
    }, 60);
  }

  saveCard(): void {
    if (this.isSavingCard || this.isBusyAi) {
      return;
    }

    const term = this.term.trim();
    const definition = this.definition.trim();
    const example = this.example.trim();
    const targetMeanings = this.targetMeanings.trim();
    const tags = this.tags.trim();
    const problem = this.cardFieldProblem(term, definition, example, targetMeanings, tags);
    if (problem) {
      this.cardError = problem;
      return;
    }

    if (this.selectedDeckId === null) {
      return;
    }

    this.cardError = null;
    if (this.editingCardId === null) {
      const key = term.toLowerCase();
      if (this.cards.some(card => card.term.trim().toLowerCase() === key)) {
        this.askConfirm(
          'Már van ilyen kártya',
          `A pakliban már szerepel a(z) „${term}” szó. Biztosan felveszed még egyszer?`,
          'Felvétel mégis',
          false,
          () => this.performSaveCard(term, definition, example, targetMeanings, tags),
        );
        return;
      }
    }

    this.performSaveCard(term, definition, example, targetMeanings, tags);
  }

  private cardFieldProblem(term: string, definition: string, example: string, targetMeanings: string, tags: string): string | null {
    if (!term) {
      return 'A szó megadása kötelező.';
    }

    if (term.length > 100) {
      return `A szó legfeljebb 100 karakter lehet (most ${term.length}).`;
    }

    if (!definition) {
      return 'Az angol definíció megadása kötelező. Használhatod a Generálás vagy a Kitöltés MI-vel gombot is.';
    }

    if (definition.length > 500) {
      return `Az angol definíció legfeljebb 500 karakter lehet (most ${definition.length}).`;
    }

    if (targetMeanings.length > 300) {
      return `A magyar jelentés legfeljebb 300 karakter lehet (most ${targetMeanings.length}).`;
    }

    if (example.length > 500) {
      return `A példamondat legfeljebb 500 karakter lehet (most ${example.length}).`;
    }

    const tagParts = [...new Set(tags.split(/[,;]/).map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0))];
    if (tagParts.length > this.maxTags) {
      return `Legfeljebb ${this.maxTags} címke adható meg (most ${tagParts.length}).`;
    }

    if (tagParts.some(tag => tag.length > this.maxTagLength)) {
      return `Egy címke legfeljebb ${this.maxTagLength} karakter lehet.`;
    }

    return null;
  }

  private performSaveCard(term: string, definition: string, example: string, targetMeanings: string, tags: string): void {
    if (this.selectedDeckId === null) {
      return;
    }

    this.errorMessage = null;
    this.cardError = null;
    this.isSavingCard = true;
    const wasEditing = this.editingCardId !== null;
    const body = { term, definition, example: example || null, targetMeanings: targetMeanings || null, tags: tags || null };
    const request = this.editingCardId === null
      ? this.http.post<VocabCard>('/api/cards', { deckId: this.selectedDeckId, ...body })
      : this.http.put<VocabCard>(`/api/cards/${this.editingCardId}`, body);

    request.pipe(
      finalize(() => {
        this.isSavingCard = false;
      }),
    ).subscribe({
      next: (card) => {
        if (wasEditing) {
          this.cards = this.cards.map(item => item.id === card.id ? card : item);
          this.toast(`A(z) „${card.term}” kártya mentve.`);
          this.closeEditor();
        } else {
          this.cards = [...this.cards, card];
          this.toast(`A(z) „${card.term}” kártya felvéve.`);
          // Az editor nyitva marad, hogy gyorsan lehessen több kártyát felvenni.
          this.term = '';
          this.definition = '';
          this.example = '';
          this.targetMeanings = '';
          this.tags = '';
          this.focusTerm();
        }

        this.refreshDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.cardError = this.readError(error, 'A kártya mentése sikertelen.');
      },
    });
  }

  deleteCard(card: VocabCard): void {
    this.askConfirm(
      'Kártya törlése',
      `Biztosan törlöd a(z) „${card.term}” kártyát? A hozzá tartozó tanulási adatok is törlődnek.`,
      'Kártya törlése',
      true,
      () => this.performDeleteCard(card),
    );
  }

  private performDeleteCard(card: VocabCard): void {
    this.errorMessage = null;
    this.deletingCardId = card.id;
    this.http.delete(`/api/cards/${card.id}`).pipe(
      finalize(() => {
        this.deletingCardId = null;
      }),
    ).subscribe({
      next: () => {
        this.cards = this.cards.filter(item => item.id !== card.id);
        this.refreshDecks();
        this.toast(`A(z) „${card.term}” kártya törölve.`);
        if (this.editingCardId === card.id) {
          this.closeEditor();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártya törlése sikertelen.');
      },
    });
  }

  setKnown(card: VocabCard, event: Event): void {
    const input = event.target as HTMLInputElement;
    const known = input.checked;
    this.errorMessage = null;
    this.markingKnownCardId = card.id;
    this.http.put<VocabCard>(`/api/cards/${card.id}/known`, { known }).pipe(
      finalize(() => {
        this.markingKnownCardId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.cards = this.cards.map(item => item.id === updated.id ? updated : item);
        input.checked = updated.isLearned;
        this.toast(updated.isLearned
          ? `A(z) „${card.term}” megtanultnak jelölve.`
          : `A(z) „${card.term}” újra a tanulandó kártyák között van.`);
        this.refreshDecks();
      },
      error: (error: HttpErrorResponse) => {
        input.checked = card.isLearned;
        this.errorMessage = this.readError(error, 'Az ismert szó jelölése sikertelen.');
      },
    });
  }

  setSuspension(card: VocabCard, mode: CardSuspension): void {
    this.errorMessage = null;
    this.suspendingCardId = card.id;
    this.http.put<VocabCard>(`/api/cards/${card.id}/suspension`, { mode }).pipe(
      finalize(() => {
        this.suspendingCardId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.cards = this.cards.map(item => item.id === updated.id ? updated : item);
        this.toast(mode === 'suspended'
          ? `A(z) „${card.term}” felfüggesztve, nem jelenik meg a tanulásban.`
          : mode === 'buried'
            ? `A(z) „${card.term}” holnapig elnapolva.`
            : `A(z) „${card.term}” újra a tanulásban van.`);
        this.refreshDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártya felfüggesztése sikertelen.');
      },
    });
  }

  resetLearned(card: LearnedCard): void {
    this.errorMessage = null;
    this.resettingLearnedCardId = card.id;
    this.http.post(`/api/cards/${card.id}/reset-learned`, {}).pipe(
      finalize(() => {
        this.resettingLearnedCardId = null;
      }),
    ).subscribe({
      next: () => {
        this.learnedCards = this.learnedCards.filter(item => item.id !== card.id);
        this.toast(`A(z) „${card.term}” újra a tanulandó kártyák között van.`);
        this.refreshDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A szó visszaállítása sikertelen.');
      },
    });
  }

  // ---------- MI-segítség a kártyához

  // Az MI-generálás előtt kiírjuk a mondatszintet, és jóváhagyást kérünk.
  private confirmAiLevel(what: string, action: () => void): void {
    this.pendingConfirm = {
      title: 'MI-generálás',
      message: `Az MI ${this.pasteLevel} szinten generálja ${what} (a pakli mondatszintje). Folytatod?`,
      confirmLabel: 'Generálás',
      danger: false,
      action,
    };
  }

  generateDefinition(): void {
    const term = this.term.trim();
    if (!term || this.isBusyAi || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

    this.confirmAiLevel('a definíciót', () => this.runGenerateDefinition());
  }

  private runGenerateDefinition(): void {
    const term = this.term.trim();
    if (!term || this.isBusyAi || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    this.cardError = null;
    this.isGeneratingDefinition = true;
    this.http.post<{ definition: string }>('/api/ai/generate/card-definition', { term, deckId }).pipe(
      finalize(() => {
        this.isGeneratingDefinition = false;
      }),
    ).subscribe({
      next: (response) => {
        this.definition = (response.definition ?? '').trim();
      },
      error: (error: HttpErrorResponse) => {
        this.cardError = this.readAiError(error, 'Az angol definíció generálása');
      },
    });
  }

  generateTargetMeaning(): void {
    const term = this.term.trim();
    const definition = this.definition.trim();
    if (!term || !definition || this.isBusyAi || this.isSavingCard) {
      return;
    }

    this.cardError = null;
    this.isGeneratingTargetMeaning = true;
    this.http.post<{ meanings: string }>('/api/ai/generate/target-meaning', { term, definition }).pipe(
      finalize(() => {
        this.isGeneratingTargetMeaning = false;
      }),
    ).subscribe({
      next: (response) => {
        const combined = this.appendMeanings(this.targetMeanings, response.meanings ?? '');
        if (combined.length > 300) {
          this.cardError = 'A magyar jelentés legfeljebb 300 karakter lehet.';
          return;
        }

        this.targetMeanings = combined;
      },
      error: (error: HttpErrorResponse) => {
        this.cardError = this.readAiError(error, 'A magyar jelentés generálása');
      },
    });
  }

  autoFill(): void {
    const term = this.term.trim();
    if (!term || this.isBusyAi || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    const needDefinition = !this.definition.trim();
    const needMeaning = !this.targetMeanings.trim();
    if (!needDefinition && !needMeaning) {
      this.cardError = 'Az angol definíció és a magyar jelentés már ki van töltve.';
      return;
    }

    if (needDefinition) {
      // Csak a definíció függ a szinttől; ha az már megvan, a magyar jelentés kérése nem kér jóváhagyást.
      this.confirmAiLevel('a definíciót', () => this.runAutoFill());
      return;
    }

    this.runAutoFill();
  }

  private runAutoFill(): void {
    const term = this.term.trim();
    if (!term || this.isBusyAi || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    const needDefinition = !this.definition.trim();
    const needMeaning = !this.targetMeanings.trim();
    this.cardError = null;
    this.isAutoFilling = true;

    const fillMeaning = (definition: string): void => {
      if (!needMeaning) {
        this.isAutoFilling = false;
        return;
      }

      this.http.post<{ meanings: string }>('/api/ai/generate/target-meaning', { term, definition }).pipe(
        finalize(() => {
          this.isAutoFilling = false;
        }),
      ).subscribe({
        next: (response) => {
          const combined = this.appendMeanings(this.targetMeanings, response.meanings ?? '');
          if (combined.length <= 300) {
            this.targetMeanings = combined;
          }
        },
        error: (error: HttpErrorResponse) => {
          this.cardError = this.readAiError(error, 'A magyar jelentés generálása');
        },
      });
    };

    if (!needDefinition) {
      fillMeaning(this.definition.trim());
      return;
    }

    this.http.post<{ definition: string }>('/api/ai/generate/card-definition', { term, deckId }).subscribe({
      next: (response) => {
        this.definition = (response.definition ?? '').trim();
        fillMeaning(this.definition);
      },
      error: (error: HttpErrorResponse) => {
        this.isAutoFilling = false;
        this.cardError = this.readAiError(error, 'Az angol definíció generálása');
      },
    });
  }

  // ---------- import / export

  exportDeck(): void {
    if (this.selectedDeckId === null) {
      return;
    }

    this.errorMessage = null;
    this.isExporting = true;
    this.http.get(`/api/decks/${this.selectedDeckId}/export`, {
      observe: 'response',
      responseType: 'blob',
    }).pipe(
      finalize(() => {
        this.isExporting = false;
      }),
    ).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.errorMessage = 'A pakli exportja sikertelen.';
          return;
        }

        const fileName = this.fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? 'pakli.csv';
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        this.toast(`Exportálva: ${fileName}`);
      },
      error: (error: HttpErrorResponse) => {
        this.readBlobError(error, 'A pakli exportja sikertelen.').then(message => {
          this.errorMessage = message;
        });
      },
    });
  }

  downloadCsvTemplate(): void {
    const sample = 'term,definition,example,targetMeanings,tags\n'
      + '"serendipity","The occurrence of pleasant events by chance.","It was pure serendipity.","szerencsés véletlen","főnév, b2"\n'
      + '"resilient","Able to recover quickly from difficulty.","","rugalmas, ellenálló","melléknév"\n';
    const url = URL.createObjectURL(new Blob(['﻿' + sample], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'minta-pakli.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  importDeck(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    const reader = new FileReader();
    reader.onload = () => {
      const csv = typeof reader.result === 'string' ? reader.result : '';
      this.sendImport(deckId, csv);
    };
    reader.onerror = () => {
      this.errorMessage = 'A CSV fájl beolvasása sikertelen.';
    };
    reader.readAsText(file);
  }

  private sendImport(deckId: number, csv: string): void {
    this.errorMessage = null;
    this.importMessage = null;
    this.importSkipped = [];
    this.isImporting = true;
    this.http.post<ImportResult>(`/api/decks/${deckId}/import`, csv, {
      headers: { 'Content-Type': 'text/csv' },
    }).pipe(
      finalize(() => {
        this.isImporting = false;
      }),
    ).subscribe({
      next: (result) => {
        this.showImportResult(deckId, result);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A CSV import sikertelen.');
      },
    });
  }

  private showImportResult(deckId: number, result: ImportResult): void {
    this.importSkipped = result.skippedRows ?? [];
    this.importMessage = result.skippedCount > 0
      ? `${result.importedCount} kártya került be, ${result.skippedCount} sor kimaradt${result.skippedCount > this.importSkipped.length ? ' (az első ' + this.importSkipped.length + ' hiba látszik)' : ''}.`
      : `${result.importedCount} kártya került be.`;
    this.refreshDecks();
    if (this.selectedDeckId === deckId) {
      this.detailTab = 'cards';
      this.loadCards();
    }
  }

  // ---------- import szövegből (Quizlet-stílus)

  openPasteImport(): void {
    if (this.selectedDeckId === null) {
      return;
    }

    this.pasteText = '';
    this.pasteRows = [];
    this.pasteError = null;
    this.pasteAiDone = 0;
    this.pasteAiTotal = 0;
    this.pasteOpen = true;
    this.loadAiFillSettings();
  }

  requestClosePaste(): void {
    if (this.pasteSaving) {
      return;
    }

    if (this.pasteRows.length === 0) {
      this.closePaste();
      return;
    }

    this.pendingConfirm = {
      title: 'Bezárod a beillesztést?',
      message: 'A beolvasott sorok és a kitöltött mezők elvesznek, ha nem mented őket.',
      confirmLabel: 'Bezárás',
      danger: true,
      action: () => this.closePaste(),
    };
  }

  private closePaste(): void {
    this.cancelPasteAi();
    this.pasteOpen = false;
    this.pasteRows = [];
    this.pasteError = null;
  }

  parsePaste(): void {
    this.pasteError = null;
    this.pasteAiDone = 0;
    this.pasteAiTotal = 0;
    const rows = this.splitPaste();
    if (rows.length > this.maxImportRows) {
      this.pasteRows = [];
      this.pasteError = `${rows.length} sor található, de legfeljebb ${this.maxImportRows} importálható egyszerre.`;
      return;
    }

    this.pasteRows = rows;
    if (rows.length === 0) {
      this.pasteError = 'Nem található feldolgozható sor.';
      return;
    }

    if (this.pasteAuto) {
      this.startPasteAi();
    }
  }

  removePasteRow(index: number): void {
    this.pasteRows = this.pasteRows.filter((_, position) => position !== index);
  }

  rowIssue(row: PasteRow): string | null {
    if (!row.term.trim()) {
      return 'Hiányzik a szó.';
    }

    if (row.term.trim().length > 100) {
      return 'A szó legfeljebb 100 karakter lehet.';
    }

    if (!row.definition.trim()) {
      return 'Hiányzik a definíció.';
    }

    if (row.definition.trim().length > 500) {
      return 'A definíció legfeljebb 500 karakter lehet.';
    }

    if (row.example.trim().length > 500) {
      return 'A példamondat legfeljebb 500 karakter lehet.';
    }

    if (row.targetMeanings.trim().length > 300) {
      return 'A magyar jelentés legfeljebb 300 karakter lehet.';
    }

    return null;
  }

  startPasteAi(): void {
    if (this.pasteAiRunning || this.selectedDeckId === null) {
      return;
    }

    if (!this.pasteRows.some(row => this.needsAiFill(row) || this.needsMeaningSimplify(row))) {
      this.pasteError = 'Nincs mit kitölteni: minden sorban van definíció és példamondat.';
      return;
    }

    this.confirmAiLevel(
      this.pasteSimplify
        ? 'a definíciókat és a példamondatokat, és egyszerűsíti a magyar jelentéseket'
        : 'a definíciókat és a példamondatokat',
      () => this.runPasteAi());
  }

  private runPasteAi(): void {
    const deckId = this.selectedDeckId;
    if (this.pasteAiRunning || deckId === null) {
      return;
    }

    // A nem küldhető sorok mellé kiírjuk az okot, hogy ne maradjanak magyarázat nélkül üresen.
    for (const row of this.pasteRows) {
      row.aiError = this.needsAiFill(row) || this.needsMeaningSimplify(row) ? this.aiSkipReason(row) : null;
    }

    const targets = this.pasteRows.filter(row => this.isAiEligible(row));
    const skipped = this.pasteRows.filter(row => row.aiError).length;
    if (targets.length === 0) {
      this.pasteError = `${skipped} sort nem lehet MI-vel kitölteni, részletek a sorok mellett.`;
      return;
    }

    const size = Math.min(10, Math.max(1, this.aiFillBatchSize));
    const batches: PasteRow[][] = [];
    for (let start = 0; start < targets.length; start += size) {
      batches.push(targets.slice(start, start + size));
    }

    this.pasteError = null;
    this.pasteAiDone = 0;
    this.pasteAiTotal = targets.length;
    this.pasteAiRunning = true;
    this.runPasteBatch(deckId, batches, 0);
  }

  /** A „nincs magyar jelentés” sávból: bekapcsolja a jelentéskészítést, és rögtön el is indítja az MI-kitöltést. */
  fillPasteMeanings(): void {
    this.pasteSimplify = true;
    this.startPasteAi();
  }

  cancelPasteAi(): void {
    this.pasteAiSub?.unsubscribe();
    this.pasteAiSub = null;
    this.pasteAiRunning = false;
  }

  savePaste(): void {
    const deckId = this.selectedDeckId;
    if (deckId === null || !this.canSavePaste) {
      return;
    }

    this.pasteSaving = true;
    this.pasteError = null;
    const cards = this.pasteRows.map(row => ({
      term: row.term.trim(),
      definition: row.definition.trim(),
      example: row.example.trim() || null,
      targetMeanings: row.targetMeanings.trim() || null,
    }));
    this.http.post<ImportResult>(`/api/decks/${deckId}/import/cards`, { cards }).pipe(
      finalize(() => {
        this.pasteSaving = false;
      }),
    ).subscribe({
      next: (result) => {
        this.closePaste();
        this.showImportResult(deckId, result);
      },
      error: (error: HttpErrorResponse) => {
        this.pasteError = this.readError(error, 'Az import sikertelen.');
      },
    });
  }

  private needsAiFill(row: PasteRow): boolean {
    return !row.definition.trim() || !row.example.trim();
  }

  // Az ok, amiért a sort nem lehet MI-vel kitölteni (a szerver ezeket a hosszakat nem fogadná el); null, ha küldhető.
  private aiSkipReason(row: PasteRow): string | null {
    const term = row.term.trim();
    if (!term) {
      return 'Az MI nem tölti ki: hiányzik a szó.';
    }

    if (term.length > 100) {
      return 'Az MI nem tölti ki: a szó hosszabb 100 karakternél.';
    }

    if (row.definition.trim().length > 500) {
      return 'Az MI nem tölti ki: a definíció hosszabb 500 karakternél.';
    }

    return null;
  }

  private needsMeaningSimplify(row: PasteRow): boolean {
    return this.pasteSimplify && !row.meaningSimplified;
  }

  private isAiEligible(row: PasteRow): boolean {
    return (this.needsAiFill(row) || this.needsMeaningSimplify(row)) && this.aiSkipReason(row) === null;
  }

  // A 300 karakternél hosszabb jelentést az utolsó vesszőig vágjuk le (ha nincs vessző, keményen), hogy ne maradjon félbevágott szó.
  private clampMeanings(value: string): string {
    const text = value.trim();
    if (text.length <= 300) {
      return text;
    }

    const cut = text.slice(0, 300);
    const comma = cut.lastIndexOf(',');
    return (comma > 0 ? cut.slice(0, comma) : cut).trim();
  }

  private meaningHint(value: string): string | null {
    return this.clampMeanings(value) || null;
  }

  private runPasteBatch(deckId: number, batches: PasteRow[][], position: number): void {
    if (position >= batches.length) {
      this.pasteAiRunning = false;
      this.pasteAiSub = null;
      const failed = this.pasteRows.filter(row => row.aiError).length;
      if (failed > 0) {
        this.pasteError = `${failed} sort nem sikerült kitölteni az MI-vel: töltsd ki kézzel, vagy próbáld újra.`;
      }

      return;
    }

    const batch = batches[position];
    const items = batch.map(row => ({
      term: row.term.trim(),
      targetMeanings: this.meaningHint(row.targetMeanings),
      simplifyMeaning: this.needsMeaningSimplify(row),
      needDefinition: !row.definition.trim(),
      needExample: !row.example.trim(),
      definition: row.definition.trim() || null,
    }));
    this.pasteAiSub = this.http.post<DeckFillResponse>('/api/ai/generate/deck-fill', { deckId, items }).subscribe({
      next: (response) => {
        for (const item of response.items) {
          const row = batch[item.index];
          if (!row) {
            continue;
          }

          // Közben kézzel beírt tartalmat nem írunk felül.
          if (item.definition && !row.definition.trim()) {
            row.definition = item.definition;
          }

          if (item.example && !row.example.trim()) {
            row.example = item.example;
          }

          if (item.targetMeanings) {
            row.targetMeanings = item.targetMeanings;
            row.meaningSimplified = true;
          }

          row.aiError = item.error;
        }

        this.aiFillRemaining = response.remainingToday;
        this.aiFillLimit = response.dailyLimit;
        this.pasteAiDone += batch.length;
        this.runPasteBatch(deckId, batches, position + 1);
      },
      error: (error: HttpErrorResponse) => {
        this.pasteAiRunning = false;
        this.pasteAiSub = null;
        this.pasteError = error.status === 429
          ? 'Elérted a mai MI-kitöltési keretet.'
          : this.readAiError(error, 'Az MI-kitöltés');
      },
    });
  }

  private splitPaste(): PasteRow[] {
    const text = this.pasteText.replace(/\r\n?/g, '\n');
    const rowSeparator = this.pasteRowSep === 'semicolon'
      ? ';'
      : this.pasteRowSep === 'custom' ? this.unescapeSeparator(this.pasteRowCustom) : '\n';
    const termSeparator = this.pasteTermSep === 'comma'
      ? ','
      : this.pasteTermSep === 'custom' ? this.unescapeSeparator(this.pasteTermCustom) : '\t';

    const rows: PasteRow[] = [];
    this.pasteTrimmedCount = 0;
    for (const chunk of text.split(rowSeparator || '\n')) {
      const line = chunk.trim();
      if (!line) {
        continue;
      }

      // Az első elválasztónál vágunk, így a vesszővel tagolt magyar jelentéslista egyben marad.
      const at = termSeparator ? line.indexOf(termSeparator) : -1;
      const term = (at < 0 ? line : line.slice(0, at)).trim();
      const meanings = at < 0 ? '' : line.slice(at + termSeparator.length).trim();
      const clampedTerm = term.slice(0, 100).trim();
      const clampedMeanings = this.clampMeanings(meanings);
      if (clampedTerm !== term || clampedMeanings !== meanings) {
        this.pasteTrimmedCount++;
      }

      rows.push({
        term: clampedTerm,
        definition: '',
        example: '',
        targetMeanings: clampedMeanings,
        aiError: null,
        meaningSimplified: false,
      });
    }

    return rows;
  }

  private unescapeSeparator(value: string): string {
    return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  private loadAiFillSettings(): void {
    this.http.get<AiFillSettings>('/api/study/settings').subscribe({
      next: (settings) => {
        this.accountLevel = settings.exampleLevel;
        this.aiFillBatchSize = settings.aiFillBatchSize ?? 5;
        this.aiFillLimit = settings.aiFillDailyLimit ?? 100;
        this.aiFillRemaining = settings.aiFillRemainingToday ?? null;
      },
    });
  }

  // ---------- közös paklik

  onPublicQueryChange(): void {
    if (this.publicSearchTimer) {
      clearTimeout(this.publicSearchTimer);
    }

    this.publicSearchTimer = setTimeout(() => {
      this.publicSearchTimer = null;
      this.searchPublicDecks();
    }, 300);
  }

  onPublicSortChange(): void {
    // Számszerű és időrendi szempontnál a legnagyobb/legfrissebb az érdekes elöl, névnél az ábécé.
    this.publicDesc = this.publicSort !== 'name';
    this.searchPublicDecks();
  }

  togglePublicSortDirection(): void {
    this.publicDesc = !this.publicDesc;
    this.searchPublicDecks();
  }

  filterByOwner(username: string): void {
    this.publicOwner = username;
    this.searchPublicDecks();
  }

  searchPublicDecks(): void {
    this.isLoadingPublic = true;
    const params: Record<string, string> = { sort: this.publicSort, desc: String(this.publicDesc) };
    if (this.publicQuery.trim()) {
      params['q'] = this.publicQuery.trim();
    }

    if (this.publicOwner.trim()) {
      params['owner'] = this.publicOwner.trim();
    }

    this.http.get<PublicDeck[]>('/api/decks/public', { params }).pipe(
      finalize(() => {
        this.isLoadingPublic = false;
      }),
    ).subscribe({
      next: (decks) => {
        this.publicDecks = decks;
        if (this.previewDeckId !== null && !decks.some(deck => deck.id === this.previewDeckId)) {
          this.previewDeckId = null;
          this.previewCards = [];
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A közös paklik betöltése sikertelen.');
      },
    });
  }

  togglePreview(deck: PublicDeck): void {
    if (this.previewDeckId === deck.id) {
      this.previewRequest++;
      this.previewDeckId = null;
      this.previewCards = [];
      this.isLoadingPreview = false;
      return;
    }

    const request = ++this.previewRequest;
    this.errorMessage = null;
    this.previewDeckId = deck.id;
    this.previewCards = [];
    this.isLoadingPreview = true;
    this.http.get<VocabCard[]>(`/api/decks/public/${deck.id}/cards`).pipe(
      finalize(() => {
        if (request === this.previewRequest) {
          this.isLoadingPreview = false;
        }
      }),
    ).subscribe({
      next: (cards) => {
        if (request !== this.previewRequest) {
          return;
        }

        this.previewCards = cards;
      },
      error: (error: HttpErrorResponse) => {
        if (request !== this.previewRequest) {
          return;
        }

        this.previewDeckId = null;
        this.previewCards = [];
        this.errorMessage = this.readError(error, 'A pakli előnézete sikertelen.');
      },
    });
  }

  saveNewVersion(deck: Deck): void {
    if (deck.sourceSharedDeckId !== null) {
      this.copyDeck({ id: deck.sourceSharedDeckId, name: deck.name });
    }
  }

  copyDeck(deck: { id: number; name: string }): void {
    if (this.hasDeckNamed(deck.name)) {
      this.askConfirm(
        'Már van ilyen nevű paklid',
        `Már van „${deck.name}” nevű paklid. Biztosan lemásolod még egyszer?`,
        'Másolás mégis',
        false,
        () => this.performCopy(deck),
      );
      return;
    }

    this.performCopy(deck);
  }

  private performCopy(deck: { id: number; name: string }): void {
    this.errorMessage = null;
    this.copyingDeckId = deck.id;
    this.http.post<Deck>(`/api/decks/public/${deck.id}/copy`, {}).pipe(
      finalize(() => {
        this.copyingDeckId = null;
      }),
    ).subscribe({
      next: (copied) => {
        this.decks = [...this.decks, copied].sort((left, right) => left.id - right.id);
        this.section = 'mine';
        this.selectDeck(copied.id, true);
        this.toast(`A(z) „${copied.name}” pakli (${copied.cardCount} kártya) bekerült a saját paklijaid közé.`);
        this.searchPublicDecks();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli másolása sikertelen.');
      },
    });
  }

  // ---------- segédek

  formatLocalTime(value: string | null, emptyText = ''): string {
    if (!value) {
      return emptyText;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  }

  private rememberSelection(deckId: number): void {
    try {
      localStorage.setItem('vocab:decks:selected', String(deckId));
    } catch {
      // A böngésző tárolója nem elérhető, ilyenkor az utolsó pakli nem jegyződik meg.
    }
  }

  private recallSelection(): number | null {
    try {
      const stored = Number(localStorage.getItem('vocab:decks:selected'));
      return Number.isInteger(stored) && stored > 0 ? stored : null;
    } catch {
      return null;
    }
  }

  private fileNameFromDisposition(header: string | null): string | null {
    if (!header) {
      return null;
    }

    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (encoded?.[1]) {
      try {
        return decodeURIComponent(encoded[1].trim().replace(/"/g, ''));
      } catch {
        return encoded[1];
      }
    }

    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain?.[1]?.trim() ?? null;
  }

  private async readBlobError(error: HttpErrorResponse, fallback: string): Promise<string> {
    if (error.error instanceof Blob) {
      try {
        const text = await error.error.text();
        const parsed = JSON.parse(text) as ProblemDetails;
        if (typeof parsed.title === 'string' && parsed.title.trim()) {
          return parsed.title;
        }
      } catch {
        return fallback;
      }
    }

    return this.readError(error, fallback);
  }

  private loadDecks(initial = false): void {
    this.isLoadingDecks = initial;
    this.http.get<Deck[]>('/api/decks').pipe(
      finalize(() => {
        this.isLoadingDecks = false;
      }),
    ).subscribe({
      next: (decks) => {
        this.decks = decks;
        if (initial && this.selectedDeckId === null && !this.viewingLearned && decks.length > 0) {
          const remembered = this.recallSelection();
          const target = decks.find(deck => deck.id === remembered) ?? decks[0];
          this.selectDeck(target.id);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A paklik betöltése sikertelen.');
      },
    });
  }

  /** Csendes frissítés: a számlálók naprakészek, de a lista nem villan fel. */
  private refreshDecks(): void {
    this.loadDecks(false);
  }

  private loadCards(): void {
    if (this.selectedDeckId === null) {
      this.cards = [];
      return;
    }

    const requestId = ++this.cardsRequest;
    const deckId = this.selectedDeckId;
    this.isLoadingCards = true;
    this.cards = [];
    this.http.get<VocabCard[]>(`/api/cards/by-deck/${deckId}`).pipe(
      finalize(() => {
        if (requestId === this.cardsRequest) {
          this.isLoadingCards = false;
        }
      }),
    ).subscribe({
      next: (cards) => {
        if (requestId !== this.cardsRequest || this.viewingLearned || this.selectedDeckId !== deckId) {
          return;
        }

        this.cards = cards;
      },
      error: (error: HttpErrorResponse) => {
        if (requestId !== this.cardsRequest) {
          return;
        }

        this.errorMessage = this.readError(error, 'A kártyák betöltése sikertelen.');
      },
    });
  }

  private loadLearned(): void {
    const requestId = ++this.cardsRequest;
    this.isLoadingCards = true;
    this.learnedCards = [];
    this.http.get<LearnedCard[]>('/api/cards/learned').pipe(
      finalize(() => {
        if (requestId === this.cardsRequest) {
          this.isLoadingCards = false;
        }
      }),
    ).subscribe({
      next: (cards) => {
        if (requestId !== this.cardsRequest || !this.viewingLearned) {
          return;
        }

        this.learnedCards = cards;
      },
      error: (error: HttpErrorResponse) => {
        if (requestId !== this.cardsRequest) {
          return;
        }

        this.errorMessage = this.readError(error, 'A megtanult szavak betöltése sikertelen.');
      },
    });
  }

  private appendMeanings(current: string, generated: string): string {
    const existing = current.trim();
    const addition = generated.trim();
    if (!addition) {
      return existing;
    }

    if (!existing) {
      return addition;
    }

    return `${existing}, ${addition}`;
  }

  private readAiError(error: HttpErrorResponse, context: string): string {
    if (error.status === 503) {
      return `${context} sikertelen: az MI-szolgáltatás nincs konfigurálva.`;
    }

    if (error.status === 502) {
      return `${context} sikertelen: az MI-szolgáltató nem adott megfelelő választ.`;
    }

    return `${context} sikertelen. Kérlek, próbáld újra.`;
  }

  private readError(error: HttpErrorResponse, fallback: string): string {
    const title = (error.error as ProblemDetails | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      return title;
    }

    return fallback;
  }
}
