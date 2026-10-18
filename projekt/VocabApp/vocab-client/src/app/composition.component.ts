import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { SpeakButtonComponent } from './speak-button.component';
import { SpeechService } from './speech.service';

type CompositionPhase = 'setup' | 'practice' | 'done';
type CompositionDeckChoice = number | 'all';
type CompositionPreference = 'deck' | 'tag' | 'reviewed' | 'words';

interface CompositionDeck {
  id: number;
  name: string;
}

interface CompositionTagOption {
  tag: string;
  count: number;
}

interface CompositionCard {
  id: number;
  term: string;
  definition: string;
}

interface CompositionWordResult {
  cardId: number;
  term: string;
  usedCorrectly: boolean;
}

interface CompositionCheckResponse {
  attemptId: number;
  isCorrect: boolean;
  words: CompositionWordResult[];
  grammarCorrect: boolean;
  coherent: boolean;
  feedback: string;
  correctedText: string;
  hungarianTranslation: string;
}

interface CompositionTranslationSetting {
  enabled: boolean;
}

interface CompositionExampleResponse {
  example: string;
}

interface CompositionHintResponse {
  text: string;
}

// A backend Models/CompositionLimits.cs értékei.
const MIN_WORDS = 2;
const MAX_WORDS = 5;
const MAX_TEXT_LENGTH = 500;

