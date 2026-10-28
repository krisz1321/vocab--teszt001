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
    <main>
      <div class="page-wrap decks-page">
        <header>
          <div>
            <h1>Paklik</h1>
            <p>Hozz létre, szerkessz és oszd meg a szókártya-paklijaidat.</p>
          </div>
          <div class="dseg page-tabs" role="tablist" aria-label="Paklik">
            <button type="button" role="tab" class="dseg-btn" [class.active]="section === 'mine'" [attr.aria-selected]="section === 'mine'" (click)="setSection('mine')">
              Saját paklik <span class="dseg-count">{{ decks.length }}</span>
            </button>
            <button type="button" role="tab" class="dseg-btn" [class.active]="section === 'public'" [attr.aria-selected]="section === 'public'" (click)="setSection('public')">
              Közös paklik <span class="dseg-count">{{ publicDecks.length }}</span>
            </button>
          </div>
        </header>

        @if (errorMessage) {
          <div role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" aria-label="Bezárás" (click)="errorMessage = null"></button>
          </div>
        }

        @if (section === 'mine') {
          <div class="deck-layout" [class.show-detail]="mobileDetailOpen">
            <aside class="deck-list-panel" aria-label="Paklijaim">
              <div>
                <h2 class="panel-title">Paklijaim</h2>
                <button type="button" (click)="toggleCreate()" [attr.aria-expanded]="creating">
                  {{ creating ? 'Mégse' : '+ Új pakli' }}
                </button>
              </div>

              @if (decks.length > 0) {
                <input
                  type="search"
                  name="globalSearch"
                  placeholder="Keresés minden pakliban…"
                  aria-label="Keresés minden pakliban"
                  autocomplete="off"
                  [(ngModel)]="globalQuery"
                  (ngModelChange)="onGlobalSearchChange()">
                @if (globalActive) {
                  @if (isGlobalSearching && globalResults.length === 0) {
                    <div class="loading" role="status"><div class="spinner spinner-sm"></div></div>
                  } @else if (globalResults.length === 0) {
                    <p>Nincs találat.</p>
                  } @else {
                    <ul class="deck-list global-results" aria-label="Keresési találatok">
                      @for (result of globalResults; track result.id) {
                        <li>
                          <button type="button" class="deck-item" (click)="openSearchResult(result)">
                            <span>
                              <span class="deck-name">{{ result.term }}</span>
                              <span class="chip" [attr.title]="'Pakli: ' + result.deckName">{{ result.deckName }}</span>
                            </span>
                            <span class="deck-meta">{{ result.definition }}</span>
                            @if (result.isLeech || result.suspension !== 'none' || result.tags) {
                              <span>
                                @if (result.isLeech) {
                                  <span class="chip chip-leech">Nehéz szó</span>
                                }
                                @if (result.suspension === 'suspended') {
                                  <span class="chip chip-paused">Felfüggesztve</span>
                                } @else if (result.suspension === 'buried') {
                                  <span class="chip chip-paused">Elnapolva holnapig</span>
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
                  <label for="deckName">A pakli neve</label>
                  <input
                    id="deckName"
                    name="deckName"
                    maxlength="100"
                    placeholder="pl. Utazás, Munka, B2 igék"
                    autocomplete="off"
                    [(ngModel)]="newDeckName"
                    [disabled]="isSavingDeck">
                  <label for="deckDescription">Leírás (nem kötelező)</label>
                  <textarea
                    id="deckDescription"
                    name="deckDescription"
                    rows="2"
                    maxlength="500"
                    placeholder="Miről szól a pakli? Mások ebben is kereshetnek."
                    [(ngModel)]="newDeckDescription"
                    [disabled]="isSavingDeck"></textarea>
                  <label for="deckLevel">Mondatszint</label>
                  <select
                    id="deckLevel"
                    name="deckLevel"
                    [(ngModel)]="newDeckLevel"
                    [disabled]="isSavingDeck">
                    @for (level of exampleLevels; track level) {
                      <option [value]="level">{{ level }}{{ level === accountLevel ? ' (fiók szintje)' : '' }}</option>
                    }
                  </select>
                  <div>Az MI ilyen nehézségű definíciókat és példamondatokat készít a paklihoz. Később a pakli beállításaiban átállíthatod.</div>
                  <div>
                    <button type="submit" [disabled]="isSavingDeck || !newDeckName.trim()">
                      @if (isSavingDeck) {
                        <span class="spinner spinner-sm"></span>
                      }
                      Létrehozás
                    </button>
                    <button type="button" (click)="toggleCreate()">Mégse</button>
                  </div>
                </form>
              }

              @if (isLoadingDecks) {
                <div class="loading" role="status">
                  <div class="spinner"></div>
                </div>
              } @else {
                @if (decks.length === 0) {
                  <div class="empty-box">
                    <p>Még nincs paklid</p>
                    <p>Hozz létre egy újat, vagy másolj le egy kész paklit a közösből.</p>
                    <div>
                      <button type="button" (click)="creating = true">+ Új pakli</button>
                      <button type="button" (click)="setSection('public')">Kész paklik böngészése</button>
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
                        <span>
                          <span class="deck-name">{{ deck.name }}</span>
                          <span>
                            @if (deck.isPublic && deck.share; as share) {
                              <span class="chip chip-shared" title="Ez a pakli megosztva van">Megosztva · v{{ share.version }}</span>
                              @if (share.hasUnpublishedChanges) {
                                <span class="chip chip-pending" title="A legutóbbi megosztás óta módosult. Frissítsd a Beállítások és megosztás fülön.">Frissítésre vár</span>
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
                        <span class="mini-progress" aria-hidden="true"><span></span></span>
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
                <div role="status">
                  <div>{{ importMessage }}</div>
                  @if (importSkipped.length > 0) {
                    <ul>
                      @for (line of importSkipped; track $index) {
                        <li>{{ line }}</li>
                      }
                    </ul>
                  }
                  <button type="button" aria-label="Bezárás" (click)="importMessage = null; importSkipped = []"></button>
                </div>
              }

              @if (viewingLearned) {
                <button type="button" class="back-link" (click)="closeDetail()">← Vissza a paklikhoz</button>
                <div class="detail-head">
                  <h2>Megtanult szavak</h2>
                  <div>Az összes paklidból azok a kártyák, amelyeket már megtanultál.</div>
                </div>
                <div class="toolbar">
                  <input
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
                  <div class="loading" role="status"><div class="spinner"></div></div>
                } @else if (learnedCards.length === 0) {
                  <div class="empty-box">
                    <p>Még nincs megtanult szavad</p>
                    <p>Ide kerül az a kártya, amire tanulás közben elég sokszor jól válaszoltál, vagy „Ismerem”-nek jelöltél.</p>
                  </div>
                } @else if (visibleLearned.length === 0) {
                  <div class="empty-box"><p>Nincs a keresésnek megfelelő szó.</p></div>
                } @else {
                  <ul class="card-rows">
                    @for (card of visibleLearned; track card.id) {
                      <li class="card-row">
                        <div class="card-main">
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
                <button type="button" class="back-link" (click)="closeDetail()">← Vissza a paklikhoz</button>
                <div class="detail-head">
                  <div>
                    <div class="min-w-0">
                      <h2>{{ deck.name }}</h2>
                      @if (deck.description) {
                        <p class="deck-description">{{ deck.description }}</p>
                      }
                      <div>
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
                    <div>
                      <button
                        type="button"
                        [disabled]="deck.cardCount === 0"
                        [attr.title]="deck.cardCount === 0 ? 'Előbb vegyél fel kártyát' : 'Tanulás ezzel a paklival'"
                        (click)="studyDeck.emit(deck.id)">
                        Tanulás
                      </button>
                      <button type="button" (click)="openNewCard()">+ Új kártya</button>
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
                      <div>
                        <h3>{{ editingCardId === null ? 'Új kártya' : 'Kártya szerkesztése' }}</h3>
                        <button type="button" aria-label="Szerkesztő bezárása" (click)="closeEditor()"></button>
                      </div>
                      <div>
                        <div>
                          <label for="card-term">Szó vagy kifejezés</label>
                          <input
                            id="card-term"
                            name="term"
                            maxlength="100"
                            autocomplete="off"
                            placeholder="pl. serendipity"
                            [(ngModel)]="term"
                            [disabled]="isSavingCard">
                        </div>
                        <div>
                          <button
                            type="button"
                            class="w-md-auto"
                            (click)="autoFill()"
                            [disabled]="!term.trim() || isSavingCard || isBusyAi"
                            title="Az MI kitölti az angol definíciót és a magyar jelentést, ha még üresek">
                            @if (isAutoFilling) {
                              <span class="spinner spinner-sm"></span>
                            }
                            Kitöltés MI-vel
                          </button>
                        </div>
                        <div>
                          <div>
                            <label for="card-definition">Angol definíció</label>
                            <button type="button" (click)="generateDefinition()" [disabled]="isBusyAi || isSavingCard || !term.trim()">
                              @if (isGeneratingDefinition) {
                                <span class="spinner spinner-sm"></span>
                              }
                              Generálás
                            </button>
                          </div>
                          <textarea
                            id="card-definition"
                            name="definition"
                            rows="2"
                            maxlength="500"
                            [(ngModel)]="definition"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard || isGeneratingDefinition"></textarea>
                        </div>
                        <div>
                          <div>
                            <label for="card-meanings">Magyar jelentés</label>
                            <button type="button" (click)="generateTargetMeaning()" [disabled]="isBusyAi || isSavingCard || !term.trim() || !definition.trim()">
                              @if (isGeneratingTargetMeaning) {
                                <span class="spinner spinner-sm"></span>
                              }
                              Generálás
                            </button>
                          </div>
                          <textarea
                            id="card-meanings"
                            name="targetMeanings"
                            rows="2"
                            maxlength="300"
                            placeholder="étel, kaja"
                            [(ngModel)]="targetMeanings"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard || isGeneratingTargetMeaning"></textarea>
                          <div>Több elfogadott alak vesszővel elválasztva.</div>
                        </div>
                        <div>
                          <label for="card-example">Példamondat (nem kötelező)</label>
                          <textarea
                            id="card-example"
                            name="example"
                            rows="2"
                            maxlength="500"
                            [(ngModel)]="example"
                            (keydown.control.enter)="saveCard()"
                            [disabled]="isSavingCard"></textarea>
                        </div>
                        <div>
                          <label for="card-tags">Címkék (nem kötelező)</label>
                          <input
                            id="card-tags"
                            name="tags"
                            maxlength="150"
                            autocomplete="off"
                            placeholder="ige, b2, utazás"
                            [(ngModel)]="tags"
                            [disabled]="isSavingCard">
                          <div>Legfeljebb {{ maxTags }} címke, vesszővel elválasztva, egyenként legfeljebb {{ maxTagLength }} karakter.</div>
                        </div>
                      </div>
                      @if (cardError) {
                        <div role="alert">{{ cardError }}</div>
                      }
                      <div>
                        <button type="submit" [disabled]="isSavingCard || isBusyAi">
                          @if (isSavingCard) {
                            <span class="spinner spinner-sm"></span>
                          }
                          {{ editingCardId === null ? 'Kártya felvétele' : 'Mentés' }}
                        </button>
                        <button type="button" [disabled]="isSavingCard" (click)="closeEditor()">
                          {{ editingCardId === null ? 'Kész' : 'Mégse' }}
                        </button>
                        <span>Ctrl + Enter: mentés</span>
                      </div>
                    </form>
                  }

                  @if (isLoadingCards) {
                    <div class="loading" role="status"><div class="spinner"></div></div>
                  } @else if (cards.length === 0) {
                    <div class="empty-box">
                      <p>Ebben a pakliban még nincs kártya</p>
                      <p>Vegyél fel kártyákat kézzel, tölts fel egy CSV-t, vagy másolj le egy kész paklit.</p>
                      <div>
                        <button type="button" (click)="openNewCard()">+ Első kártya felvétele</button>
                        <button type="button" (click)="openSettings()">CSV importálása</button>
                        <button type="button" (click)="setSection('public')">Kész paklik böngészése</button>
                      </div>
                    </div>
                  } @else {
                    <div class="toolbar">
                      <input
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
                        <select class="tag-select" name="tagFilter" aria-label="Szűrés címkére" [(ngModel)]="tagFilter">
                          <option value="">Minden címke</option>
                          @for (tag of deckTags; track tag) {
                            <option [value]="tag">{{ tag }}</option>
                          }
                        </select>
                      }
                    </div>
                    @if (cardSearch.trim() || cardFilter !== 'all' || activeTagFilter) {
                      <div>{{ visibleCards.length }} / {{ cards.length }} kártya</div>
                    }
                    @if (visibleCards.length === 0) {
                      <div class="empty-box"><p>Nincs a szűrésnek megfelelő kártya.</p></div>
                    } @else {
                      <ul class="card-rows">
                        @for (card of visibleCards; track card.id) {
                          <li class="card-row" [class.is-editing]="editingCardId === card.id">
                            <div class="card-main">
                              <div class="card-term">
                                {{ card.term }}
                                @if (card.isLearned) {
                                  <span class="chip chip-ok">Megtanult</span>
                                }
                                @if (card.isLeech) {
                                  <span class="chip chip-leech" title="Sokszor elrontott szó. A küszöböt a Beállításokban állíthatod („Nehéz szó küszöbe”).">Nehéz szó</span>
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
                              <div [attr.title]="card.isLearned ? 'Megtanult szó. Kikapcsolva újra tanulandó lesz.' : 'Jelöld, ha már ismered, és nem akarod tanulni'">
                                <input
                                  type="checkbox"
                                  role="switch"
                                  [id]="'known-' + card.id"
                                  [checked]="card.isLearned"
                                  [disabled]="markingKnownCardId === card.id"
                                  (change)="setKnown(card, $event)">
                                <label [attr.for]="'known-' + card.id">Ismerem</label>
                              </div>
                              @if (card.suspension === 'none') {
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'buried')"
                                  [attr.aria-label]="'Elnapolás holnapig: ' + card.term"
                                  title="Elnapolás holnapig">
                                  Elnapolás
                                </button>
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'suspended')"
                                  [attr.aria-label]="'Felfüggesztés: ' + card.term"
                                  title="Felfüggesztés, amíg vissza nem kapcsolod">
                                  Felfüggesztés
                                </button>
                              } @else {
                                <button
                                  type="button"
                                  class="icon-btn"
                                  [disabled]="suspendingCardId === card.id"
                                  (click)="setSuspension(card, 'none')"
                                  [attr.aria-label]="'Visszakapcsolás a tanulásba: ' + card.term"
                                  title="Visszakapcsolás a tanulásba">
                                  Visszakapcsolás
                                </button>
                              }
                              <button type="button" class="icon-btn" (click)="editCard(card)" [attr.aria-label]="'Szerkesztés: ' + card.term" title="Szerkesztés">
                                Szerkesztés
                              </button>
                              <button
                                type="button"
                                class="icon-btn icon-btn-danger"
                                [disabled]="deletingCardId === card.id"
                                (click)="deleteCard(card)"
                                [attr.aria-label]="'Törlés: ' + card.term"
                                title="Törlés">
                                Törlés
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
                      <h3>Pakli neve</h3>
                      <form (ngSubmit)="renameDeck(deck)">
                        <input
                          id="rename-deck"
                          name="renameDraft"
                          maxlength="100"
                          autocomplete="off"
                          aria-label="Pakli neve"
                          [(ngModel)]="renameDraft"
                          [disabled]="isRenaming">
                        <button type="submit" [disabled]="isRenaming || !renameDraft.trim() || renameDraft.trim() === deck.name">
                          @if (isRenaming) {
                            <span class="spinner spinner-sm"></span>
                          }
                          Átnevezés
                        </button>
                      </form>
                    </section>

                    <section class="setting-block">
                      <h3>Leírás</h3>
                      <p>Rövid leírás a paklihoz. Megosztáskor a Közös paklik között is látszik, és a keresés is használja.</p>
                      <form (ngSubmit)="saveDescription(deck)">
                        <textarea
                          id="deck-description"
                          name="descriptionDraft"
                          rows="3"
                          maxlength="500"
                          aria-label="Pakli leírása"
                          [(ngModel)]="descriptionDraft"
                          [disabled]="isSavingDescription"></textarea>
                        <div>
                          <button type="submit" [disabled]="isSavingDescription || descriptionDraft.trim() === (deck.description ?? '')">
                            @if (isSavingDescription) {
                              <span class="spinner spinner-sm"></span>
                            }
                            Leírás mentése
                          </button>
                          <span>{{ descriptionDraft.length }}/500</span>
                        </div>
                      </form>
                    </section>

                    <section class="setting-block">
                      <h3>Példamondatok szintje</h3>
                      <p>Az MI ilyen nehézségű példamondatokat és definíciókat készít a paklihoz. Ha nem választasz, a fiókod szintje ({{ accountLevel }}) számít.</p>
                      <div>
                        <select
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
                          <span class="spinner spinner-sm"></span>
                        }
                      </div>
                    </section>

                    <section class="setting-block">
                      <h3>Megosztás</h3>
                      @if (deck.isPublic && deck.share; as share) {
                        <p>
                          <span class="chip chip-shared">Megosztva · v{{ share.version }}</span>
                          A pakli látszik a <strong>Közös paklik</strong> között ({{ deck.exampleLevel ?? accountLevel }} szinttel). Mások megnézhetik és lemásolhatják, de a tiédet nem módosíthatják.
                        </p>
                        <dl class="share-stats">
                          <div><dt>Verzió</dt><dd>v{{ share.version }}</dd></div>
                          <div><dt>Megosztva</dt><dd>{{ formatLocalTime(share.sharedAt) }}</dd></div>
                          <div><dt>Utoljára frissítve</dt><dd>{{ formatLocalTime(share.updatedAt) }}</dd></div>
                          <div><dt>Lementették</dt><dd>{{ share.saveCount }} felhasználó</dd></div>
                        </dl>
                        @if (share.hasUnpublishedChanges) {
                          <div role="status">
                            A legutóbbi megosztás óta módosítottad a paklit. A Közös paklik között még a v{{ share.version }} látszik.
                          </div>
                          <button
                            type="button"
                            [disabled]="publishingDeckId === deck.id || deck.cardCount === 0"
                            (click)="publishUpdate(deck)">
                            @if (publishingDeckId === deck.id) {
                              <span class="spinner spinner-sm"></span>
                            }
                            Megosztás frissítése (v{{ share.version + 1 }})
                          </button>
                        } @else {
                          <p>A megosztott verzió megegyezik a paklival. Ha módosítod, itt frissítheted a megosztást.</p>
                        }
                        <button type="button" [disabled]="sharingDeckId === deck.id" (click)="toggleShare(deck)">
                          @if (sharingDeckId === deck.id) {
                            <span class="spinner spinner-sm"></span>
                          }
                          Megosztás visszavonása
                        </button>
                      } @else {
                        <p>
                          Megosztva a pakli bekerül a <strong>Közös paklik</strong> közé: mások megnézhetik és lemásolhatják, de az eredetit nem módosíthatják. A felhasználóneved is látszik mellette. A megosztás a pakli mostani állapotát teszi közzé, a későbbi módosításokat a „Megosztás frissítése" gombbal publikálhatod új verzióként. Bármikor visszavonhatod.
                        </p>
                        @if (deck.share; as past) {
                          <p>
                            Ez a pakli korábban meg volt osztva (v{{ past.version }}, {{ past.saveCount }} mentés). Újra megosztva ezek az adatok megmaradnak.
                          </p>
                        }
                        <button
                          type="button"
                          [disabled]="sharingDeckId === deck.id || deck.cardCount === 0"
                          [attr.title]="deck.cardCount === 0 ? 'Üres paklit nem érdemes megosztani' : null"
                          (click)="toggleShare(deck)">
                          @if (sharingDeckId === deck.id) {
                            <span class="spinner spinner-sm"></span>
                          }
                          Pakli megosztása
                        </button>
                        @if (deck.cardCount === 0) {
                          <span>Előbb vegyél fel kártyát.</span>
                        }
                      }
                    </section>

                    @if (deck.sourceVersion !== null) {
                      <section class="setting-block">
                        <h3>Forrás</h3>
                        <p>Ezt a paklit a Közös paklik közül mentetted le (v{{ deck.sourceVersion }}). A tartalma nem változik, ha a készítő frissíti a megosztását.</p>
                        @if (deck.updateAvailable && deck.sourceSharedDeckId !== null) {
                          <p><span class="chip chip-pending">Új verzió: v{{ deck.latestSharedVersion }}</span> A készítő újabb verziót tett közzé.</p>
                          <button type="button" [disabled]="copyingDeckId === deck.sourceSharedDeckId" (click)="saveNewVersion(deck)">
                            @if (copyingDeckId === deck.sourceSharedDeckId) {
                              <span class="spinner spinner-sm"></span>
                            }
                            Új verzió mentése új paklinak
                          </button>
                        }
                      </section>
                    }

                    <section class="setting-block">
                      <h3>Import és export</h3>
                      <p>
                        CSV fájl <code>term,definition,example</code> fejléccel (opcionálisan <code>,targetMeanings</code> és <code>,tags</code> oszloppal), legfeljebb {{ maxImportRows }} sorral. A hibás sorok kimaradnak, a többi bekerül. Beillesztett szöveget (pl. Quizletből) is importálhatsz, ilyenkor az MI kitöltheti a definíciót és a példamondatot.
                      </p>
                      <div>
                        <button type="button" [disabled]="isImporting" (click)="openPasteImport()">Beillesztés szövegből</button>
                        <label [class.disabled]="isImporting">
                          @if (isImporting) {
                            <span class="spinner spinner-sm"></span>
                          }
                          CSV importálása
                          <input type="file" accept=".csv,text/csv" [disabled]="isImporting" (change)="importDeck($event)">
                        </label>
                        <button type="button" [disabled]="isExporting || deck.cardCount === 0" (click)="exportDeck()">
                          @if (isExporting) {
                            <span class="spinner spinner-sm"></span>
                          }
                          Exportálás CSV-be
                        </button>
                        <button type="button" (click)="downloadCsvTemplate()">Minta CSV letöltése</button>
                      </div>
                    </section>

                    <section class="setting-block danger-zone">
                      <h3>Veszélyes terület</h3>
                      <p>A pakli törlésével a kártyái és a hozzájuk tartozó tanulási adatok is véglegesen törlődnek.</p>
                      <button type="button" [disabled]="deletingDeckId === deck.id" (click)="deleteDeck(deck)">
                        Pakli törlése
                      </button>
                    </section>
                  </div>
                }
              } @else if (!isLoadingDecks) {
                <div class="empty-box empty-box-lg">
                  <p>Válassz egy paklit</p>
                  <p>Válassz paklit a bal oldali listából a kártyák szerkesztéséhez, vagy hozz létre egy újat.</p>
                  <button type="button" (click)="creating = true">+ Új pakli</button>
                </div>
              }
              }
            </section>
          </div>
        } @else {
          <section aria-label="Közös paklik">
            <p>Más felhasználók megosztott paklijai. Nézd meg a tartalmukat, és másold a sajátjaid közé, ha tetszik.</p>
            <form class="toolbar" (ngSubmit)="searchPublicDecks()">
              <input
                type="search"
                name="publicQuery"
                placeholder="Keresés a nevekben és leírásokban…"
                aria-label="Keresés a közös paklik között"
                [(ngModel)]="publicQuery"
                (ngModelChange)="onPublicQueryChange()">
              <input
                type="search"
                name="publicOwner"
                maxlength="30"
                placeholder="Felhasználónév…"
                aria-label="Szűrés a megosztó felhasználónevére"
                [(ngModel)]="publicOwner"
                (ngModelChange)="onPublicQueryChange()">
              <select
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
              <div class="loading" role="status"><div class="spinner"></div></div>
            } @else if (filteredPublicDecks().length === 0) {
              <div class="empty-box">
                <p>{{ hasPublicFilter() ? 'Nincs találat' : 'Még nincs közös pakli' }}</p>
                <p>
                  {{ hasPublicFilter() ? 'Próbálj másik keresőszót, felhasználónevet vagy szintet.' : 'Oszd meg az első paklidat a saját paklid Beállítások és megosztás fülén.' }}
                </p>
              </div>
            } @else {
              <div class="public-grid">
                @for (deck of filteredPublicDecks(); track deck.id) {
                  <article class="public-card" [class.open]="previewDeckId === deck.id">
                    <div>
                      <h3>{{ deck.name }}</h3>
                      @if (deck.exampleLevel) {
                        <span class="chip chip-level" [attr.title]="deck.levelIsAutomatic ? 'Automatikus szint: a készítő fiókszintje (' + deck.exampleLevel + ')' : 'A pakli példamondatai ' + deck.exampleLevel + ' szintre készültek'">
                          {{ deck.exampleLevel }}
                        </span>
                      }
                    </div>
                    @if (deck.description) {
                      <p class="deck-description">{{ deck.description }}</p>
                    }
                    <div>
                      {{ deck.cardCount }} kártya · készítette:
                      <button
                        type="button"
                        class="owner-link"
                        [attr.title]="'Csak ' + deck.ownerUsername + ' paklijainak mutatása'"
                        (click)="filterByOwner(deck.ownerUsername)">{{ deck.ownerUsername }}</button>
                      @if (hasDeckNamed(deck.name)) {
                        <span class="chip" title="Már van ilyen nevű paklid">Már van ilyen paklid</span>
                      }
                    </div>
                    <div class="deck-facts">
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
                    <div>
                      <button type="button" [attr.aria-expanded]="previewDeckId === deck.id" (click)="togglePreview(deck)">
                        {{ previewDeckId === deck.id ? 'Előnézet bezárása' : 'Előnézet' }}
                      </button>
                      <button type="button" [disabled]="copyingDeckId === deck.id" (click)="copyDeck(deck)">
                        @if (copyingDeckId === deck.id) {
                          <span class="spinner spinner-sm"></span>
                        }
                        Másolás a paklijaim közé
                      </button>
                    </div>
                    @if (previewDeckId === deck.id) {
                      @if (isLoadingPreview) {
                        <div class="loading" role="status"><div class="spinner spinner-sm"></div></div>
                      } @else if (previewCards.length === 0) {
                        <div>Ebben a pakliban nincs kártya.</div>
                      } @else {
                        <ul class="preview-list">
                          @for (card of previewCards; track card.id) {
                            <li>
                              <strong>{{ card.term }}</strong>
                              <span> – {{ card.definition }}</span>
                              @if (card.targetMeanings) {
                                <div>{{ card.targetMeanings }}</div>
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
          <div>
            <h2 id="paste-title">Beillesztés szövegből</h2>
            <button type="button" aria-label="Bezárás" (click)="requestClosePaste()"></button>
          </div>
          <p>
            Soronként egy szót másolj be. Ha megvan már a magyar jelentés (például Quizlet exportból), írd a szó után az elválasztó jel mögé: az lesz a <strong>magyar jelentés</strong>.
            Ha <strong>csak angol szavaid vannak</strong>, az is jó: kapcsold be lent a „Magyar jelentés készítése MI-vel” opciót.
            Az angol definíciót és a példamondatot is kitöltetheted MI-vel.
          </p>

          <label for="paste-text">Szöveg</label>
          <textarea
            id="paste-text"
            rows="6"
            [(ngModel)]="pasteText"
            [disabled]="pasteAiRunning || pasteSaving"
            placeholder="Magyar jelentéssel:&#10;within walking distance&#9;csak pár percnyire van gyalog&#10;&#10;Vagy csak angol szavak (a jelentést az MI írja):&#10;ability&#10;benefit"></textarea>

          <div>
            <div>
              <div>Szó és jelentés között</div>
              <div>
                <input type="radio" name="pasteTermSep" id="ts-tab" value="tab" [(ngModel)]="pasteTermSep">
                <label for="ts-tab">Tabulátor</label>
              </div>
              <div>
                <input type="radio" name="pasteTermSep" id="ts-comma" value="comma" [(ngModel)]="pasteTermSep">
                <label for="ts-comma">Vessző</label>
              </div>
              <div>
                <input type="radio" name="pasteTermSep" id="ts-custom" value="custom" [(ngModel)]="pasteTermSep">
                <label for="ts-custom">Egyéni</label>
                <input type="text" class="paste-sep-input" name="pasteTermCustom" [(ngModel)]="pasteTermCustom" (focus)="pasteTermSep = 'custom'" placeholder="pl. -" aria-label="Egyéni szó és jelentés közti elválasztó">
              </div>
            </div>
            <div>
              <div>Sorok között</div>
              <div>
                <input type="radio" name="pasteRowSep" id="rs-newline" value="newline" [(ngModel)]="pasteRowSep">
                <label for="rs-newline">Új sor</label>
              </div>
              <div>
                <input type="radio" name="pasteRowSep" id="rs-semicolon" value="semicolon" [(ngModel)]="pasteRowSep">
                <label for="rs-semicolon">Pontosvessző</label>
              </div>
              <div>
                <input type="radio" name="pasteRowSep" id="rs-custom" value="custom" [(ngModel)]="pasteRowSep">
                <label for="rs-custom">Egyéni</label>
                <input type="text" class="paste-sep-input" name="pasteRowCustom" [(ngModel)]="pasteRowCustom" (focus)="pasteRowSep = 'custom'" placeholder="pl. \\n\\n" aria-label="Egyéni sorok közti elválasztó">
              </div>
            </div>
          </div>

          <div>
            <input type="checkbox" id="paste-auto" name="pasteAuto" [(ngModel)]="pasteAuto">
            <label for="paste-auto">MI automatikus kitöltés beolvasáskor</label>
          </div>
          <div>
            <input type="checkbox" id="paste-simplify" name="pasteSimplify" [(ngModel)]="pasteSimplify">
            <label for="paste-simplify">Magyar jelentés készítése és egyszerűsítése MI-vel</label>
          </div>
          <p>
            @if (pasteSimplify) {
              Ha egy sorban <strong>nincs magyar jelentés</strong>, az MI megírja (2–4 rövid, gyakori jelentés). Ha van, a hosszú listát lerövidíti. A kitöltés után a táblában bármit átírhatsz.
            } @else {
              Kapcsold be, ha csak angol szavaid vannak, és az MI-vel írnál hozzájuk magyar jelentést. Ha már van jelentés, így rövidebbé teheted.
            }
          </p>
          <p>
            Definíció és példamondat{{ pasteSimplify ? ' (és magyar jelentés)' : '' }} készül a pakli szintjén ({{ pasteLevel }}), {{ aiFillBatchSize }} szavanként egy MI-hívásban.
            Mai keret: {{ aiFillRemaining ?? '…' }} / {{ aiFillLimit }} (a korlát jelenleg nincs érvényben).
          </p>

          <div>
            <button type="button" [disabled]="!pasteText.trim() || pasteAiRunning || pasteSaving" (click)="parsePaste()">
              {{ pasteAuto ? 'Beolvasás és MI-kitöltés' : 'Sorok beolvasása' }}
            </button>
          </div>

          @if (pasteError) {
            <div role="alert">{{ pasteError }}</div>
          }
          @if (pasteRows.length > 0 && !pasteSimplify && pasteNoMeaningCount > 0 && !pasteAiRunning) {
            <div role="status">
              <span>{{ pasteNoMeaningCount }} sorban nincs magyar jelentés. Az MI megírhatja őket.</span>
              <button type="button" (click)="fillPasteMeanings()" [disabled]="pasteSaving">Magyar jelentés készítése MI-vel</button>
            </div>
          }
          @if (pasteRows.length > slowImportRows) {
            <div role="status">
              {{ pasteRows.length }} sort importálnál. {{ slowImportRows }} sor fölött lassú lehet a beolvasás, az MI-kitöltés és a mentés, és a napi MI-keret is hamar elfogyhat. Érdemes több részletben importálni.
            </div>
          }
          @if (pasteTrimmedCount > 0) {
            <div role="status">{{ pasteTrimmedCount }} sor szövege túl hosszú volt, ezért le lett vágva (a szó 100, a magyar jelentés 300 karakterig).</div>
          }

          @if (pasteRows.length > 0) {
            <div>
              <div>
                <strong>{{ pasteRows.length }} sor</strong>
                @if (pasteMissingCount > 0) {
                  · <span>{{ pasteMissingCount }} sorból hiányzik a definíció</span>
                } @else {
                  · minden sorban van definíció
                }
              </div>
              <div>
                @if (pasteAiRunning) {
                  <button type="button" (click)="cancelPasteAi()">Megszakítás</button>
                } @else {
                  <button type="button" [disabled]="pasteSaving || pasteAiEligibleCount === 0" (click)="startPasteAi()">
                    Hiányzók kitöltése MI-vel
                  </button>
                }
              </div>
            </div>

            @if (pasteAiRunning || pasteAiTotal > 0) {
              <div>
                <div role="progressbar" aria-label="MI-kitöltés folyamata" [attr.aria-valuenow]="pasteAiDone" aria-valuemin="0" [attr.aria-valuemax]="pasteAiTotal">
                  <div></div>
                </div>
                <div>
                  MI: {{ pasteAiDone }}/{{ pasteAiTotal }} sor feldolgozva{{ pasteAiRunning ? '…' : '' }}
                  @if (pasteAiFailedCount > 0) {
                    · <span>{{ pasteAiFailedCount }} sor kitöltetlen maradt (részletek a sorok mellett)</span>
                  }
                </div>
              </div>
            }

            <div class="paste-table-wrap">
              <table class="paste-table">
                <thead>
                  <tr>
                    <th scope="col">Szó</th>
                    <th scope="col">Definíció</th>
                    <th scope="col">Példamondat</th>
                    <th scope="col">Magyar jelentés</th>
                    <th scope="col"><span>Törlés</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of pasteRows; track row; let i = $index) {
                    <tr>
                      <td><input type="text" name="pt{{ i }}" maxlength="100" [(ngModel)]="row.term" aria-label="Szó"></td>
                      <td>
                        <textarea rows="2" name="pd{{ i }}" maxlength="500" [(ngModel)]="row.definition" [class.is-invalid]="!row.definition.trim()" aria-label="Definíció"></textarea>
                        @if (row.aiError) {
                          <div>{{ row.aiError }}</div>
                        } @else if (row.definition.trim() && rowIssue(row)) {
                          <div>{{ rowIssue(row) }}</div>
                        }
                      </td>
                      <td><textarea rows="2" name="pe{{ i }}" maxlength="500" [(ngModel)]="row.example" aria-label="Példamondat"></textarea></td>
                      <td><input type="text" name="pm{{ i }}" maxlength="300" [(ngModel)]="row.targetMeanings" aria-label="Magyar jelentés"></td>
                      <td><button type="button" aria-label="Sor törlése" (click)="removePasteRow(i)">✕</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div>
            <span>
              @if (pasteRows.length > maxImportRows) {
                Legfeljebb {{ maxImportRows }} sor importálható egyszerre.
              } @else if (pasteRows.length > 0 && !canSavePaste && !pasteAiRunning) {
                A mentéshez minden sorban kell szó és definíció.
              }
            </span>
            <div>
              <button type="button" [disabled]="pasteSaving" (click)="requestClosePaste()">Mégse</button>
              <button type="button" [disabled]="!canSavePaste" (click)="savePaste()">
                @if (pasteSaving) {
                  <span class="spinner spinner-sm"></span>
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
          <h2 id="confirm-title">{{ confirmation.title }}</h2>
          <p id="confirm-text">{{ confirmation.message }}</p>
          <div>
            <button type="button" (click)="pendingConfirm = null">Mégse</button>
            <button
              type="button"
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
        <button type="button" aria-label="Bezárás" (click)="toastMessage = null"></button>
      </div>
    }
  `,
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
  // A szerkesztő megnyitásakor, kártyaváltáskor és bezáráskor nő: a korábbi kártyához indult MI-válasz nem íródhat az új űrlapba.
  private editorGeneration = 0;
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

  /** Az AppComponent kérdezi a nézet elhagyása előtt: a beillesztett szöveg, a még nem mentett sorok és a futó MI-kitöltés itt élnek. */
  get hasUnsavedPaste(): boolean {
    return this.pasteOpen
      && (this.pasteAiRunning || this.pasteRows.length > 0 || this.pasteText.trim().length > 0);
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
    this.editorGeneration++;
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
    this.editorGeneration++;
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
    this.editorGeneration++;
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
      return 'Add meg az angol definíciót. Használhatod a Generálás vagy a Kitöltés MI-vel gombot is.';
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
    const generation = this.editorGeneration;
    this.cardError = null;
    this.isGeneratingDefinition = true;
    this.http.post<{ definition: string }>('/api/ai/generate/card-definition', { term, deckId }).pipe(
      finalize(() => {
        this.isGeneratingDefinition = false;
      }),
    ).subscribe({
      next: (response) => {
        if (generation !== this.editorGeneration) {
          return;
        }

        this.definition = (response.definition ?? '').trim();
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.editorGeneration) {
          return;
        }

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

    const generation = this.editorGeneration;
    this.cardError = null;
    this.isGeneratingTargetMeaning = true;
    this.http.post<{ meanings: string }>('/api/ai/generate/target-meaning', { term, definition }).pipe(
      finalize(() => {
        this.isGeneratingTargetMeaning = false;
      }),
    ).subscribe({
      next: (response) => {
        if (generation !== this.editorGeneration) {
          return;
        }

        const combined = this.appendMeanings(this.targetMeanings, response.meanings ?? '');
        if (combined.length > 300) {
          this.cardError = 'A magyar jelentés legfeljebb 300 karakter lehet.';
          return;
        }

        this.targetMeanings = combined;
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.editorGeneration) {
          return;
        }

        this.cardError = this.readAiError(error, 'A magyar jelentés generálása');
      },
    });
  }

  autoFill(): void {
    const term = this.term.trim();
    if (!term || this.isBusyAi || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

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
    const generation = this.editorGeneration;
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
          if (generation !== this.editorGeneration) {
            return;
          }

          const combined = this.appendMeanings(this.targetMeanings, response.meanings ?? '');
          if (combined.length <= 300) {
            this.targetMeanings = combined;
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.editorGeneration) {
            return;
          }

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
        // Ha közben másik kártyát nyitottak meg, a régihez tartozó magyar jelentést sem kérjük le.
        if (generation !== this.editorGeneration) {
          this.isAutoFilling = false;
          return;
        }

        this.definition = (response.definition ?? '').trim();
        fillMeaning(this.definition);
      },
      error: (error: HttpErrorResponse) => {
        this.isAutoFilling = false;
        if (generation !== this.editorGeneration) {
          return;
        }

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
      const bytes = reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0);
      this.sendImport(deckId, this.decodeCsv(bytes));
    };
    reader.onerror = () => {
      this.errorMessage = 'A CSV fájl beolvasása sikertelen.';
    };
    reader.readAsArrayBuffer(file);
  }

  // A magyar Excel alapértelmezett CSV-mentése Windows-1250 kódolású, nem UTF-8; ilyenkor azzal olvassuk be.
  private decodeCsv(bytes: ArrayBuffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1250').decode(bytes);
    }
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
      message: 'Ha nem mented el, a beolvasott sorok és a kitöltött mezők elvesznek.',
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
      return 'Az MI nem tölti ki: a definíció 500 karakternél hosszabb.';
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
        this.pasteError = `${failed} sort nem sikerült kitölteni az MI-vel. Töltsd ki kézzel, vagy próbáld újra.`;
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
    // A szerver magyar ProblemDetails-címe pontosabb, mint a státuszkódból kikövetkeztetett szöveg.
    const title = (error.error as ProblemDetails | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      return `${context} sikertelen. ${title.trim()}`;
    }

    if (error.status === 503) {
      return `${context} sikertelen: az MI nincs beállítva.`;
    }

    if (error.status === 502) {
      return `${context} sikertelen: az MI nem adott használható választ.`;
    }

    return `${context} sikertelen. Próbáld újra.`;
  }

  private readError(error: HttpErrorResponse, fallback: string): string {
    const title = (error.error as ProblemDetails | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      return title;
    }

    return fallback;
  }
}
