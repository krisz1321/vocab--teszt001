import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { SpeakButtonComponent } from './speak-button.component';
import { SpeechService } from './speech.service';

type TenseGroup = 'present' | 'past' | 'future';
type GrammarPhase = 'setup' | 'practice' | 'done';
type GrammarDeckChoice = number | 'all';

interface TenseOption {
  key: string;
  label: string;
  hint: string;
  group: TenseGroup;
}

interface GrammarDeck {
  id: number;
  name: string;
  cardCount?: number;
}

interface GrammarTagOption {
  tag: string;
  count: number;
}

interface GrammarCard {
  id: number;
  term: string;
  definition: string;
}

interface GrammarTensesResponse {
  tenses: string[];
}

interface GrammarCheckResponse {
  attemptId: number;
  isCorrect: boolean;
  termUsedCorrectly: boolean;
  tenseCorrect: boolean;
  grammarCorrect: boolean;
  feedback: string;
  correctedSentence: string;
  hungarianTranslation: string;
}

interface GrammarTranslationSetting {
  enabled: boolean;
}

interface GrammarExampleResponse {
  example: string;
}

interface GrammarHintResponse {
  sentence: string;
}

// A kulcsok a backend Models/GrammarTenses.cs listájával egyeznek.
const TENSE_OPTIONS: TenseOption[] = [
  { key: 'present_simple', label: 'Present simple', hint: 'alapalak, E/3-ban -s (she works)', group: 'present' },
  { key: 'present_continuous', label: 'Present continuous', hint: 'am/is/are + -ing (she is working)', group: 'present' },
  { key: 'present_perfect', label: 'Present perfect', hint: 'have/has + 3. alak (she has worked)', group: 'present' },
  { key: 'present_perfect_continuous', label: 'Present perfect continuous', hint: 'have/has been + -ing (she has been working)', group: 'present' },
  { key: 'past_simple', label: 'Past simple', hint: '2. alak / -ed (she worked)', group: 'past' },
  { key: 'past_continuous', label: 'Past continuous', hint: 'was/were + -ing (she was working)', group: 'past' },
  { key: 'past_perfect', label: 'Past perfect', hint: 'had + 3. alak (she had worked)', group: 'past' },
  { key: 'past_perfect_continuous', label: 'Past perfect continuous', hint: 'had been + -ing (she had been working)', group: 'past' },
  { key: 'future_simple', label: 'Future simple (will)', hint: 'will + alapalak (she will work)', group: 'future' },
  { key: 'going_to', label: 'Be going to', hint: 'am/is/are going to + alapalak (she is going to work)', group: 'future' },
  { key: 'future_continuous', label: 'Future continuous', hint: 'will be + -ing (she will be working)', group: 'future' },
  { key: 'future_perfect', label: 'Future perfect', hint: 'will have + 3. alak (she will have worked)', group: 'future' },
  { key: 'future_perfect_continuous', label: 'Future perfect continuous', hint: 'will have been + -ing (she will have been working)', group: 'future' },
];

const TENSE_GROUPS: { id: TenseGroup; label: string }[] = [
  { id: 'present', label: 'Jelen' },
  { id: 'past', label: 'Múlt' },
  { id: 'future', label: 'Jövő' },
];