@Component({
  selector: 'app-composition',
  standalone: true,
  imports: [CommonModule, FormsModule, SpeakButtonComponent],
  template: `
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="text-center mb-4">
          <h1 class="h3 mb-1">Mondatalkotás szavakból</h1>
          <p class="text-body-secondary mb-0">Írj egy-két összefüggő mondatot, amelyben az összes kapott szó szerepel. Az eredmény nem számít bele az ismétlésbe.</p>
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (phase === 'setup') {
          <form class="card shadow-sm" (ngSubmit)="start()">
            <div class="card-body">
              <h2 class="h5 mb-3">Szavak</h2>
              @if (isLoadingDecks) {
                <div class="text-center py-3" role="status"><div class="spinner-border text-primary"></div></div>
              } @else {
                @if (decks.length === 0) {
                  <div class="alert alert-warning" role="status">
                    <p class="mb-2">Még nincs paklid, így nincsenek szavak a gyakorláshoz.</p>
                    <button type="button" class="btn btn-sm btn-primary" (click)="openDecks.emit()">Ugrás a paklikhoz</button>
                  </div>
                }
                <span class="form-label fw-semibold d-block" id="composition-count-label">Szavak száma feladatonként</span>
                <div class="btn-group mb-3" role="group" aria-labelledby="composition-count-label">
                  @for (count of wordCounts; track count) {
                    <button
                      type="button"
                      class="btn"
                      [class.btn-primary]="wordCount === count"
                      [class.btn-outline-primary]="wordCount !== count"
                      [attr.aria-pressed]="wordCount === count"
                      (click)="setWordCount(count)">{{ count }}</button>
                  }
                </div>
                <label class="form-label fw-semibold d-block" for="composition-deck">Pakli</label>
                <select
                  id="composition-deck"
                  name="compositionDeck"
                  class="form-select mb-3"
                  [(ngModel)]="deckChoice"
                  (ngModelChange)="onDeckChange()">
                  <option [ngValue]="'all'">Összes pakli</option>
                  @for (deck of decks; track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
                @if (tagOptions.length > 0) {
                  <label class="form-label fw-semibold" for="composition-tag">Címke</label>
                  <select
                    id="composition-tag"
                    name="compositionTag"
                    class="form-select mb-3"
                    [(ngModel)]="tag"
                    (ngModelChange)="onTagChange()">
                    <option [ngValue]="''">Minden címke</option>
                    @for (option of tagOptions; track option.tag) {
                      <option [ngValue]="option.tag">{{ option.tag }} ({{ option.count }})</option>
                    }
                  </select>
                }
                <div class="form-check form-switch mb-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="composition-reviewed"
                    name="compositionReviewed"
                    [(ngModel)]="onlyReviewed"
                    (ngModelChange)="onReviewedChange()">
                  <label class="form-check-label" for="composition-reviewed">Csak a már tanult szavak</label>
                  <div class="form-text">Csak azok a kártyák, amelyeket legalább egyszer már ismételtél.</div>
                </div>
                <div class="form-check form-switch mb-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="composition-translation"
                    [checked]="showTranslation"
                    [disabled]="isSavingTranslation"
                    (change)="toggleTranslation()">
                  <label class="form-check-label" for="composition-translation">A szövegem magyar jelentése az ellenőrzés után</label>
                  <div class="form-text">Közös beállítás a Nyelvtan nézettel. Nem jár külön MI-hívással.</div>
                </div>
                @if (emptySelection) {
                  <div class="alert alert-info" role="status">Ebben a választásban nincs kártya.</div>
                }
                @if (tooFewCards !== null) {
                  <div class="alert alert-info" role="status">Ebben a választásban csak {{ tooFewCards }} különböző szó van; válassz kevesebb szót feladatonként, vagy bővítsd a választást.</div>
                }
                <button type="submit" class="btn btn-primary" [disabled]="isLoadingCards">
                  @if (isLoadingCards) {
                    <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                  }
                  Kezdés
                </button>
              }
            </div>
          </form>
        }

        @if (phase === 'practice' && words.length > 0) {
          <div class="d-flex justify-content-between align-items-center mb-2 small text-body-secondary">
            <span>{{ taskNumber }}. feladat</span>
            <span>{{ correctCount }} / {{ checkedCount }} helyes</span>
          </div>
          <section class="card shadow-sm">
            <div class="card-body">
              <p class="mb-2">Használd mind a(z) {{ words.length }} szót egy-két összefüggő mondatban:</p>
              <ul class="composition-words list-unstyled mb-3">
                @for (word of words; track word.id; let i = $index) {
                  <li class="composition-word" [class.is-found]="isMentioned(word)">
                    <div class="d-flex align-items-center gap-2">
                      <span class="composition-mark" aria-hidden="true">{{ isMentioned(word) ? '✓' : '•' }}</span>
                      <span class="fw-semibold">{{ word.term }}</span>
                      <app-speak-button [text]="word.term" lang="en" label="A szó" />
                      @if (result === null) {
                        <button
                          type="button"
                          class="btn btn-link btn-sm ms-auto"
                          [disabled]="isBusy || !canSwap"
                          [title]="canSwap ? 'Másik szót kérek helyette' : 'Nincs több szó a választásban'"
                          (click)="swapWord(i)">Csere</button>
                      }
                    </div>
                    <div class="small text-body-secondary">{{ word.definition }}</div>
                  </li>
                }
              </ul>

              <label class="form-label fw-semibold" for="composition-text">A szöveged</label>
              <textarea
                #textInput
                id="composition-text"
                name="compositionText"
                class="form-control mb-1"
                rows="3"
                [attr.maxlength]="maxTextLength"
                autocomplete="off"
                spellcheck="false"
                [(ngModel)]="text"
                (ngModelChange)="missingTerms = []"
                [readonly]="result !== null || isChecking"
                (keydown.enter)="onEnter($event)"></textarea>
              <div class="form-text text-end mb-2">{{ text.length }} / {{ maxTextLength }}</div>

              @if (missingTerms.length > 0) {
                <div class="alert alert-warning py-2" role="status">
                  Nem találom a szövegben: {{ missingTerms.join(', ') }}. Ha rendhagyó alakban használtad (pl. go → went), nyugodtan küldd el.
                  <button type="button" class="btn btn-sm btn-outline-secondary ms-2" (click)="check(true)">Mégis elküldöm</button>
                </div>
              }

              @if (result === null) {
                <div class="d-flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" [disabled]="!text.trim() || isBusy" (click)="check()">
                    @if (isChecking) {
                      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                    }
                    Ellenőrzés
                  </button>
                  <button type="button" class="btn btn-outline-secondary" [disabled]="isBusy" (click)="loadHint()" title="Magyar szöveg, amit lefordíthatsz angolra">
                    @if (isLoadingHint) {
                      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                    }
                    {{ hint ? 'Másik tipp' : 'Tipp' }}
                  </button>
                  <button type="button" class="btn btn-link ms-auto" [disabled]="isBusy" (click)="next()">Kihagyás</button>
                </div>
              }

              @if (hint) {
                <div class="composition-note mt-3">
                  <span class="small text-body-secondary d-block">Tipp – fordítsd le angolra</span>
                  <span>{{ hint }}</span>
                  <app-speak-button [text]="hint" lang="hu" label="A magyar szöveg" />
                </div>
              }

              @if (result) {
                <div class="mt-3" role="status">
                  <div class="alert mb-3" [class.alert-success]="result.isCorrect" [class.alert-danger]="!result.isCorrect">
                    <strong>{{ manuallyAccepted ? 'Elfogadva kézzel.' : result.isCorrect ? 'Helyes!' : 'Nem egészen.' }}</strong> {{ result.feedback }}
                  </div>
                  <div class="d-flex flex-wrap gap-2 mb-3">
                    @for (word of result.words; track word.cardId) {
                      <span class="badge" [class.text-bg-success]="word.usedCorrectly" [class.text-bg-danger]="!word.usedCorrectly">{{ word.usedCorrectly ? '✓' : '✗' }} {{ word.term }}</span>
                    }
                    <span class="badge" [class.text-bg-success]="result.grammarCorrect" [class.text-bg-danger]="!result.grammarCorrect">{{ result.grammarCorrect ? '✓' : '✗' }} Nyelvtan</span>
                    <span class="badge" [class.text-bg-success]="result.coherent" [class.text-bg-danger]="!result.coherent">{{ result.coherent ? '✓' : '✗' }} Összefüggés</span>
                  </div>
                  @if (result.hungarianTranslation) {
                    <div class="composition-note mb-3">
                      <span class="small text-body-secondary d-block">A szöveged jelentése magyarul</span>
                      <span>{{ result.hungarianTranslation }}</span>
                      <app-speak-button [text]="result.hungarianTranslation" lang="hu" label="A magyar jelentés" />
                    </div>
                  }
                  @if (result.correctedText) {
                    <div class="composition-note mb-3">
                      <span class="small text-body-secondary d-block">Javított szöveg</span>
                      <span>{{ result.correctedText }}</span>
                      <app-speak-button [text]="result.correctedText" lang="en" label="A javított szöveg" />
                    </div>
                  }
                  @if (example) {
                    <div class="composition-note mb-3">
                      <span class="small text-body-secondary d-block">Példa</span>
                      <span>{{ example }}</span>
                      <app-speak-button [text]="example" lang="en" label="A példa" />
                    </div>
                  }
                  <div class="d-flex flex-wrap gap-2">
                    <button #nextButton type="button" class="btn btn-primary" [disabled]="isBusy" (click)="next()">Következő</button>
                    @if (example === null) {
                      <button type="button" class="btn btn-outline-secondary" [disabled]="isBusy" (click)="loadExample()">
                        @if (isLoadingExample) {
                          <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                        }
                        Mutass egy példát
                      </button>
                    }
                    @if (!result.isCorrect) {
                      <button type="button" class="btn btn-outline-success" [disabled]="isBusy" (click)="acceptManually()">
                        @if (isAccepting) {
                          <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                        }
                        Márpedig jó volt
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
          <div class="d-flex justify-content-center flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-link btn-sm" [disabled]="isBusy" (click)="finish()">Befejezés</button>
            <button type="button" class="btn btn-link btn-sm" [disabled]="isBusy" (click)="backToSetup()">Vissza a beállításokhoz</button>
          </div>
        }

        @if (phase === 'done') {
          <section class="card shadow-sm text-center">
            <div class="card-body py-4">
              <h2 class="h5 mb-2">Kész!</h2>
              <p class="mb-3">{{ checkedCount }} ellenőrzött szövegből {{ correctCount }} lett helyes.</p>
              <div class="d-flex flex-wrap justify-content-center gap-2">
                <button type="button" class="btn btn-primary" (click)="restart()">Újrakezdés</button>
                <button type="button" class="btn btn-outline-secondary" (click)="backToSetup()">Vissza a beállításokhoz</button>
              </div>
            </div>
          </section>
        }
      </div>
    </main>
  `,
  styles: [`
    .composition-words { display: grid; gap: .5rem; }
    .composition-word { padding: .5rem .75rem; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); background: var(--app-surface-2); }
    .composition-word.is-found { border-color: var(--bs-success); }
    .composition-mark { width: 1rem; text-align: center; color: var(--app-muted); }
    .composition-word.is-found .composition-mark { color: var(--bs-success); }
    .composition-note { padding: .6rem .9rem; border-left: 3px solid var(--app-primary); background: var(--app-surface-2); border-radius: var(--app-radius-sm); }
  `],
})
export class CompositionComponent implements OnInit {
  @Output() openDecks = new EventEmitter<void>();
  @ViewChild('textInput') private textInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('nextButton') private nextButton?: ElementRef<HTMLButtonElement>;

  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly speech = inject(SpeechService);
  private readonly apiBaseUrl = '/api';

