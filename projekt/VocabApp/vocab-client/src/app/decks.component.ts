import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

interface Deck {
  id: number;
  name: string;
  cardCount: number;
  isPublic: boolean;
  exampleLevel: string | null;
}

interface PublicDeck {
  id: number;
  name: string;
  cardCount: number;
  ownerName: string;
  exampleLevel: string | null;
  levelIsAutomatic: boolean;
}

interface VocabCard {
  id: number;
  deckId: number;
  term: string;
  definition: string;
  example: string | null;
  targetMeanings: string | null;
  isLearned: boolean;
  markedKnown: boolean;
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

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  danger: boolean;
  action: () => void;
}

@Component({
  selector: 'app-decks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="mb-4">
          <h1 class="display-6 fw-semibold">Paklik</h1>
          <p class="text-body-secondary mb-0">Saját paklik és a bennük lévő kártyák.</p>
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (noticeMessage) {
          <div class="alert alert-success d-flex justify-content-between align-items-start gap-2" role="status">
            <span>{{ noticeMessage }}</span>
            <button type="button" class="btn-close" aria-label="Bezárás" (click)="noticeMessage = null"></button>
          </div>
        }

        @if (pendingConfirm; as confirmation) {
          <div class="alert alert-warning" role="alertdialog" aria-live="assertive">
            <p class="mb-3">{{ confirmation.message }}</p>
            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-danger]="confirmation.danger"
                [class.btn-primary]="!confirmation.danger"
                (click)="runConfirm()">
                {{ confirmation.confirmLabel }}
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" (click)="pendingConfirm = null">Mégse</button>
            </div>
          </div>
        }

        <form class="row g-2 align-items-end mb-4" (ngSubmit)="createDeck()">
          <div class="col">
            <label class="form-label" for="deckName">Új pakli</label>
            <input
              id="deckName"
              name="deckName"
              class="form-control"
              maxlength="100"
              [(ngModel)]="newDeckName"
              [disabled]="isSavingDeck">
          </div>
          <div class="col-auto">
            <button type="submit" class="btn btn-primary" [disabled]="isSavingDeck">Létrehozás</button>
          </div>
        </form>

        @if (isLoadingDecks) {
          <div class="text-center py-4" role="status">
            <div class="spinner-border text-primary"></div>
          </div>
        } @else {
          <div class="list-group mb-4">
            <div class="list-group-item">
              <button
                type="button"
                class="btn btn-link text-start p-0 deck-link"
                [class.fw-semibold]="viewingLearned"
                (click)="selectLearned()">
                Megtanult szavak
              </button>
              <div class="text-body-secondary small">Az összes paklidból már megtanult kártyáid áttekintése.</div>
            </div>
            @for (deck of decks; track deck.id) {
              <div class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                @if (renamingDeckId === deck.id) {
                  <form class="d-flex flex-grow-1 gap-2" (ngSubmit)="renameDeck(deck)">
                    <input
                      class="form-control form-control-sm"
                      maxlength="100"
                      [name]="'rename-' + deck.id"
                      [attr.aria-label]="'Pakli új neve'"
                      [(ngModel)]="renameDraft"
                      [disabled]="isRenaming">
                    <button type="submit" class="btn btn-primary btn-sm" [disabled]="isRenaming">Mentés</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="isRenaming" (click)="cancelRename()">Mégse</button>
                  </form>
                } @else {
                  <div>
                    <button
                      type="button"
                      class="btn btn-link text-start p-0 deck-link"
                      [class.fw-semibold]="selectedDeckId === deck.id"
                      (click)="selectDeck(deck.id)">
                      {{ deck.name }}
                    </button>
                    <div class="text-body-secondary small">
                      {{ deck.cardCount }} kártya
                      @if (deck.isPublic) {
                        · megosztva
                        <span class="badge level-badge ms-1" [attr.title]="deck.exampleLevel ? 'Beállított szint' : 'Automatikus: a fiókod szintje'">
                          {{ deck.exampleLevel ?? accountLevel }}@if (!deck.exampleLevel) { <span class="fw-normal"> · auto</span> }
                        </span>
                      }
                    </div>
                  </div>
                  <div class="d-flex flex-wrap justify-content-end align-items-center gap-2">
                    <label class="d-flex align-items-center gap-1 mb-0 small" [attr.for]="'exampleLevel-' + deck.id">
                      Szint
                      <select
                        class="form-select form-select-sm"
                        style="width: auto;"
                        [id]="'exampleLevel-' + deck.id"
                        [name]="'exampleLevel-' + deck.id"
                        [ngModel]="deck.exampleLevel ?? ''"
                        (ngModelChange)="saveExampleLevel(deck, $event)"
                        [disabled]="savingLevelDeckId === deck.id">
                        <option value="">Fiók szintje</option>
                        @for (level of exampleLevels; track level) {
                          <option [value]="level">{{ level }}</option>
                        }
                      </select>
                    </label>
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm"
                      (click)="startRename(deck)">
                      Átnevezés
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm"
                      [disabled]="sharingDeckId === deck.id"
                      (click)="onShareClick(deck)">
                      {{ deck.isPublic ? 'Megosztás visszavonása' : 'Megosztás' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-sm"
                      [disabled]="deletingDeckId === deck.id"
                      (click)="deleteDeck(deck)">
                      Törlés
                    </button>
                  </div>
                  @if (shareChooserDeckId === deck.id) {
                    <div class="w-100 border-top pt-3 mt-1">
                      <label class="form-label mb-1" [attr.for]="'shareLevel-' + deck.id">Milyen mondatszintre készült a pakli?</label>
                      <div class="d-flex flex-wrap align-items-center gap-2">
                        <select
                          class="form-select form-select-sm"
                          style="width: auto;"
                          [id]="'shareLevel-' + deck.id"
                          [name]="'shareLevel-' + deck.id"
                          [(ngModel)]="shareLevelChoice">
                          <option value="">Automatikus ({{ deck.exampleLevel ?? accountLevel }})</option>
                          @for (level of exampleLevels; track level) {
                            <option [value]="level">{{ level }}</option>
                          }
                        </select>
                        <button type="button" class="btn btn-primary btn-sm" [disabled]="sharingDeckId === deck.id" (click)="confirmShare(deck)">Megosztás</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="shareChooserDeckId = null">Mégse</button>
                      </div>
                      <div class="form-text">Ha nem választasz, automatikusan a pakli szintje, annak hiányában a fiókod szintje jelenik meg a közös listában.</div>
                    </div>
                  }
                }
              </div>
            }
          </div>
        }

        @if (viewingLearned || selectedDeckId !== null) {
          <section class="border rounded p-3">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 class="h5 mb-0">{{ viewingLearned ? 'Megtanult szavak' : selectedDeckName() }}</h2>
              @if (viewingLearned) {
              <div class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-primary]="learnedDetailed"
                  [class.btn-outline-secondary]="!learnedDetailed"
                  (click)="learnedDetailed = true">
                  Részletes
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-primary]="!learnedDetailed"
                  [class.btn-outline-secondary]="learnedDetailed"
                  (click)="learnedDetailed = false">
                  Felületes
                </button>
              </div>
              } @else {
              <div class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  [disabled]="isExporting"
                  (click)="exportDeck()">
                  Export
                </button>
                <label class="btn btn-outline-secondary btn-sm mb-0" [class.disabled]="isImporting">
                  Import
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    class="d-none"
                    [disabled]="isImporting"
                    (change)="importDeck($event)">
                </label>
              </div>
              }
            </div>

            @if (importMessage && !viewingLearned) {
              <div class="alert" [class.alert-success]="importSkipped.length === 0" [class.alert-warning]="importSkipped.length > 0" role="status">
                <div>{{ importMessage }}</div>
                @if (importSkipped.length > 0) {
                  <ul class="mb-0 mt-2 small">
                    @for (line of importSkipped; track $index) {
                      <li>{{ line }}</li>
                    }
                  </ul>
                }
              </div>
            }

            @if (!viewingLearned) {
              <p class="text-body-secondary small">
                Import: CSV fájl <code>term,definition,example</code> fejléccel (opcionálisan <code>,targetMeanings</code>), legfeljebb 200 sorral.
                A hibás sorok kimaradnak, a többi bekerül.
                <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="downloadCsvTemplate()">Minta CSV letöltése</button>
              </p>
            }

            @if (!viewingLearned) {
            <form (ngSubmit)="saveCard()">
              <div class="mb-3">
                <label class="form-label" for="term">Szó</label>
                <input id="term" name="term" class="form-control" maxlength="100" [(ngModel)]="term" [disabled]="isSavingCard">
              </div>
              <div class="mb-3">
                <label class="form-label" for="definition">Angol definíció</label>
                <textarea
                  id="definition"
                  name="definition"
                  class="form-control"
                  rows="2"
                  maxlength="500"
                  [(ngModel)]="definition"
                  [disabled]="isSavingCard || isGeneratingDefinition"></textarea>
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm mt-2"
                  (click)="generateDefinition()"
                  [disabled]="isGeneratingDefinition || isSavingCard || !term.trim()">
                  @if (isGeneratingDefinition) {
                    <span class="spinner-border spinner-border-sm me-1"></span>
                  }
                  Generálás
                </button>
              </div>
              <div class="mb-3">
                <label class="form-label" for="targetMeanings">Célnyelvi jelentés</label>
                <textarea
                  id="targetMeanings"
                  name="targetMeanings"
                  class="form-control"
                  rows="2"
                  maxlength="200"
                  [(ngModel)]="targetMeanings"
                  [disabled]="isSavingCard || isGeneratingTargetMeaning"></textarea>
                <div class="form-text">Most magyar. Elfogadott alakok vesszővel: étel, kaja</div>
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm mt-2"
                  (click)="generateTargetMeaning()"
                  [disabled]="isGeneratingTargetMeaning || isSavingCard || !term.trim() || !definition.trim()">
                  @if (isGeneratingTargetMeaning) {
                    <span class="spinner-border spinner-border-sm me-1"></span>
                  }
                  Generálás
                </button>
              </div>
              <div class="mb-3">
                <label class="form-label" for="example">Példa</label>
                <textarea id="example" name="example" class="form-control" rows="2" maxlength="500" [(ngModel)]="example" [disabled]="isSavingCard"></textarea>
              </div>
              @if (cardError) {
                <div class="alert alert-danger py-2" role="alert">{{ cardError }}</div>
              }
              <div class="d-flex gap-2 mb-4">
                <button type="submit" class="btn btn-primary" [disabled]="isSavingCard">
                  {{ editingCardId === null ? 'Kártya felvétele' : 'Mentés' }}
                </button>
                @if (editingCardId !== null) {
                  <button type="button" class="btn btn-outline-secondary" [disabled]="isSavingCard" (click)="cancelEdit()">Mégse</button>
                }
              </div>
            </form>
            }

            @if (isLoadingCards) {
              <div class="text-center py-3" role="status">
                <div class="spinner-border text-primary"></div>
              </div>
            } @else if (viewingLearned && learnedCards.length === 0) {
              <div class="alert alert-info mb-0">Még nincs megtanult szavad.</div>
            } @else if (!viewingLearned && cards.length === 0) {
              <div class="alert alert-info mb-0">Ebben a pakliban még nincs kártya.</div>
            } @else if (viewingLearned && !learnedDetailed) {
              <div class="list-group">
                @for (card of learnedCards; track card.id) {
                  <div class="list-group-item">
                    <div class="fw-semibold">{{ card.term }}</div>
                  </div>
                }
              </div>
            } @else if (viewingLearned) {
              <div class="list-group">
                @for (card of learnedCards; track card.id) {
                  <div class="list-group-item">
                    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                      <div>
                        <div class="fw-semibold">{{ card.term }}</div>
                        <div>{{ card.definition }}</div>
                        @if (card.targetMeanings) {
                          <div>{{ card.targetMeanings }}</div>
                        }
                        @if (card.example) {
                          <div class="text-body-secondary">{{ card.example }}</div>
                        }
                        <div class="text-body-secondary">Forráspakli: {{ card.deckName }}</div>
                        <div class="text-body-secondary">Megtanulva: {{ formatLocalTime(card.learnedAt) }}</div>
                        <div class="text-body-secondary">Utolsó kérdés: {{ formatLocalTime(card.lastReviewedAt, 'Még nem volt kérdezve.') }}</div>
                        <div class="text-body-secondary">Első kérdés: {{ formatLocalTime(card.firstReviewedAt, 'Még nem volt kérdezve.') }}</div>
                        <div class="text-body-secondary">Következő ismétlés: {{ formatLocalTime(card.nextReviewDate) }}</div>
                        <div class="text-body-secondary">Sorozat: {{ card.streak }}</div>
                        <div class="text-body-secondary">Időköz: {{ card.interval }} nap</div>
                        <div class="text-body-secondary">Könnyűség: {{ card.easeFactor }}</div>
                        <div class="text-body-secondary">Helyes válaszok: {{ card.correctCount }}</div>
                        <div class="text-body-secondary">Hibák: {{ card.incorrectCount }}</div>
                        @if (card.markedKnown) {
                          <div class="text-body-secondary">Ismertnek jelölve</div>
                        }
                      </div>
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        [disabled]="resettingLearnedCardId === card.id"
                        (click)="resetLearned(card)">
                        Mégse tudom
                      </button>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="list-group">
                @for (card of cards; track card.id) {
                  <div class="list-group-item">
                    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                      <div class="d-flex align-items-start gap-3 text-break" style="min-width: 0;">
                        <div class="form-check mb-0">
                          <input
                            class="form-check-input"
                            type="checkbox"
                            [id]="'known-' + card.id"
                            [checked]="card.isLearned"
                            [disabled]="isKnownLocked(card) || markingKnownCardId === card.id"
                            (change)="setKnown(card, $event)">
                          <label class="form-check-label small" [attr.for]="'known-' + card.id">Már ismerem</label>
                        </div>
                        <div>
                          <div class="fw-semibold">{{ card.term }}</div>
                          <div>{{ card.definition }}</div>
                          @if (card.targetMeanings) {
                            <div>{{ card.targetMeanings }}</div>
                          }
                          @if (card.example) {
                            <div class="text-body-secondary">{{ card.example }}</div>
                          }
                        </div>
                      </div>
                      <div class="d-flex gap-2">
                        <button type="button" class="btn btn-outline-primary btn-sm" (click)="editCard(card)">Szerkesztés</button>
                        <button
                          type="button"
                          class="btn btn-outline-danger btn-sm"
                          [disabled]="deletingCardId === card.id"
                          (click)="deleteCard(card)">
                          Törlés
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        }

        <section class="mt-5">
          <h2 class="h4 mb-3">Közös paklik</h2>
          <form class="row g-2 align-items-end mb-3" (ngSubmit)="searchPublicDecks()">
            <div class="col-12 col-sm">
              <label class="form-label" for="publicQuery">Keresés</label>
              <input
                id="publicQuery"
                name="publicQuery"
                class="form-control"
                [(ngModel)]="publicQuery"
                [disabled]="isLoadingPublic">
            </div>
            <div class="col-auto">
              <label class="form-label" for="publicLevel">Szint</label>
              <select id="publicLevel" name="publicLevel" class="form-select" [(ngModel)]="publicLevelFilter">
                <option value="">Mind</option>
                @for (level of exampleLevels; track level) {
                  <option [value]="level">{{ level }}</option>
                }
              </select>
            </div>
            <div class="col-auto">
              <button type="submit" class="btn btn-outline-primary" [disabled]="isLoadingPublic">Keresés</button>
            </div>
          </form>

          @if (isLoadingPublic) {
            <div class="text-center py-3" role="status">
              <div class="spinner-border text-primary"></div>
            </div>
          } @else if (filteredPublicDecks().length === 0) {
            <div class="alert alert-info mb-0">Nincs közös pakli.</div>
          } @else {
            <div class="list-group">
              @for (deck of filteredPublicDecks(); track deck.id) {
                <div class="list-group-item">
                  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="text-break" style="min-width: 0;">
                      <div class="d-flex flex-wrap align-items-center gap-2">
                        <span class="fw-semibold">{{ deck.name }}</span>
                        @if (deck.exampleLevel) {
                          <span class="badge level-badge" [attr.title]="deck.levelIsAutomatic ? 'Automatikus szint: a készítő fiókszintje (' + deck.exampleLevel + ')' : 'A pakli példamondatai ' + deck.exampleLevel + ' szintre készültek'">
                            {{ deck.exampleLevel }}@if (deck.levelIsAutomatic) { <span class="fw-normal"> · auto</span> }
                          </span>
                        }
                      </div>
                      <div class="text-body-secondary">{{ deck.cardCount }} kártya · készítette: {{ deck.ownerName || 'névtelen felhasználó' }}</div>
                    </div>
                    <div class="d-flex gap-2">
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        (click)="togglePreview(deck)">
                        Előnézet
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-primary btn-sm"
                        [disabled]="copyingDeckId === deck.id"
                        (click)="copyDeck(deck)">
                        Másolás
                      </button>
                    </div>
                  </div>
                  @if (previewDeckId === deck.id) {
                    @if (isLoadingPreview) {
                      <div class="text-center py-3" role="status">
                        <div class="spinner-border spinner-border-sm text-primary"></div>
                      </div>
                    } @else if (previewCards.length === 0) {
                      <div class="alert alert-info mb-0 mt-3">Ebben a pakliban nincs kártya.</div>
                    } @else {
                      <div class="list-group mt-3">
                        @for (card of previewCards; track card.id) {
                          <div class="list-group-item">
                            <div class="fw-semibold">{{ card.term }}</div>
                            <div>{{ card.definition }}</div>
                            @if (card.targetMeanings) {
                              <div>{{ card.targetMeanings }}</div>
                            }
                            @if (card.example) {
                              <div class="text-body-secondary">{{ card.example }}</div>
                            }
                          </div>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }
        </section>
      </div>
    </main>
  `,
  styles: [`
    .deck-link { text-decoration: underline; text-decoration-color: transparent; text-underline-offset: .2em; }
    .deck-link:hover, .deck-link:focus-visible { text-decoration-color: currentColor; }
  `],
})
export class DecksComponent implements OnInit {
  private readonly http = inject(HttpClient);

  decks: Deck[] = [];
  publicDecks: PublicDeck[] = [];
  cards: VocabCard[] = [];
  learnedCards: LearnedCard[] = [];
  viewingLearned = false;
  learnedDetailed = true;
  previewCards: VocabCard[] = [];
  previewDeckId: number | null = null;
  selectedDeckId: number | null = null;
  newDeckName = '';
  renamingDeckId: number | null = null;
  renameDraft = '';
  publicQuery = '';
  term = '';
  definition = '';
  example = '';
  targetMeanings = '';
  editingCardId: number | null = null;
  errorMessage: string | null = null;
  noticeMessage: string | null = null;
  cardError: string | null = null;
  pendingConfirm: PendingConfirm | null = null;
  importSkipped: string[] = [];
  isLoadingDecks = false;
  isLoadingCards = false;
  isSavingDeck = false;
  isRenaming = false;
  isSavingCard = false;
  isGeneratingDefinition = false;
  isGeneratingTargetMeaning = false;
  deletingDeckId: number | null = null;
  deletingCardId: number | null = null;
  markingKnownCardId: number | null = null;
  resettingLearnedCardId: number | null = null;
  sharingDeckId: number | null = null;
  copyingDeckId: number | null = null;
  savingLevelDeckId: number | null = null;
  readonly exampleLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  publicLevelFilter = '';
  shareChooserDeckId: number | null = null;
  shareLevelChoice = '';
  accountLevel = 'B1';

  filteredPublicDecks(): PublicDeck[] {
    return this.publicLevelFilter
      ? this.publicDecks.filter((deck) => deck.exampleLevel === this.publicLevelFilter)
      : this.publicDecks;
  }
  isLoadingPublic = false;
  isLoadingPreview = false;
  private previewRequest = 0;
  private cardsRequest = 0;
  isExporting = false;
  isImporting = false;
  importMessage: string | null = null;

  ngOnInit(): void {
    this.http.get<{ exampleLevel: string }>('/api/study/settings').subscribe({
      next: (settings) => {
        this.accountLevel = settings.exampleLevel;
      },
    });
    this.loadDecks();
    this.searchPublicDecks();
  }

  selectedDeckName(): string {
    return this.decks.find(deck => deck.id === this.selectedDeckId)?.name ?? 'Pakli';
  }

  selectDeck(deckId: number): void {
    if (!this.viewingLearned && this.selectedDeckId === deckId) {
      return;
    }

    this.viewingLearned = false;
    this.learnedDetailed = true;
    this.selectedDeckId = deckId;
    this.importMessage = null;
    this.importSkipped = [];
    this.cancelEdit();
    this.loadCards();
  }

  selectLearned(): void {
    if (this.viewingLearned) {
      return;
    }

    this.viewingLearned = true;
    this.learnedDetailed = true;
    this.selectedDeckId = null;
    this.importMessage = null;
    this.cancelEdit();
    this.loadLearned();
  }

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
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A szó visszaállítása sikertelen.');
      },
    });
  }

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
      },
      error: (error: HttpErrorResponse) => {
        this.readBlobError(error, 'A pakli exportja sikertelen.').then(message => {
          this.errorMessage = message;
        });
      },
    });
  }

  downloadCsvTemplate(): void {
    const sample = 'term,definition,example,targetMeanings\n'
      + '"serendipity","The occurrence of pleasant events by chance.","It was pure serendipity.","szerencsés véletlen"\n'
      + '"resilient","Able to recover quickly from difficulty.","","rugalmas, ellenálló"\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF' + sample], { type: 'text/csv;charset=utf-8' }));
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

  createDeck(): void {
    const name = this.newDeckName.trim();
    if (!name || name.length > 100) {
      this.errorMessage = 'A pakli neve kötelező, és legfeljebb 100 karakter lehet.';
      return;
    }

    this.errorMessage = null;
    this.isSavingDeck = true;
    this.http.post<Deck>('/api/decks', { name }).pipe(
      finalize(() => {
        this.isSavingDeck = false;
      }),
    ).subscribe({
      next: (deck) => {
        this.newDeckName = '';
        this.decks = [...this.decks, deck].sort((left, right) => left.id - right.id);
        this.selectDeck(deck.id);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli létrehozása sikertelen.');
      },
    });
  }

  startRename(deck: Deck): void {
    this.renamingDeckId = deck.id;
    this.renameDraft = deck.name;
    this.errorMessage = null;
  }

  cancelRename(): void {
    this.renamingDeckId = null;
    this.renameDraft = '';
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
        this.cancelRename();
        if (updated.isPublic) {
          this.searchPublicDecks();
        }
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
      },
      error: (error: HttpErrorResponse) => {
        this.decks = this.decks.map(item => item.id === deck.id ? { ...item, exampleLevel: previous } : item);
        this.errorMessage = this.readError(error, 'A mondatszint mentése sikertelen.');
      },
    });
  }

  onShareClick(deck: Deck): void {
    if (deck.isPublic) {
      this.toggleShare(deck);
      return;
    }

    this.shareChooserDeckId = this.shareChooserDeckId === deck.id ? null : deck.id;
    this.shareLevelChoice = '';
  }

  confirmShare(deck: Deck): void {
    this.toggleShare(deck, this.shareLevelChoice || null);
  }

  toggleShare(deck: Deck, exampleLevel: string | null = null): void {
    this.errorMessage = null;
    this.sharingDeckId = deck.id;
    const body: { isPublic: boolean; exampleLevel?: string } = { isPublic: !deck.isPublic };
    if (!deck.isPublic && exampleLevel) {
      body.exampleLevel = exampleLevel;
    }

    this.http.put<Deck>(`/api/decks/${deck.id}/share`, body).pipe(
      finalize(() => {
        this.sharingDeckId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.shareChooserDeckId = null;
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.searchPublicDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A megosztás módosítása sikertelen.');
      },
    });
  }

  searchPublicDecks(): void {
    this.isLoadingPublic = true;
    const params = this.publicQuery.trim() ? { q: this.publicQuery.trim() } : undefined;
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

  copyDeck(deck: PublicDeck): void {
    const alreadyHave = this.decks.some(item => item.name.trim().toLowerCase() === deck.name.trim().toLowerCase());
    if (alreadyHave) {
      this.askConfirm(
        `Már van „${deck.name}” nevű paklid. Biztosan lemásolod még egyszer?`,
        'Másolás mégis',
        false,
        () => this.performCopy(deck),
      );
      return;
    }

    this.performCopy(deck);
  }

  private performCopy(deck: PublicDeck): void {
    this.errorMessage = null;
    this.noticeMessage = null;
    this.copyingDeckId = deck.id;
    this.http.post<Deck>(`/api/decks/${deck.id}/copy`, {}).pipe(
      finalize(() => {
        this.copyingDeckId = null;
      }),
    ).subscribe({
      next: (copied) => {
        this.decks = [...this.decks, copied].sort((left, right) => left.id - right.id);
        this.selectDeck(copied.id);
        this.noticeMessage = `A(z) „${copied.name}” pakli (${copied.cardCount} kártya) bekerült a saját paklijaid közé.`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli másolása sikertelen.');
      },
    });
  }

  askConfirm(message: string, confirmLabel: string, danger: boolean, action: () => void): void {
    this.pendingConfirm = { message, confirmLabel, danger, action };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  runConfirm(): void {
    const confirmation = this.pendingConfirm;
    this.pendingConfirm = null;
    confirmation?.action();
  }

  deleteDeck(deck: Deck): void {
    this.askConfirm(
      `Biztosan törlöd a(z) „${deck.name}” paklit? A benne lévő kártyák és tanulási adatok is törlődnek.`,
      'Pakli törlése',
      true,
      () => this.performDeleteDeck(deck),
    );
  }

  private performDeleteDeck(deck: Deck): void {
    this.errorMessage = null;
    this.noticeMessage = null;
    this.deletingDeckId = deck.id;
    this.http.delete(`/api/decks/${deck.id}`).pipe(
      finalize(() => {
        this.deletingDeckId = null;
      }),
    ).subscribe({
      next: () => {
        this.decks = this.decks.filter(item => item.id !== deck.id);
        if (this.renamingDeckId === deck.id) {
          this.cancelRename();
        }
        if (this.selectedDeckId === deck.id) {
          this.selectedDeckId = null;
          this.cards = [];
          this.cancelEdit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli törlése sikertelen.');
      },
    });
  }

  editCard(card: VocabCard): void {
    this.editingCardId = card.id;
    this.term = card.term;
    this.definition = card.definition;
    this.example = card.example ?? '';
    this.targetMeanings = card.targetMeanings ?? '';
    this.errorMessage = null;
  }

  cancelEdit(): void {
    this.cardError = null;
    this.editingCardId = null;
    this.term = '';
    this.definition = '';
    this.example = '';
    this.targetMeanings = '';
  }

  saveCard(): void {
    const term = this.term.trim();
    const definition = this.definition.trim();
    const example = this.example.trim();
    const targetMeanings = this.targetMeanings.trim();
    const problem = this.cardFieldProblem(term, definition, example, targetMeanings);
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
          `Már van „${term}” kártya ebben a pakliban. Biztosan felveszed még egyszer?`,
          'Felvétel mégis',
          false,
          () => this.performSaveCard(term, definition, example, targetMeanings),
        );
        return;
      }
    }

    this.performSaveCard(term, definition, example, targetMeanings);
  }

  private cardFieldProblem(term: string, definition: string, example: string, targetMeanings: string): string | null {
    if (!term) {
      return 'A szó megadása kötelező.';
    }

    if (term.length > 100) {
      return `A szó legfeljebb 100 karakter lehet (most ${term.length}).`;
    }

    if (!definition) {
      return 'Az angol definíció megadása kötelező. Használhatod a Generálás gombot is.';
    }

    if (definition.length > 500) {
      return `Az angol definíció legfeljebb 500 karakter lehet (most ${definition.length}).`;
    }

    if (targetMeanings.length > 200) {
      return `A célnyelvi jelentés legfeljebb 200 karakter lehet (most ${targetMeanings.length}).`;
    }

    if (example.length > 500) {
      return `A példa legfeljebb 500 karakter lehet (most ${example.length}).`;
    }

    return null;
  }

  private performSaveCard(term: string, definition: string, example: string, targetMeanings: string): void {
    if (this.selectedDeckId === null) {
      return;
    }

    this.errorMessage = null;
    this.cardError = null;
    this.isSavingCard = true;
    const body = { term, definition, example: example || null, targetMeanings: targetMeanings || null };
    const request = this.editingCardId === null
      ? this.http.post<VocabCard>('/api/cards', { deckId: this.selectedDeckId, ...body })
      : this.http.put<VocabCard>(`/api/cards/${this.editingCardId}`, body);

    request.pipe(
      finalize(() => {
        this.isSavingCard = false;
      }),
    ).subscribe({
      next: (card) => {
        if (this.editingCardId === null) {
          this.cards = [...this.cards, card];
        } else {
          this.cards = this.cards.map(item => item.id === card.id ? card : item);
        }
        this.loadDecks();
        this.cancelEdit();
      },
      error: (error: HttpErrorResponse) => {
        this.cardError = this.readError(error, 'A kártya mentése sikertelen.');
      },
    });
  }

  generateDefinition(): void {
    const term = this.term.trim();
    if (!term || this.isGeneratingDefinition || this.isSavingCard || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    this.errorMessage = null;
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
        this.errorMessage = this.readAiError(error, 'Az angol definíció generálása');
      },
    });
  }

  generateTargetMeaning(): void {
    const term = this.term.trim();
    const definition = this.definition.trim();
    if (!term || !definition || this.isGeneratingTargetMeaning || this.isSavingCard) {
      return;
    }

    this.errorMessage = null;
    this.isGeneratingTargetMeaning = true;
    this.http.post<{ meanings: string }>('/api/ai/generate/target-meaning', { term, definition }).pipe(
      finalize(() => {
        this.isGeneratingTargetMeaning = false;
      }),
    ).subscribe({
      next: (response) => {
        const combined = this.appendMeanings(this.targetMeanings, response.meanings ?? '');
        if (combined.length > 200) {
          this.errorMessage = 'A célnyelvi jelentés legfeljebb 200 karakter.';
          return;
        }

        this.targetMeanings = combined;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readAiError(error, 'A célnyelvi jelentés generálása');
      },
    });
  }

  isKnownLocked(card: VocabCard): boolean {
    return card.isLearned && !card.markedKnown;
  }

  setKnown(card: VocabCard, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.isKnownLocked(card)) {
      input.checked = true;
      return;
    }

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
      },
      error: (error: HttpErrorResponse) => {
        input.checked = card.isLearned;
        this.errorMessage = this.readError(error, 'Az ismert szó jelölése sikertelen.');
      },
    });
  }

  deleteCard(card: VocabCard): void {
    this.askConfirm(
      `Biztosan törlöd a(z) „${card.term}” kártyát?`,
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
        this.loadDecks();
        if (this.editingCardId === card.id) {
          this.cancelEdit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártya törlése sikertelen.');
      },
    });
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
        this.importSkipped = result.skippedRows ?? [];
        this.importMessage = result.skippedCount > 0
          ? `${result.importedCount} kártya került be, ${result.skippedCount} sor kimaradt${result.skippedCount > this.importSkipped.length ? ' (az első ' + this.importSkipped.length + ' hiba látszik)' : ''}.`
          : `${result.importedCount} kártya került be.`;
        this.loadDecks();
        if (this.selectedDeckId === deckId) {
          this.loadCards();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A CSV import sikertelen.');
      },
    });
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

  private loadDecks(): void {
    this.isLoadingDecks = true;
    this.http.get<Deck[]>('/api/decks').pipe(
      finalize(() => {
        this.isLoadingDecks = false;
      }),
    ).subscribe({
      next: (decks) => {
        this.decks = decks;
        if (this.selectedDeckId === null && !this.viewingLearned && decks.length > 0) {
          this.selectDeck(decks[0].id);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A paklik betöltése sikertelen.');
      },
    });
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