@Component({
  selector: 'app-grammar',
  standalone: true,
  imports: [CommonModule, FormsModule, SpeakButtonComponent],
  template: `
    <main>
      <div class="page-wrap">
        <header>
          <h1>Nyelvtan</h1>
          <p>Írj mondatokat a választott igeidőkben. Nem számít bele az ismétlésbe.</p>
        </header>

        @if (errorMessage) {
          <div role="alert">{{ errorMessage }}</div>
        }

        @if (phase === 'setup') {
          <section>
            <div>
              <h2>Igeidők</h2>
              <p>Minden szónál véletlenszerűen kapsz egyet a bejelölt igeidők közül. A választásod mentődik.</p>
              @if (isLoadingTenses) {
                <div class="loading" role="status"><div class="spinner"></div></div>
              } @else {
                <div role="group" aria-label="Gyorsválasztás">
                  <button type="button" [disabled]="isSavingTenses" (click)="selectAll()">Mind</button>
                  @for (group of groups; track group.id) {
                    <button type="button" [disabled]="isSavingTenses" (click)="selectGroup(group.id)">{{ group.label }}</button>
                  }
                  <button type="button" [disabled]="isSavingTenses" (click)="selectNone()">Egyik sem</button>
                </div>
                <div class="grammar-groups">
                  @for (group of groups; track group.id) {
                    <fieldset>
                      <legend>{{ group.label }}</legend>
                      @for (tense of tensesOf(group.id); track tense.key) {
                        <div>
                          <input
                            type="checkbox"
                            [id]="'tense-' + tense.key"
                            [checked]="isSelected(tense.key)"
                            [disabled]="isSavingTenses"
                            (change)="toggleTense(tense.key)">
                          <label [for]="'tense-' + tense.key" [title]="tense.hint">{{ tense.label }}</label>
                        </div>
                      }
                    </fieldset>
                  }
                </div>
                @if (selectedTenses.length === 0) {
                  <div role="status">Jelölj be legalább egy igeidőt.</div>
                }
                <div>
                  <input
                    type="checkbox"
                    role="switch"
                    id="grammar-translation"
                    [checked]="showTranslation"
                    [disabled]="isSavingTranslation"
                    (change)="toggleTranslation()">
                  <label for="grammar-translation">A mondatom magyar jelentése az ellenőrzés után</label>
                  <div>Azt fordítja le, amit írtál, hibás mondatnál is. Nem kér külön MI-hívást.</div>
                </div>
              }
            </div>
          </section>

          <form (ngSubmit)="start()">
            <div>
              <h2>Szavak</h2>
              @if (isLoadingDecks) {
                <div class="loading" role="status"><div class="spinner"></div></div>
              } @else {
                @if (decks.length === 0) {
                  <div role="status">
                    <p>Még nincs paklid, nincs mit gyakorolni.</p>
                    <button type="button" (click)="openDecks.emit()">Ugrás a paklikhoz</button>
                  </div>
                }
                <label for="grammar-deck">Pakli</label>
                <select
                  id="grammar-deck"
                  name="grammarDeck"
                  [(ngModel)]="deckChoice"
                  (ngModelChange)="onDeckChange()">
                  <option [ngValue]="'all'">Összes pakli</option>
                  @for (deck of decks; track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
                @if (tagOptions.length > 0) {
                  <label for="grammar-tag">Címke</label>
                  <select
                    id="grammar-tag"
                    name="grammarTag"
                    [(ngModel)]="tag"
                    (ngModelChange)="savePreference('tag', tag)">
                    <option [ngValue]="''">Minden címke</option>
                    @for (option of tagOptions; track option.tag) {
                      <option [ngValue]="option.tag">{{ option.tag }} ({{ option.count }})</option>
                    }
                  </select>
                }
                <div>
                  <input
                    type="checkbox"
                    role="switch"
                    id="grammar-reviewed"
                    name="grammarReviewed"
                    [(ngModel)]="onlyReviewed"
                    (ngModelChange)="onReviewedChange()">
                  <label for="grammar-reviewed">Csak a már tanult szavak</label>
                  <div>Csak, amit már legalább egyszer gyakoroltál.</div>
                </div>
                @if (emptySelection) {
                  <div role="status">Ebben a választásban nincs kártya.</div>
                }
                <button
                  type="submit"
                  [disabled]="selectedTenses.length === 0 || isLoadingTenses || isSavingTenses || isLoadingCards">
                  @if (isLoadingCards) {
                    <span class="spinner spinner-sm" aria-hidden="true"></span>
                  }
                  Kezdés
                </button>
              }
            </div>
          </form>
        }

        @if (phase === 'practice' && card) {
          <section class="session-bar" aria-label="A gyakorlás állása">
            <div class="session-bar-top">
              <span>{{ index + 1 }}. szó / {{ cards.length }}</span>
              <button type="button" [disabled]="isBusy" (click)="backToSetup()">Vissza a beállításokhoz</button>
            </div>
            <div class="session-progress">
              <div
                role="progressbar"
                aria-label="Haladás a szavakban"
                [attr.aria-valuenow]="progressPercent"
                aria-valuemin="0"
                aria-valuemax="100">
                <div></div>
              </div>
              <span class="session-meta">{{ selectedTenses.length }} igeidő · {{ checkedCount > 0 ? correctCount + ' / ' + checkedCount + ' helyes' : 'még nincs ellenőrzött mondat' }}</span>
            </div>
          </section>
          <section>
            <div>
              <div>
                <span class="grammar-term">{{ card.term }}</span>
                <app-speak-button [text]="card.term" lang="en" label="A szó" />
              </div>
              <p>{{ card.definition }}</p>

              <div class="grammar-task">
                <div>Írj egy <strong>{{ tenseLabel(currentTense) }}</strong> mondatot a(z) <strong>{{ card.term }}</strong> szóval.</div>
                <div>Képzés: {{ tenseHint(currentTense) }}</div>
              </div>

              <label for="grammar-sentence">A mondatod</label>
              <textarea
                #sentenceInput
                id="grammar-sentence"
                name="grammarSentence"
                rows="2"
                maxlength="300"
                autocomplete="off"
                spellcheck="false"
                [(ngModel)]="sentence"
                (ngModelChange)="confirmMissingTerm = false"
                [readonly]="result !== null || isChecking"
                (keydown.enter)="onEnter($event)"></textarea>

              @if (confirmMissingTerm) {
                <div role="status">
                  Nem látom a mondatban ezt: „{{ card.term }}”. Ha más alakban írtad (pl. go → went), küldd el nyugodtan.
                  <button type="button" (click)="check(true)">Mégis elküldöm</button>
                </div>
              }

              @if (result === null) {
                <div>
                  <button type="button" [disabled]="!sentence.trim() || isBusy" (click)="check()">
                    @if (isChecking) {
                      <span class="spinner spinner-sm" aria-hidden="true"></span>
                    }
                    Ellenőrzés
                  </button>
                  <button type="button" [disabled]="isBusy" (click)="loadHint()" title="Magyar mondat, amit lefordíthatsz angolra">
                    @if (isLoadingHint) {
                      <span class="spinner spinner-sm" aria-hidden="true"></span>
                    }
                    {{ hint ? 'Másik tipp' : 'Tipp' }}
                  </button>
                  <button type="button" [disabled]="isBusy" (click)="next()">Kihagyás</button>
                </div>
              }

              @if (hint) {
                <div class="grammar-example">
                  <span>Tipp – fordítsd le angolra</span>
                  <span>{{ hint }}</span>
                  <app-speak-button [text]="hint" lang="hu" label="A magyar mondat" />
                </div>
              }

              @if (result) {
                <div role="status">
                  <div>
                    <strong>{{ manuallyAccepted ? 'Elfogadva kézzel.' : result.isCorrect ? 'Helyes!' : 'Nem egészen.' }}</strong> {{ result.feedback }}
                  </div>
                  <div>
                    <span>{{ result.termUsedCorrectly ? '✓' : '✗' }} Szóhasználat</span>
                    <span>{{ result.tenseCorrect ? '✓' : '✗' }} Igeidő</span>
                    <span>{{ result.grammarCorrect ? '✓' : '✗' }} Nyelvtan</span>
                  </div>
                  @if (result.hungarianTranslation) {
                    <div class="grammar-example">
                      <span>A mondatod jelentése magyarul</span>
                      <span>{{ result.hungarianTranslation }}</span>
                      <app-speak-button [text]="result.hungarianTranslation" lang="hu" label="A magyar jelentés" />
                    </div>
                  }
                  @if (result.correctedSentence) {
                    <div class="grammar-example">
                      <span>Javított mondat</span>
                      <span>{{ result.correctedSentence }}</span>
                      <app-speak-button [text]="result.correctedSentence" lang="en" label="A javított mondat" />
                    </div>
                  }
                  @if (example) {
                    <div class="grammar-example">
                      <span>Példamondat</span>
                      <span>{{ example }}</span>
                      <app-speak-button [text]="example" lang="en" label="A példamondat" />
                    </div>
                  }
                  <div>
                    <button #nextButton type="button" [disabled]="isBusy" (click)="next()">
                      {{ index + 1 < cards.length ? 'Következő' : 'Befejezés' }}
                    </button>
                    @if (example === null) {
                      <button type="button" [disabled]="isBusy" (click)="loadExample()">
                        @if (isLoadingExample) {
                          <span class="spinner spinner-sm" aria-hidden="true"></span>
                        }
                        Mutass egy példát
                      </button>
                    }
                    @if (!result.isCorrect) {
                      <button type="button" [disabled]="isBusy" (click)="acceptManually()">
                        @if (isAccepting) {
                          <span class="spinner spinner-sm" aria-hidden="true"></span>
                        }
                        Márpedig jó volt
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        @if (phase === 'done') {
          <section>
            <div>
              <h2>Kész!</h2>
              <p>{{ checkedCount }} ellenőrzött mondatból {{ correctCount }} lett helyes.</p>
              <div>
                <button type="button" (click)="restart()">Újrakezdés</button>
                <button type="button" (click)="backToSetup()">Vissza a beállításokhoz</button>
              </div>
            </div>
          </section>
        }
      </div>
    </main>
  `,
})
export class GrammarComponent implements OnInit {
  @Output() openDecks = new EventEmitter<void>();
  @ViewChild('sentenceInput') private sentenceInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('nextButton') private nextButton?: ElementRef<HTMLButtonElement>;

  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly speech = inject(SpeechService);
  private readonly apiBaseUrl = '/api';