  readonly wordCounts = Array.from({ length: MAX_WORDS - MIN_WORDS + 1 }, (_, i) => MIN_WORDS + i);
  readonly maxTextLength = MAX_TEXT_LENGTH;

  showTranslation = false;
  isSavingTranslation = false;

  decks: CompositionDeck[] = [];
  tagOptions: CompositionTagOption[] = [];
  deckChoice: CompositionDeckChoice = 'all';
  tag = '';
  onlyReviewed = false;
  wordCount = 3;
  isLoadingDecks = false;
  isLoadingCards = false;
  emptySelection = false;
  tooFewCards: number | null = null;

  phase: CompositionPhase = 'setup';
  // A választás összes (szó szerint különböző) kártyája; ebből húz a feladatokhoz.
  pool: CompositionCard[] = [];
  words: CompositionCard[] = [];
  taskNumber = 0;
  text = '';
  missingTerms: string[] = [];
  example: string | null = null;
  hint: string | null = null;
  result: CompositionCheckResponse | null = null;
  isChecking = false;
  isLoadingExample = false;
  isLoadingHint = false;
  isAccepting = false;
  manuallyAccepted = false;
  correctCount = 0;
  checkedCount = 0;
  errorMessage: string | null = null;

  // Feladat- és szócserekor nő: a régi feladatra érkező válasz nem íródhat az újra.
  private loadGeneration = 0;
  // Kártyánként az utolsó húzás sorszáma: a húzás a legrégebben használt szavakat veszi előre.
  private readonly lastUsed = new Map<number, number>();
  private useCounter = 0;

