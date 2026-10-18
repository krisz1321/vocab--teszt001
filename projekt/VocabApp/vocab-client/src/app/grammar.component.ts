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
  isCorrect: boolean;
  termUsedCorrectly: boolean;
  tenseCorrect: boolean;
  grammarCorrect: boolean;
  feedback: string;
  correctedSentence: string;
}

interface GrammarExampleResponse {
  example: string;
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
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="text-center mb-4">
          <h1 class="h3 mb-1">Nyelvtan</h1>
          <p class="text-body-secondary mb-0">Mondatalkotás a választott igeidőkben. Az eredmény nem számít bele az ismétlésbe.</p>
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (phase === 'setup') {
          <section class="card shadow-sm mb-3">
            <div class="card-body">
              <h2 class="h5 mb-1">Igeidők</h2>
              <p class="text-body-secondary small mb-3">Minden kártyánál a program véletlenszerűen választ egyet a bejelöltek közül. A választás a fiókodban mentődik.</p>
              @if (isLoadingTenses) {
                <div class="text-center py-3" role="status"><div class="spinner-border text-primary"></div></div>
              } @else {
                <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Gyorsválasztás">
                  <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="isSavingTenses" (click)="selectAll()">Mind</button>
                  @for (group of groups; track group.id) {
                    <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="isSavingTenses" (click)="selectGroup(group.id)">{{ group.label }}</button>
                  }
                  <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="isSavingTenses" (click)="selectNone()">Egyik sem</button>
                </div>
                <div class="grammar-groups">
                  @for (group of groups; track group.id) {
                    <fieldset>
                      <legend class="h6 mb-2">{{ group.label }}</legend>
                      @for (tense of tensesOf(group.id); track tense.key) {
                        <div class="form-check">
                          <input
                            class="form-check-input"
                            type="checkbox"
                            [id]="'tense-' + tense.key"
                            [checked]="isSelected(tense.key)"
                            [disabled]="isSavingTenses"
                            (change)="toggleTense(tense.key)">
                          <label class="form-check-label" [for]="'tense-' + tense.key" [title]="tense.hint">{{ tense.label }}</label>
                        </div>
                      }
                    </fieldset>
                  }
                </div>
                @if (selectedTenses.length === 0) {
                  <div class="alert alert-warning mt-3 mb-0" role="status">Válassz ki legalább egy igeidőt a gyakorláshoz.</div>
                }
              }
            </div>
          </section>

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
                <label class="form-label fw-semibold" for="grammar-deck">Pakli</label>
                <select
                  id="grammar-deck"
                  name="grammarDeck"
                  class="form-select mb-3"
                  [(ngModel)]="deckChoice"
                  (ngModelChange)="onDeckChange()">
                  <option [ngValue]="'all'">Összes pakli</option>
                  @for (deck of decks; track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
                @if (tagOptions.length > 0) {
                  <label class="form-label fw-semibold" for="grammar-tag">Címke</label>
                  <select
                    id="grammar-tag"
                    name="grammarTag"
                    class="form-select mb-3"
                    [(ngModel)]="tag"
                    (ngModelChange)="savePreference('tag', tag)">
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
                    id="grammar-reviewed"
                    name="grammarReviewed"
                    [(ngModel)]="onlyReviewed"
                    (ngModelChange)="onReviewedChange()">
                  <label class="form-check-label" for="grammar-reviewed">Csak a már tanult szavak</label>
                  <div class="form-text">Csak azok a kártyák, amelyeket legalább egyszer már ismételtél.</div>
                </div>
                @if (emptySelection) {
                  <div class="alert alert-info" role="status">Ebben a választásban nincs kártya.</div>
                }
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="selectedTenses.length === 0 || isLoadingTenses || isSavingTenses || isLoadingCards">
                  @if (isLoadingCards) {
                    <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                  }
                  Kezdés
                </button>
              }
            </div>
          </form>
        }

        @if (phase === 'practice' && card) {
          <div class="d-flex justify-content-between align-items-center mb-2 small text-body-secondary">
            <span>{{ index + 1 }} / {{ cards.length }}</span>
            <span>{{ correctCount }} / {{ checkedCount }} helyes</span>
          </div>
          <section class="card shadow-sm">
            <div class="card-body">
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="grammar-term">{{ card.term }}</span>
                <app-speak-button [text]="card.term" lang="en" label="A szó" />
              </div>
              <p class="text-body-secondary mb-3">{{ card.definition }}</p>

              <div class="grammar-task mb-3">
                <div>Írj egy mondatot <strong>{{ tenseLabel(currentTense) }}</strong> igeidőben, amelyben szerepel a <strong>{{ card.term }}</strong> szó.</div>
                <div class="small text-body-secondary">Képzés: {{ tenseHint(currentTense) }}</div>
              </div>

              <label class="form-label fw-semibold" for="grammar-sentence">A mondatod</label>
              <textarea
                #sentenceInput
                id="grammar-sentence"
                name="grammarSentence"
                class="form-control mb-2"
                rows="2"
                maxlength="300"
                autocomplete="off"
                spellcheck="false"
                [(ngModel)]="sentence"
                (ngModelChange)="confirmMissingTerm = false"
                [readonly]="result !== null || isChecking"
                (keydown.enter)="onEnter($event)"></textarea>

              @if (confirmMissingTerm) {
                <div class="alert alert-warning py-2" role="status">
                  Nem találom a mondatban a(z) „{{ card.term }}” szót. Ha rendhagyó alakban használtad (pl. go → went), nyugodtan küldd el.
                  <button type="button" class="btn btn-sm btn-outline-secondary ms-2" (click)="check(true)">Mégis elküldöm</button>
                </div>
              }

              @if (result === null) {
                <div class="d-flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" [disabled]="!sentence.trim() || isBusy" (click)="check()">
                    @if (isChecking) {
                      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                    }
                    Ellenőrzés
                  </button>
                  <button type="button" class="btn btn-outline-secondary" [disabled]="isBusy || example !== null" (click)="loadExample()">
                    @if (isLoadingExample) {
                      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                    }
                    Mutass egy példát
                  </button>
                  <button type="button" class="btn btn-link ms-auto" [disabled]="isBusy" (click)="next()">Kihagyás</button>
                </div>
              }

              @if (example) {
                <div class="grammar-example mt-3">
                  <span class="small text-body-secondary d-block">Példamondat</span>
                  <span>{{ example }}</span>
                  <app-speak-button [text]="example" lang="en" label="A példamondat" />
                </div>
              }

              @if (result) {
                <div class="mt-3" role="status">
                  <div class="alert mb-3" [class.alert-success]="result.isCorrect" [class.alert-danger]="!result.isCorrect">
                    <strong>{{ result.isCorrect ? 'Helyes!' : 'Nem egészen.' }}</strong> {{ result.feedback }}
                  </div>
                  <div class="d-flex flex-wrap gap-2 mb-3">
                    <span class="badge" [class.text-bg-success]="result.termUsedCorrectly" [class.text-bg-danger]="!result.termUsedCorrectly">{{ result.termUsedCorrectly ? '✓' : '✗' }} Szóhasználat</span>
                    <span class="badge" [class.text-bg-success]="result.tenseCorrect" [class.text-bg-danger]="!result.tenseCorrect">{{ result.tenseCorrect ? '✓' : '✗' }} Igeidő</span>
                    <span class="badge" [class.text-bg-success]="result.grammarCorrect" [class.text-bg-danger]="!result.grammarCorrect">{{ result.grammarCorrect ? '✓' : '✗' }} Nyelvtan</span>
                  </div>
                  @if (result.correctedSentence) {
                    <div class="grammar-example mb-3">
                      <span class="small text-body-secondary d-block">Javított mondat</span>
                      <span>{{ result.correctedSentence }}</span>
                      <app-speak-button [text]="result.correctedSentence" lang="en" label="A javított mondat" />
                    </div>
                  }
                  <button #nextButton type="button" class="btn btn-primary" (click)="next()">
                    {{ index + 1 < cards.length ? 'Következő' : 'Befejezés' }}
                  </button>
                </div>
              }
            </div>
          </section>
          <div class="text-center mt-3">
            <button type="button" class="btn btn-link btn-sm" [disabled]="isBusy" (click)="backToSetup()">Vissza a beállításokhoz</button>
          </div>
        }

        @if (phase === 'done') {
          <section class="card shadow-sm text-center">
            <div class="card-body py-4">
              <h2 class="h5 mb-2">Kész!</h2>
              <p class="mb-3">{{ checkedCount }} ellenőrzött mondatból {{ correctCount }} lett helyes.</p>
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
    .grammar-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; }
    .grammar-term { font-size: 1.6rem; font-weight: var(--app-heading-weight, 700); }
    .grammar-task { padding: .75rem 1rem; border-radius: var(--app-radius-sm); background: var(--app-surface-2); }
    .grammar-example { padding: .6rem .9rem; border-left: 3px solid var(--app-primary); background: var(--app-surface-2); border-radius: var(--app-radius-sm); }
  `],
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
  result: GrammarCheckResponse | null = null;
  isChecking = false;
  isLoadingExample = false;
  correctCount = 0;
  checkedCount = 0;
  errorMessage: string | null = null;

  // Kártyaváltáskor nő: a régi kártyára érkező válasz nem íródhat az újra.
  private loadGeneration = 0;

  get card(): GrammarCard | null {
    return this.cards[this.index] ?? null;
  }

  get isBusy(): boolean {
    return this.isChecking || this.isLoadingExample;
  }

  ngOnInit(): void {
    this.loadPreferences();
    this.loadTenses();
    this.loadDecks();
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
        error: () => this.errorMessage = 'A kártyák betöltése sikertelen. Kérlek, próbáld újra.',
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

  loadExample(): void {
    const card = this.card;
    if (!card || this.isBusy || this.example !== null) {
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
    this.result = null;
    this.isChecking = false;
    this.isLoadingExample = false;
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
          this.errorMessage = 'Az igeidők mentése sikertelen. Kérlek, próbáld újra.';
        },
      });
  }

  private loadTenses(): void {
    this.isLoadingTenses = true;
    this.http.get<GrammarTensesResponse>(`${this.apiBaseUrl}/grammar/tenses`)
      .pipe(finalize(() => this.isLoadingTenses = false))
      .subscribe({
        next: response => this.selectedTenses = response.tenses,
        error: () => this.errorMessage = 'Az igeidők betöltése sikertelen. Kérlek, frissítsd az oldalt.',
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
        error: () => this.errorMessage = 'A paklik betöltése sikertelen. Kérlek, frissítsd az oldalt.',
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