  readonly groups = TENSE_GROUPS;

  selectedTenses: string[] = [];
  isLoadingTenses = false;
  isSavingTenses = false;
  showTranslation = false;
  isSavingTranslation = false;

  decks: GrammarDeck[] = [];
  tagOptions: GrammarTagOption[] = [];
  deckChoice: GrammarDeckChoice = 'all';
  tag = '';
  onlyReviewed = false;
  isLoadingDecks = false;
  isLoadingCards = false;
  emptySelection = false;

  phase: GrammarPhase = 'setup';
  cards: GrammarCard[] = [];
  index = 0;
  currentTense = '';
  sentence = '';
  confirmMissingTerm = false;
  example: string | null = null;
  hint: string | null = null;
  result: GrammarCheckResponse | null = null;
  isChecking = false;
  isLoadingExample = false;
  isLoadingHint = false;
  isAccepting = false;
  manuallyAccepted = false;
  correctCount = 0;
  checkedCount = 0;
  errorMessage: string | null = null;

  // Kártyaváltáskor nő: a régi kártyára érkező válasz nem íródhat az újra.
  private loadGeneration = 0;

  get card(): GrammarCard | null {
    return this.cards[this.index] ?? null;
  }

  get isBusy(): boolean {
    return this.isChecking || this.isLoadingExample || this.isLoadingHint || this.isAccepting;
  }