  get isBusy(): boolean {
    return this.isChecking || this.isLoadingExample || this.isLoadingHint || this.isAccepting;
  }

  get canSwap(): boolean {
    return this.pool.length > this.words.length;
  }

  ngOnInit(): void {
    this.loadPreferences();
    this.loadTranslationSetting();
    this.loadDecks();
  }

  setWordCount(count: number): void {
    this.wordCount = count;
    this.tooFewCards = null;
    this.savePreference('words', String(count));
  }

  toggleTranslation(): void {
    if (this.isSavingTranslation) {
      return;
    }

    const previous = this.showTranslation;
    this.showTranslation = !previous;
    this.errorMessage = null;
    this.isSavingTranslation = true;
    this.http.put<CompositionTranslationSetting>(`${this.apiBaseUrl}/grammar/translation`, { enabled: this.showTranslation })
      .pipe(finalize(() => this.isSavingTranslation = false))
      .subscribe({
        next: response => this.showTranslation = response.enabled,
        error: () => {
          this.showTranslation = previous;
          this.errorMessage = 'A beállítás mentése sikertelen. Kérlek, próbáld újra.';
        },
      });
  }

  onDeckChange(): void {
    this.clearSelectionNotices();
    this.savePreference('deck', String(this.deckChoice));
    this.refreshTagOptions();
  }

  onTagChange(): void {
    this.clearSelectionNotices();
    this.savePreference('tag', this.tag);
  }

