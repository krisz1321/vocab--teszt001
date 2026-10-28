import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { IconComponent } from './icon.component';
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
  imports: [CommonModule, FormsModule, SpeakButtonComponent, IconComponent],
  template: `
    <div class="page">
      @if (phase === 'setup') {
        <header class="page-head">
          <div class="ph-text">
            <h1 class="h1">Mondatok</h1>
            <p class="lead">Írj egy-két összefüggő mondatot a kapott szavakkal. Nem számít bele az ismétlésbe.</p>
          </div>
        </header>
      } @else {
        <h1 class="sr-only">Mondatok</h1>
      }

      @if (errorMessage) {
        <div class="notice notice-bad" role="alert"><app-icon name="warn" /><div>{{ errorMessage }}</div></div>
      }

      @if (phase === 'setup') {
        <form class="start-form" (ngSubmit)="start()">
          @if (isLoadingDecks) {
            <div class="loading" role="status"><div class="spinner"></div></div>
          } @else {
            @if (decks.length === 0) {
              <div class="notice" role="status">
                <app-icon name="info" />
                <div>
                  <span>Még nincs paklid, nincs mit gyakorolni.</span>
                  <span><button type="button" class="btn btn-sm btn-primary" (click)="openDecks.emit()">Ugrás a paklikhoz</button></span>
                </div>
              </div>
            }
            <section class="step">
              <h2 class="step-title"><span class="step-no">1</span>Szavak száma feladatonként</h2>
              <div class="count-tiles" role="group" aria-label="Szavak száma feladatonként">
                @for (count of wordCounts; track count) {
                  <button
                    type="button"
                    class="count-tile"
                    [class.is-on]="wordCount === count"
                    [attr.aria-pressed]="wordCount === count"
                    (click)="setWordCount(count)"><strong>{{ count }}</strong><span>szó</span></button>
                }
              </div>
            </section>

            <section class="step">
              <h2 class="step-title"><span class="step-no">2</span>Szavak</h2>
              <div class="panel form-panel">
                <div class="form-grid">
                  <div class="field">
                    <label for="composition-deck">Pakli</label>
                    <select
                      id="composition-deck"
                      name="compositionDeck"
                      [(ngModel)]="deckChoice"
                      (ngModelChange)="onDeckChange()">
                      <option [ngValue]="'all'">Összes pakli</option>
                      @for (deck of decks; track deck.id) {
                        <option [ngValue]="deck.id">{{ deck.name }}</option>
                      }
                    </select>
                  </div>
                  @if (tagOptions.length > 0) {
                    <div class="field">
                      <label for="composition-tag">Címke</label>
                      <select
                        id="composition-tag"
                        name="compositionTag"
                        [(ngModel)]="tag"
                        (ngModelChange)="onTagChange()">
                        <option [ngValue]="''">Minden címke</option>
                        @for (option of tagOptions; track option.tag) {
                          <option [ngValue]="option.tag">{{ option.tag }} ({{ option.count }})</option>
                        }
                      </select>
                    </div>
                  }
                </div>
                <label class="row-toggle" for="composition-reviewed">
                  <span class="t"><span>Csak a már tanult szavak</span><small>Csak, amit már legalább egyszer gyakoroltál.</small></span>
                  <span class="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      id="composition-reviewed"
                      name="compositionReviewed"
                      [(ngModel)]="onlyReviewed"
                      (ngModelChange)="onReviewedChange()"><span></span>
                  </span>
                </label>
              </div>
            </section>

            <section class="step">
              <h2 class="step-title"><span class="step-no">3</span>Visszajelzés</h2>
              <div class="panel form-panel">
                <label class="row-toggle" for="composition-translation">
                  <span class="t"><span>A szövegem magyar jelentése az ellenőrzés után</span><small>Ugyanez a beállítás a Nyelvtanban is. Nem kér külön MI-hívást.</small></span>
                  <span class="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      id="composition-translation"
                      [checked]="showTranslation"
                      [disabled]="isSavingTranslation"
                      (change)="toggleTranslation()"><span></span>
                  </span>
                </label>
              </div>
            </section>

            @if (emptySelection) {
              <div class="notice" role="status"><app-icon name="info" /><div>Ebben a választásban nincs kártya.</div></div>
            }
            @if (tooFewCards !== null) {
              <div class="notice" role="status"><app-icon name="warn" /><div>Ebben a választásban csak {{ tooFewCards }} különböző szó van. Válassz kevesebb szót feladatonként, vagy bővítsd a választást.</div></div>
            }
            <div class="start-row">
              <button type="submit" class="btn btn-primary btn-lg" [disabled]="isLoadingCards">
                @if (isLoadingCards) {
                  <span class="spinner spinner-sm" aria-hidden="true"></span>
                } @else {
                  <app-icon name="play" />
                }
                Indítás
              </button>
              <span class="muted">{{ wordCount }} szó feladatonként</span>
            </div>
          }
        </form>
      }

      @if (phase === 'practice' && words.length > 0) {
        <section class="session-bar" aria-label="A gyakorlás állása">
          <button type="button" class="mode-btn" [disabled]="isBusy" (click)="backToSetup()" title="Vissza a beállításokhoz">
            <app-icon name="text" />
            <span>Mondatok · {{ words.length }} szó</span>
            <app-icon name="chev" />
          </button>
          <span class="counts"><span><strong>{{ taskNumber }}.</strong> feladat</span><span>{{ checkedCount > 0 ? correctCount + ' / ' + checkedCount + ' helyes' : 'még nincs ellenőrzött szöveg' }}</span></span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="isBusy" (click)="finish()">Befejezés</button>
        </section>
        <article class="panel task-card">
          <h2 class="task-title">Használd mind a(z) {{ words.length }} szót egy-két mondatban</h2>
          <div class="word-cards">
            @for (word of words; track word.id; let i = $index) {
              <div class="word-card" [class.is-found]="isMentioned(word)">
                <div>
                  <strong class="wc-term">
                    @if (isMentioned(word)) {
                      <span class="wc-found" title="Szerepel a szövegben"><app-icon name="check" /></span>
                    }
                    {{ word.term }}
                  </strong>
                  <span class="muted">{{ word.definition }}</span>
                </div>
                <app-speak-button [text]="word.term" lang="en" label="A szó" />
                @if (result === null) {
                  <button
                    type="button"
                    class="icon-btn"
                    [disabled]="isBusy || !canSwap"
                    [title]="canSwap ? 'Másik szó ide' : 'Nincs több szó a választásban'"
                    [attr.aria-label]="word.term + ' cseréje'"
                    (click)="swapWord(i)"><app-icon name="refresh" /></button>
                }
              </div>
            }
          </div>

          <div class="field">
            <label for="composition-text">A szöveged</label>
            <textarea
              #textInput
              id="composition-text"
              name="compositionText"
              rows="4"
              [attr.maxlength]="maxTextLength"
              autocomplete="off"
              spellcheck="false"
              placeholder="Írd ide az angol szöveget…"
              [(ngModel)]="text"
              (ngModelChange)="missingTerms = []"
              [readonly]="result !== null || isChecking"
              (keydown.enter)="onEnter($event)"></textarea>
            <span class="counter">{{ text.length }} / {{ maxTextLength }}</span>
          </div>

          @if (missingTerms.length > 0) {
            <div class="notice" role="status">
              <app-icon name="warn" />
              <div>
                <span>Ezt nem látom a szövegben: {{ missingTerms.join(', ') }}. Ha más alakban írtad (pl. go → went), küldd el nyugodtan.</span>
                <span><button type="button" class="btn btn-sm" (click)="check(true)">Mégis elküldöm</button></span>
              </div>
            </div>
          }

          @if (hint) {
            <div class="example-box">
              <span class="ai-tag"><app-icon name="bulb" /> Tipp – fordítsd le angolra</span>
              <div class="speak-row">
                <p>{{ hint }}</p>
                <app-speak-button [text]="hint" lang="hu" label="A magyar szöveg" />
              </div>
            </div>
          }

          @if (result === null) {
            <div class="actions">
              <button type="button" class="btn btn-primary btn-lg" [disabled]="!text.trim() || isBusy" (click)="check()">
                @if (isChecking) {
                  <span class="spinner spinner-sm" aria-hidden="true"></span>
                } @else {
                  <app-icon name="sparkle" />
                }
                Ellenőrzés
              </button>
              <button type="button" class="btn btn-lg" [disabled]="isBusy" (click)="loadHint()" title="Magyar szöveg, amit lefordíthatsz angolra">
                @if (isLoadingHint) {
                  <span class="spinner spinner-sm" aria-hidden="true"></span>
                } @else {
                  <app-icon name="bulb" />
                }
                {{ hint ? 'Másik tipp' : 'Tipp kérése' }}
              </button>
              <button type="button" class="btn btn-ghost btn-lg" [disabled]="isBusy" (click)="next()">Kihagyás</button>
            </div>
          }

          @if (result) {
            <div class="feedback" [class.ok]="result.isCorrect || manuallyAccepted" [class.neutral]="!result.isCorrect && !manuallyAccepted" role="status">
              <div class="fb-title">
                <app-icon [name]="result.isCorrect || manuallyAccepted ? 'check' : 'warn'" />
                {{ manuallyAccepted ? 'Elfogadva helyesnek.' : result.isCorrect ? 'Helyes!' : 'Nem egészen.' }}
              </div>
              <ul class="check-list">
                @for (word of result.words; track word.cardId) {
                  <li><span class="check-ic" [class.ok]="word.usedCorrectly" [class.bad]="!word.usedCorrectly"><app-icon [name]="word.usedCorrectly ? 'check' : 'x'" /></span><strong>{{ word.term }}</strong></li>
                }
                <li><span class="check-ic" [class.ok]="result.grammarCorrect" [class.warn]="!result.grammarCorrect"><app-icon [name]="result.grammarCorrect ? 'check' : 'warn'" /></span><strong>Nyelvtan</strong></li>
                <li><span class="check-ic" [class.ok]="result.coherent" [class.warn]="!result.coherent"><app-icon [name]="result.coherent ? 'check' : 'warn'" /></span><strong>Összefüggés</strong></li>
              </ul>
              @if (result.feedback) {
                <div class="ai-note">
                  <span class="ai-tag"><app-icon name="sparkle" /> MI-visszajelzés</span>
                  <p>{{ result.feedback }}</p>
                </div>
              }
              @if (result.correctedText) {
                <div class="ai-note">
                  <span class="ai-tag"><app-icon name="check" /> Javított szöveg</span>
                  <div class="speak-row">
                    <p class="example">{{ result.correctedText }}</p>
                    <app-speak-button [text]="result.correctedText" lang="en" label="A javított szöveg" />
                  </div>
                </div>
              }
              @if (result.hungarianTranslation) {
                <div class="translation speak-row">
                  <p><span class="muted">A szöveged magyarul:</span> {{ result.hungarianTranslation }}</p>
                  <app-speak-button [text]="result.hungarianTranslation" lang="hu" label="A magyar jelentés" />
                </div>
              }
            </div>
            @if (example) {
              <div class="example-box">
                <span class="ai-tag"><app-icon name="bulb" /> Példa</span>
                <div class="speak-row">
                  <p class="example">{{ example }}</p>
                  <app-speak-button [text]="example" lang="en" label="A példa" />
                </div>
              </div>
            }
            <div class="actions">
              <button #nextButton type="button" class="btn btn-primary btn-lg" [disabled]="isBusy" (click)="next()">Következő feladat <app-icon name="arrowR" /></button>
              @if (example === null) {
                <button type="button" class="btn btn-lg" [disabled]="isBusy" (click)="loadExample()">
                  @if (isLoadingExample) {
                    <span class="spinner spinner-sm" aria-hidden="true"></span>
                  } @else {
                    <app-icon name="bulb" />
                  }
                  Mutass egy példát
                </button>
              }
              @if (!result.isCorrect) {
                <button type="button" class="btn btn-lg" [disabled]="isBusy" (click)="acceptManually()">
                  @if (isAccepting) {
                    <span class="spinner spinner-sm" aria-hidden="true"></span>
                  } @else {
                    <app-icon name="check" />
                  }
                  Márpedig jó volt
                </button>
              }
            </div>
          }
        </article>
      }

      @if (phase === 'done') {
        <section class="panel empty">
          <span class="empty-ic"><app-icon name="check" /></span>
          <h2 class="h1">Kész!</h2>
          <p class="lead">{{ checkedCount }} ellenőrzött szövegből {{ correctCount }} lett helyes.</p>
          <div class="actions center">
            <button type="button" class="btn btn-primary" (click)="restart()"><app-icon name="refresh" /> Újrakezdés</button>
            <button type="button" class="btn" (click)="backToSetup()">Vissza a beállításokhoz</button>
          </div>
        </section>
      }
    </div>
  `,
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
          this.errorMessage = 'A beállítás mentése sikertelen. Próbáld újra.';
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
        error: () => this.errorMessage = 'A kártyák betöltése sikertelen. Próbáld újra.',
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
            this.errorMessage = 'A kézi elfogadás mentése sikertelen. Próbáld újra.';
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
        error: () => this.errorMessage = 'A paklik betöltése sikertelen. Frissítsd az oldalt.',
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
    // A szerver magyar ProblemDetails-címe pontosabb, mint a státuszkódból kikövetkeztetett szöveg.
    const title = (error.error as { title?: unknown } | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      this.errorMessage = `${context} sikertelen. ${title.trim()}`;
      return;
    }

    if (error.status === 503) {
      this.errorMessage = `${context} sikertelen: az MI nincs beállítva.`;
    } else if (error.status === 502) {
      this.errorMessage = `${context} sikertelen: az MI nem adott használható választ.`;
    } else if (error.status === 404) {
      this.errorMessage = `${context} sikertelen: a kért adat nem található.`;
    } else if (error.status === 429) {
      this.errorMessage = `${context} sikertelen: az MI-keret elfogyott.`;
    } else {
      this.errorMessage = `${context} sikertelen. Próbáld újra.`;
    }
  }
}