  /** A kör haladása: az aktuális szó ellenőrzés után már késznek számít. */
  get progressPercent(): number {
    if (this.cards.length === 0) {
      return 0;
    }

    return Math.round(((this.index + (this.result ? 1 : 0)) / this.cards.length) * 100);
  }

  ngOnInit(): void {
    this.loadPreferences();
    this.loadTenses();
    this.loadTranslationSetting();
    this.loadDecks();
  }

  toggleTranslation(): void {
    if (this.isSavingTranslation) {
      return;
    }

    const previous = this.showTranslation;
    this.showTranslation = !previous;
    this.errorMessage = null;
    this.isSavingTranslation = true;
    this.http.put<GrammarTranslationSetting>(`${this.apiBaseUrl}/grammar/translation`, { enabled: this.showTranslation })
      .pipe(finalize(() => this.isSavingTranslation = false))
      .subscribe({
        next: response => this.showTranslation = response.enabled,
        error: () => {
          this.showTranslation = previous;
          this.errorMessage = 'A beállítás mentése sikertelen. Próbáld újra.';
        },
      });
  }

  tensesOf(group: TenseGroup): TenseOption[] {
    return TENSE_OPTIONS.filter(tense => tense.group === group);
  }

  isSelected(key: string): boolean {
    return this.selectedTenses.includes(key);
  }

  tenseLabel(key: string): string {
    return TENSE_OPTIONS.find(tense => tense.key === key)?.label ?? key;
  }

  tenseHint(key: string): string {
    return TENSE_OPTIONS.find(tense => tense.key === key)?.hint ?? '';
  }

  toggleTense(key: string): void {
    const next = this.isSelected(key)
      ? this.selectedTenses.filter(item => item !== key)
      : [...this.selectedTenses, key];
    this.applyTenses(next);
  }

  selectAll(): void {
    this.applyTenses(TENSE_OPTIONS.map(tense => tense.key));
  }

  selectGroup(group: TenseGroup): void {
    this.applyTenses(this.tensesOf(group).map(tense => tense.key));
  }

  selectNone(): void {
    this.applyTenses([]);
  }