  onReviewedChange(): void {
    this.clearSelectionNotices();
    this.savePreference('reviewed', String(this.onlyReviewed));
  }

  start(): void {
    if (this.isLoadingCards) {
      return;
    }

    const params: Record<string, string | number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    if (this.tag) {
      params['tag'] = this.tag;
    }

    if (this.onlyReviewed) {
      params['focus'] = 'reviewed';
    }

    this.errorMessage = null;
    this.clearSelectionNotices();
    this.isLoadingCards = true;
    this.http.get<CompositionCard[]>(`${this.apiBaseUrl}/free-study/cards`, { params })
      .pipe(finalize(() => this.isLoadingCards = false))
      .subscribe({
        next: cards => {
          // Ugyanaz a szó két kártyán ne kerüljön egy feladatba.
          const seen = new Set<string>();
          const pool = cards
            .map(card => ({ id: card.id, term: card.term, definition: card.definition }))
            .filter(card => {
              const key = card.term.trim().toLowerCase();
              if (seen.has(key)) {
                return false;
              }

              seen.add(key);
              return true;
            });

          if (pool.length === 0) {
            this.emptySelection = true;
            return;
          }

          if (pool.length < this.wordCount) {
            this.tooFewCards = pool.length;
            return;
          }

          this.pool = pool;
          this.beginRound();
        },
        error: () => this.errorMessage = 'A kártyák betöltése sikertelen. Kérlek, próbáld újra.',
      });
  }

  restart(): void {
    this.beginRound();
  }

  finish(): void {
    if (this.isBusy) {
      return;
    }

    this.speech.stop();
    this.loadGeneration++;
    this.resetTaskState();
    this.phase = 'done';
  }

  backToSetup(): void {
    if (this.isBusy) {
      return;
    }

    this.speech.stop();
    this.loadGeneration++;
    this.phase = 'setup';
    this.pool = [];
    this.words = [];
    this.resetTaskState();
  }

  isMentioned(card: CompositionCard): boolean {
    return this.mentionsTerm(this.text, card.term);
  }

  swapWord(position: number): void {
    if (this.isBusy || this.result !== null || !this.canSwap) {
      return;
    }

    const replacement = this.draw(1, this.words)[0];
    if (!replacement) {
      return;
    }

    this.markUsed([replacement]);
    this.words =this.words.map((word, index) => index === position ? replacement : word);
    this.loadGeneration++;
    this.missingTerms = [];
    this.example = null;
    this.hint = null;
    this.errorMessage = null;
  }

  onEnter(event: Event): void {
    event.preventDefault();
    if (this.result === null) {
      this.check();
    }
  }

  check(force = false): void {
    const text = this.text.trim();
    if (this.words.length === 0 || !text || this.isBusy || this.result !== null) {
      return;
    }

    // Puha előszűrő MI-hívás nélkül: rendhagyó alaknál a tanuló mégis elküldheti.
    const missing = this.words.filter(word => !this.mentionsTerm(text, word.term)).map(word => word.term);
    if (!force && missing.length > 0) {
      this.missingTerms = missing;
      return;
    }

    const generation = this.loadGeneration;
    this.missingTerms = [];
    this.errorMessage = null;
    this.isChecking = true;
    this.http.post<CompositionCheckResponse>(`${this.apiBaseUrl}/ai/composition/check`, {
      cardIds: this.words.map(word => word.id),
      text,
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isChecking = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.result = result;
          this.checkedCount++;
          if (result.isCorrect) {
            this.correctCount++;
          }

          setTimeout(() => this.nextButton?.nativeElement.focus({ preventScroll: true }));
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.setHttpError(error, 'Az ellenőrzés');
        },
      });
  }

  // Csak ellenőrzés után kérhető, mintaként; előtte bemásolható puska lenne.
  loadExample(): void {
    if (this.words.length === 0 || this.isBusy || this.example !== null || this.result === null) {
      return;
    }

    const generation = this.loadGeneration;
    this.errorMessage = null;
    this.isLoadingExample = true;
    this.http.post<CompositionExampleResponse>(`${this.apiBaseUrl}/ai/composition/example`, {
      cardIds: this.words.map(word => word.id),
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingExample = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation === this.loadGeneration) {
            this.example = response.example;
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation === this.loadGeneration) {
            this.setHttpError(error, 'A példa kérése');
          }
        },
      });
  }

  // Magyar szöveg a feladat szavaival; többször is kérhető.
  loadHint(): void {
    if (this.words.length === 0 || this.isBusy || this.result !== null) {
      return;
    }

    const generation = this.loadGeneration;
    this.errorMessage = null;
    this.isLoadingHint = true;
    this.http.post<CompositionHintResponse>(`${this.apiBaseUrl}/ai/composition/hint`, {
      cardIds: this.words.map(word => word.id),
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingHint = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation === this.loadGeneration) {
            this.hint = response.text;
            this.focusText();
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation === this.loadGeneration) {
            this.setHttpError(error, 'A tipp kérése');
          }
        },
      });
  }

  // "Márpedig jó volt": az MI szerint hibás szöveg kézzel helyesnek jelölve (a szerveren a mentett eredmény is átvált).
  acceptManually(): void {
    const result = this.result;
    if (!result || result.isCorrect || this.isBusy) {
      return;
    }

    const generation = this.loadGeneration;
    this.errorMessage = null;
    this.isAccepting = true;
    this.http.put<void>(`${this.apiBaseUrl}/composition/attempts/${result.attemptId}/accept`, {})
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isAccepting = false;
        }
      }))
      .subscribe({
        next: () => {
          if (generation !== this.loadGeneration || this.result !== result) {
            return;
          }

          this.result = { ...result, isCorrect: true, correctedText: '' };
          this.manuallyAccepted = true;
          this.correctCount++;
          setTimeout(() => this.nextButton?.nativeElement.focus({ preventScroll: true }));
        },
        error: () => {
          if (generation === this.loadGeneration) {
            this.errorMessage = 'A kézi elfogadás mentése sikertelen. Kérlek, próbáld újra.';
          }
        },
      });
  }

  next(): void {
    if (this.isBusy) {
      return;
    }

    this.speech.stop();
    this.nextTask();
  }

  private beginRound(): void {
    this.lastUsed.clear();
    this.words = [];
    this.taskNumber = 0;
    this.correctCount = 0;
    this.checkedCount = 0;
    this.phase = 'practice';
    this.nextTask();
  }

  private nextTask(): void {
    this.loadGeneration++;
    this.resetTaskState();
    // Az előző feladat szavai csak akkor jönnek újra azonnal, ha a választás másképp nem elég.
    const previous = this.words;
    let picked = this.draw(this.wordCount, previous);
    if (picked.length < this.wordCount) {
      picked = [...picked, ...this.draw(this.wordCount - picked.length, picked)];
    }

    this.markUsed(picked);
    this.words = picked;
    this.taskNumber++;
    this.focusText();
  }

  // A legrégebben (vagy még soha) használt kártyák előre, azonos helyzetben véletlen sorrendben.
  private draw(count: number, exclude: CompositionCard[]): CompositionCard[] {
    const excluded = new Set(exclude.map(card => card.id));
    return this.shuffle(this.pool.filter(card => !excluded.has(card.id)))
      .sort((a, b) => (this.lastUsed.get(a.id) ?? 0) - (this.lastUsed.get(b.id) ?? 0))
      .slice(0, count);
  }

  private markUsed(cards: CompositionCard[]): void {
    for (const card of cards) {
      this.lastUsed.set(card.id, ++this.useCounter);
    }
  }

  private resetTaskState(): void {
    this.text = '';
    this.missingTerms = [];
    this.example = null;
    this.hint = null;
    this.result = null;
    this.isChecking = false;
    this.isLoadingExample = false;
    this.isLoadingHint = false;
    this.isAccepting = false;
    this.manuallyAccepted = false;
    this.errorMessage = null;
  }

  private clearSelectionNotices(): void {
    this.emptySelection = false;
    this.tooFewCards = null;
  }

  private loadTranslationSetting(): void {
    this.http.get<CompositionTranslationSetting>(`${this.apiBaseUrl}/grammar/translation`).subscribe({
      next: response => this.showTranslation = response.enabled,
      error: () => this.showTranslation = false,
    });
  }

  private loadDecks(): void {
    this.isLoadingDecks = true;
    this.http.get<CompositionDeck[]>(`${this.apiBaseUrl}/decks`)
      .pipe(finalize(() => this.isLoadingDecks = false))
      .subscribe({
        next: decks => {
          this.decks = decks;
          if (typeof this.deckChoice === 'number' && !decks.some(deck => deck.id === this.deckChoice)) {
            this.deckChoice = 'all';
          }

          this.refreshTagOptions();
        },
        error: () => this.errorMessage = 'A paklik betöltése sikertelen. Kérlek, frissítsd az oldalt.',
      });
  }

  private refreshTagOptions(): void {
    const params: Record<string, string | number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    this.http.get<CompositionTagOption[]>(`${this.apiBaseUrl}/cards/tags`, { params }).subscribe({
      next: options => {
        this.tagOptions = options;
        if (this.tag && !options.some(option => option.tag === this.tag)) {
          this.tag = '';
          this.savePreference('tag', '');
        }
      },
      error: () => {
        this.tagOptions = [];
        this.tag = '';
      },
    });
  }

  private loadPreferences(): void {
    const deck = this.readPreference('deck');
    const deckId = Number(deck);
    this.deckChoice = deck && Number.isInteger(deckId) && deckId > 0 ? deckId : 'all';
    this.tag = this.readPreference('tag') ?? '';
    this.onlyReviewed = this.readPreference('reviewed') === 'true';
    const count = Number(this.readPreference('words'));
    this.wordCount = Number.isInteger(count) && count >= MIN_WORDS && count <= MAX_WORDS ? count : 3;
  }

  private savePreference(name: CompositionPreference, value: string): void {
    try {
      localStorage.setItem(this.preferenceKey(`composition-${name}`), value);
    } catch {
      // Letiltott tárolónál a választás csak erre a munkamenetre szól.
    }
  }

  private readPreference(name: CompositionPreference): string | null {
    try {
      return localStorage.getItem(this.preferenceKey(`composition-${name}`));
    } catch {
      return null;
    }
  }

  private preferenceKey(name: string): string {
    const identity = this.session.email()?.trim().toLowerCase() || 'anonymous';
    return `vocabapp.${identity}.${name}`;
  }

  // Elég, ha a kifejezés leghosszabb szavának eleje (legfeljebb 4 betű) valamelyik szó elején megvan,
  // így a ragozott alak (works, studied, dogs) is átmegy. A grammar.component.ts mentionsTerm-jének másolata.
  private mentionsTerm(text: string, term: string): boolean {
    const termWords = this.tokens(term).filter(word => word !== 'to');
    if (termWords.length === 0) {
      return true;
    }

    const longest = termWords.reduce((best, word) => word.length > best.length ? word : best);
    const prefix = longest.slice(0, Math.min(4, longest.length));
    return this.tokens(text).some(word => word.startsWith(prefix));
  }

  private tokens(value: string): string[] {
    return value.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(word => word.length > 0);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  }

  private focusText(): void {
    setTimeout(() => this.textInput?.nativeElement.focus({ preventScroll: true }));
  }

  private setHttpError(error: HttpErrorResponse, context: string): void {
    if (error.status === 503) {
      this.errorMessage = `${context} sikertelen: az MI-szolgáltatás nincs konfigurálva.`;
    } else if (error.status === 502) {
      this.errorMessage = `${context} sikertelen: az MI-szolgáltató nem adott megfelelő választ.`;
    } else if (error.status === 404) {
      this.errorMessage = `${context} sikertelen: a kért adat nem található.`;
    } else if (error.status === 429) {
      this.errorMessage = `${context} sikertelen: az MI-keret elfogyott.`;
    } else {
      this.errorMessage = `${context} sikertelen. Kérlek, próbáld újra.`;
    }
  }
}