  onDeckChange(): void {
    this.emptySelection = false;
    this.savePreference('deck', String(this.deckChoice));
    this.refreshTagOptions();
  }

  onReviewedChange(): void {
    this.emptySelection = false;
    this.savePreference('reviewed', String(this.onlyReviewed));
  }

  start(): void {
    if (this.selectedTenses.length === 0 || this.isLoadingCards) {
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
    this.emptySelection = false;
    this.isLoadingCards = true;
    this.http.get<GrammarCard[]>(`${this.apiBaseUrl}/free-study/cards`, { params })
      .pipe(finalize(() => this.isLoadingCards = false))
      .subscribe({
        next: cards => {
          if (cards.length === 0) {
            this.emptySelection = true;
            return;
          }

          this.cards = this.shuffle(cards.map(card => ({ id: card.id, term: card.term, definition: card.definition })));
          this.beginRound();
        },
        error: () => this.errorMessage = 'A kártyák betöltése sikertelen. Próbáld újra.',
      });
  }

  restart(): void {
    this.cards = this.shuffle(this.cards);
    this.beginRound();
  }

  backToSetup(): void {
    if (this.isBusy) {
      return;
    }

    this.speech.stop();
    this.loadGeneration++;
    this.phase = 'setup';
    this.cards = [];
    this.resetCardState();
  }

  onEnter(event: Event): void {
    event.preventDefault();
    if (this.result === null) {
      this.check();
    }
  }

  check(force = false): void {
    const card = this.card;
    const sentence = this.sentence.trim();
    if (!card || !sentence || this.isBusy || this.result !== null) {
      return;
    }

    // Puha előszűrő MI-hívás nélkül: rendhagyó alaknál a tanuló mégis elküldheti.
    if (!force && !this.mentionsTerm(sentence, card.term)) {
      this.confirmMissingTerm = true;
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    this.confirmMissingTerm = false;
    this.errorMessage = null;
    this.isChecking = true;
    this.http.post<GrammarCheckResponse>(`${this.apiBaseUrl}/ai/grammar/check`, {
      cardId,
      tense: this.currentTense,
      sentence,
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isChecking = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
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
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'Az ellenőrzés');
        },
      });
  }

  // Csak ellenőrzés után kérhető, mintaként; előtte bemásolható puska lenne.
  loadExample(): void {
    const card = this.card;
    if (!card || this.isBusy || this.example !== null || this.result === null) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    this.errorMessage = null;
    this.isLoadingExample = true;
    this.http.post<GrammarExampleResponse>(`${this.apiBaseUrl}/ai/grammar/example`, {
      cardId,
      tense: this.currentTense,
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingExample = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.example = response.example;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A példamondat kérése');
        },
      });
  }

  // "Márpedig jó volt": az MI szerint hibás mondat kézzel helyesnek jelölve (a szerveren a mentett eredmény is átvált).
  acceptManually(): void {
    const result = this.result;
    const card = this.card;
    if (!result || !card || result.isCorrect || this.isBusy) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    this.errorMessage = null;
    this.isAccepting = true;
    this.http.put<void>(`${this.apiBaseUrl}/grammar/attempts/${result.attemptId}/accept`, {})
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isAccepting = false;
        }
      }))
      .subscribe({
        next: () => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId || this.result !== result) {
            return;
          }

          this.result = { ...result, isCorrect: true, correctedSentence: '' };
          this.manuallyAccepted = true;
          this.correctCount++;
          setTimeout(() => this.nextButton?.nativeElement.focus({ preventScroll: true }));
        },
        error: () => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.errorMessage = 'A kézi elfogadás mentése sikertelen. Próbáld újra.';
        },
      });
  }

  // Magyar mondat a kártya szavával és az aktuális igeidővel; többször is kérhető.
  loadHint(): void {
    const card = this.card;
    if (!card || this.isBusy || this.result !== null) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    this.errorMessage = null;
    this.isLoadingHint = true;
    this.http.post<GrammarHintResponse>(`${this.apiBaseUrl}/ai/grammar/hint`, {
      cardId,
      tense: this.currentTense,
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingHint = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.hint = response.sentence;
          this.focusSentence();
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A tipp kérése');
        },
      });
  }

  next(): void {
    if (this.isBusy) {
      return;
    }

    this.speech.stop();
    this.loadGeneration++;
    this.resetCardState();
    if (this.index + 1 >= this.cards.length) {
      this.phase = 'done';
      return;
    }

    this.index++;
    this.currentTense = this.pickTense();
    this.focusSentence();
  }

  savePreference(name: 'deck' | 'tag' | 'reviewed', value: string): void {
    try {
      localStorage.setItem(this.preferenceKey(`grammar-${name}`), value);
    } catch {
      // Letiltott tárolónál a választás csak erre a munkamenetre szól.
    }
  }

  private beginRound(): void {
    this.loadGeneration++;
    this.resetCardState();
    this.index = 0;
    this.correctCount = 0;
    this.checkedCount = 0;
    this.currentTense = this.pickTense();
    this.phase = 'practice';
    this.focusSentence();
  }

  private resetCardState(): void {
    this.sentence = '';
    this.confirmMissingTerm = false;
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

  // Véletlen igeidő a bejelöltek közül; ha több van, nem ismétli az előzőt közvetlenül.
  private pickTense(): string {
    const options = this.selectedTenses.length > 1
      ? this.selectedTenses.filter(key => key !== this.currentTense)
      : this.selectedTenses;
    return options[Math.floor(Math.random() * options.length)] ?? '';
  }

  private applyTenses(next: string[]): void {
    const ordered = TENSE_OPTIONS.map(tense => tense.key).filter(key => next.includes(key));
    const previous = this.selectedTenses;
    this.selectedTenses = ordered;
    // Üres választást nem küld a szerverre (ott legalább egy igeidő kötelező); a Kezdés addig tiltva.
    if (ordered.length === 0) {
      return;
    }

    this.errorMessage = null;
    this.isSavingTenses = true;
    this.http.put<GrammarTensesResponse>(`${this.apiBaseUrl}/grammar/tenses`, { tenses: ordered })
      .pipe(finalize(() => this.isSavingTenses = false))
      .subscribe({
        next: response => this.selectedTenses = response.tenses,
        error: () => {
          this.selectedTenses = previous;
          this.errorMessage = 'Az igeidők mentése sikertelen. Próbáld újra.';
        },
      });
  }

  private loadTenses(): void {
    this.isLoadingTenses = true;
    this.http.get<GrammarTensesResponse>(`${this.apiBaseUrl}/grammar/tenses`)
      .pipe(finalize(() => this.isLoadingTenses = false))
      .subscribe({
        next: response => this.selectedTenses = response.tenses,
        error: () => this.errorMessage = 'Az igeidők betöltése sikertelen. Frissítsd az oldalt.',
      });
  }

  private loadTranslationSetting(): void {
    this.http.get<GrammarTranslationSetting>(`${this.apiBaseUrl}/grammar/translation`).subscribe({
      next: response => this.showTranslation = response.enabled,
      error: () => this.showTranslation = false,
    });
  }

  private loadDecks(): void {
    this.isLoadingDecks = true;
    this.http.get<GrammarDeck[]>(`${this.apiBaseUrl}/decks`)
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

    this.http.get<GrammarTagOption[]>(`${this.apiBaseUrl}/cards/tags`, { params }).subscribe({
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
  }

  private readPreference(name: 'deck' | 'tag' | 'reviewed'): string | null {
    try {
      return localStorage.getItem(this.preferenceKey(`grammar-${name}`));
    } catch {
      return null;
    }
  }

  private preferenceKey(name: string): string {
    const identity = this.session.email()?.trim().toLowerCase() || 'anonymous';
    return `vocabapp.${identity}.${name}`;
  }

  // Elég, ha a kifejezés leghosszabb szavának eleje (legfeljebb 4 betű) valamelyik szó elején megvan,
  // így a ragozott alak (works, studied, dogs) is átmegy.
  private mentionsTerm(sentence: string, term: string): boolean {
    const termWords = this.words(term).filter(word => word !== 'to');
    if (termWords.length === 0) {
      return true;
    }

    const longest = termWords.reduce((best, word) => word.length > best.length ? word : best);
    const prefix = longest.slice(0, Math.min(4, longest.length));
    return this.words(sentence).some(word => word.startsWith(prefix));
  }

  private words(value: string): string[] {
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

  private focusSentence(): void {
    setTimeout(() => this.sentenceInput?.nativeElement.focus({ preventScroll: true }));
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
