import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

interface StudyCard {
  id: number;
  term: string;
  definition: string;
  example: string | null;
  targetMeanings: string | null;
  nextReviewDate: string;
  easeFactor: number;
  interval: number;
  streak: number;
  incorrectCount: number;
}

interface StudySubmitRequest {
  cardId: number;
  isCorrect: boolean;
  answerToken: string;
  typedAnswer?: string;
}

interface StudyNextResponse {
  card: StudyCard | null;
  answerToken: string | null;
  newCardsIntroducedToday: number;
  dailyNewCardGoal: number;
  minimumAnswerSeconds: number;
  status: 'ready' | 'dailyLimitReached' | 'empty';
}

interface CardProgress {
  cardId: number;
  nextReviewDate: string;
  easeFactor: number;
  interval: number;
  streak: number;
  incorrectCount: number;
  confusedWithTerm: string | null;
}

interface SavedCard {
  id: number;
  term: string;
  definition: string;
  example: string | null;
  targetMeanings: string | null;
}

interface TargetMeaningResponse {
  meanings: string;
}

interface DefinitionResponse {
  definition: string;
}

interface ExampleResponse {
  example: string;
}

interface ValidationResponse {
  isCorrect: boolean;
  feedback: string;
}

type StudyMode = 'meaning' | 'definition' | 'recognition';

const hungarianAccents = 'áéíóöőúüű';
const hungarianPlain = 'aeiooouuu';

@Component({
  selector: 'app-study-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="container py-5">
      <div class="mx-auto" style="max-width: 760px;">
        <header class="mb-4 text-center">
          <h1 class="display-6 fw-semibold">VocabApp</h1>
          <p class="text-body-secondary mb-3">MI-támogatott angol szókártyák</p>
          <div class="d-flex flex-wrap justify-content-center gap-2" role="group" aria-label="Tanulási mód">
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'meaning'"
              [class.btn-outline-primary]="mode !== 'meaning'"
              (click)="setMode('meaning')"
              [disabled]="isInteractionLocked">
              Jelentés beírása
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'definition'"
              [class.btn-outline-primary]="mode !== 'definition'"
              (click)="setMode('definition')"
              [disabled]="isInteractionLocked">
              Jelentés körülírása
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'recognition'"
              [class.btn-outline-primary]="mode !== 'recognition'"
              (click)="setMode('recognition')"
              [disabled]="isInteractionLocked">
              Szó felismerése
            </button>
          </div>
          @if (dailyNewCardGoal !== null) {
            <p class="text-body-secondary mb-0 mt-3">Új szavak ma: {{ newCardsIntroducedToday }}/{{ dailyNewCardGoal }}</p>
          }
        </header>

        @if (isLoadingCard) {
          <div class="text-center py-5" role="status">
            <div class="spinner-border text-primary"></div>
            <p class="mt-3 mb-0">Kártya betöltése…</p>
          </div>
        }

        @if (studyStatus === 'empty' && !isLoadingCard) {
          <div class="alert alert-info">Jelenleg nincs tanulható kártya.</div>
        }

        @if (studyStatus === 'dailyLimitReached' && !isLoadingCard) {
          <div class="alert alert-info">
            A mai új szavak elfogytak, és nincs esedékes ismétlés. Holnap folytathatod, vagy a profilban emelheted a napi célt.
          </div>
        }

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (card && !isLoadingCard) {
          <section class="card border-0 shadow-sm">
            <div class="card-body p-4 p-md-5">
              <div class="d-flex flex-wrap justify-content-between gap-3 mb-4">
                @if (mode !== 'recognition' || isRecognitionRevealed) {
                  <h2 class="h1 mb-0">{{ card.term }}</h2>
                } @else {
                  <h2 class="h3 mb-0">Körülírás</h2>
                }
                <div class="d-flex flex-wrap gap-2 align-items-center">
                  <span class="badge text-bg-success">Sorozat: {{ card.streak }}</span>
                  <span class="badge text-bg-danger">Hibák: {{ card.incorrectCount }}</span>
                  <span class="badge text-bg-secondary">Időköz: {{ card.interval }} nap</span>
                  <span class="badge text-bg-info">Könnyűség: {{ card.easeFactor | number:'1.1-1' }}</span>
                </div>
              </div>

              @if (secondsUntilAnswer > 0) {
                <p class="text-body-secondary">Még {{ secondsUntilAnswer }} mp a válaszadásig.</p>
              }

              @if (mode === 'meaning') {
                @if (hasTargetMeanings) {
                  <p class="text-body-secondary">Ehhez a szóhoz már van célnyelvi jelentés.</p>
                  <label for="meaning-answer" class="form-label fw-semibold">Írd be a magyar jelentést.</label>
                  <textarea
                    id="meaning-answer"
                    class="form-control"
                    rows="4"
                    maxlength="1000"
                    [(ngModel)]="answer"
                    [disabled]="isSubmitting || updatedProgress !== null || isMeaningRevealed"
                    placeholder="pl. kaja"></textarea>

                  @if (!isMeaningRevealed) {
                    <div class="d-grid d-sm-flex gap-2 mt-3">
                      <button
                        type="button"
                        class="btn btn-primary"
                        (click)="checkMeaningAnswer()"
                        [disabled]="!answer.trim() || secondsUntilAnswer > 0 || isSubmitting || updatedProgress !== null">
                        @if (isSubmitting) {
                          <span class="spinner-border spinner-border-sm me-2"></span>
                        }
                        Válasz ellenőrzése
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-secondary"
                        (click)="giveUpMeaning()"
                        [disabled]="secondsUntilAnswer > 0 || isSubmitting || updatedProgress !== null">
                        Nem tudom
                      </button>
                    </div>
                  }

                  @if (isMeaningRevealed) {
                    <div class="mt-4 p-3 bg-body-tertiary rounded">
                      <h3 class="h6">Célnyelvi jelentés</h3>
                      <p class="mb-2">{{ card.targetMeanings }}</p>
                      <p class="mb-2">{{ card.definition }}</p>
                      @if (card.example) {
                        <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                      }
                    </div>
                    @if (meaningCorrect !== null) {
                      <div
                        class="alert mt-3 mb-0"
                        [class.alert-success]="meaningCorrect"
                        [class.alert-danger]="!meaningCorrect">
                        <strong>{{ meaningCorrect ? 'Helyes válasz.' : 'Még nem pontos.' }}</strong>
                      </div>
                    }
                  }
                } @else {
                  <div class="alert alert-warning" role="status">
                    Ehhez a szóhoz még nincs célnyelvi jelentés. Amit ide írsz, azt a Mentés rögzíti elfogadott alakként. A felelés csak a mentés után indul.
                  </div>
                  <label for="target-meanings" class="form-label fw-semibold">Elfogadott alakok</label>
                  <textarea
                    id="target-meanings"
                    class="form-control"
                    rows="3"
                    maxlength="200"
                    [(ngModel)]="targetMeaningsDraft"
                    [disabled]="isGeneratingTargetMeaning || isSavingTargetMeaning"
                    placeholder="étel, kaja"></textarea>
                  <div class="form-text">Most magyar. Elfogadott alakok vesszővel: étel, kaja</div>
                  <div class="d-grid d-sm-flex gap-2 mt-3">
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      (click)="generateTargetMeaning()"
                      [disabled]="isGeneratingTargetMeaning || isSavingTargetMeaning">
                      @if (isGeneratingTargetMeaning) {
                        <span class="spinner-border spinner-border-sm me-2"></span>
                      }
                      Generálás
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary"
                      (click)="saveTargetMeaning()"
                      [disabled]="!targetMeaningsDraft.trim() || isGeneratingTargetMeaning || isSavingTargetMeaning">
                      @if (isSavingTargetMeaning) {
                        <span class="spinner-border spinner-border-sm me-2"></span>
                      }
                      Mentés
                    </button>
                  </div>
                }
              } @else if (mode === 'definition') {
                <label for="answer" class="form-label fw-semibold">Mit jelent a szó?</label>
                <textarea
                  id="answer"
                  class="form-control"
                  rows="4"
                  maxlength="1000"
                  [(ngModel)]="answer"
                  [disabled]="isValidating || isSubmitting || updatedProgress !== null"
                  placeholder="Írd le angolul a jelentését…"></textarea>

                <div class="d-grid d-sm-flex gap-2 mt-3">
                  <button
                    type="button"
                    class="btn btn-primary"
                    (click)="validateAnswer()"
                    [disabled]="!answer.trim() || secondsUntilAnswer > 0 || isValidating || isSubmitting || updatedProgress !== null">
                    @if (isValidating || isSubmitting) {
                      <span class="spinner-border spinner-border-sm me-2"></span>
                    }
                    Válasz ellenőrzése
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    (click)="revealDefinition()"
                    [disabled]="isDefinitionRevealed">
                    Definíció felfedése
                  </button>
                </div>

                <hr class="my-4">

                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    (click)="generateDefinition()"
                    [disabled]="isGeneratingDefinition">
                    @if (isGeneratingDefinition) {
                      <span class="spinner-border spinner-border-sm me-1"></span>
                    }
                    MI-definíció
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    (click)="generateExample()"
                    [disabled]="isGeneratingExample">
                    @if (isGeneratingExample) {
                      <span class="spinner-border spinner-border-sm me-1"></span>
                    }
                    MI-példamondat
                  </button>
                </div>

                @if (isDefinitionRevealed) {
                  <div class="mt-4 p-3 bg-body-tertiary rounded">
                    <h3 class="h6">Referencia-definíció</h3>
                    <p class="mb-2">{{ card.definition }}</p>
                    @if (card.example) {
                      <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                    }
                  </div>
                }
              } @else {
                @if (isLoadingPrompt) {
                  <div class="text-center py-4" role="status">
                    <div class="spinner-border text-primary"></div>
                    <p class="mt-3 mb-0">Körülírás készítése…</p>
                  </div>
                } @else if (promptDefinition) {
                  <p class="lead">{{ promptDefinition }}</p>
                }

                @if (!isLoadingPrompt && !promptDefinition) {
                  <button
                    type="button"
                    class="btn btn-outline-primary"
                    (click)="loadPromptDefinition()"
                    [disabled]="isSubmitting || updatedProgress !== null">
                    Újrapróbálás
                  </button>
                }

                @if (promptDefinition && !isRecognitionRevealed) {
                  <label for="recognition-answer" class="form-label fw-semibold">Melyik angol szó ez?</label>
                  <textarea
                    id="recognition-answer"
                    class="form-control"
                    rows="3"
                    maxlength="100"
                    [(ngModel)]="answer"
                    [disabled]="isLoadingPrompt || isSubmitting || updatedProgress !== null"
                    placeholder="Írd be az angol szót…"></textarea>

                  <div class="d-grid d-sm-flex gap-2 mt-3">
                    <button
                      type="button"
                      class="btn btn-primary"
                      (click)="checkRecognitionAnswer()"
                      [disabled]="!answer.trim() || secondsUntilAnswer > 0 || isLoadingPrompt || isSubmitting || updatedProgress !== null">
                      @if (isSubmitting) {
                        <span class="spinner-border spinner-border-sm me-2"></span>
                      }
                      Válasz ellenőrzése
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      (click)="giveUpRecognition()"
                      [disabled]="secondsUntilAnswer > 0 || isSubmitting || updatedProgress !== null">
                      Nem tudom
                    </button>
                  </div>
                }

                @if (isRecognitionRevealed) {
                  <div class="mt-4 p-3 bg-body-tertiary rounded">
                    <h3 class="h6">A szó</h3>
                    <p class="mb-2 fw-semibold">{{ card.term }}</p>
                    <p class="mb-2">{{ card.definition }}</p>
                    @if (card.example) {
                      <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                    }
                  </div>
                  @if (recognitionCorrect !== null) {
                    <div
                      class="alert mt-3 mb-0"
                      [class.alert-success]="recognitionCorrect"
                      [class.alert-danger]="!recognitionCorrect">
                      <strong>{{ recognitionCorrect ? 'Helyes válasz.' : 'Még nem pontos.' }}</strong>
                      @if (!recognitionCorrect) {
                        @if (updatedProgress?.confusedWithTerm; as confusedWithTerm) {
                          <span> Ezt a szót a(z) „{{ confusedWithTerm }}” szóval keverted.</span>
                        }
                      }
                    </div>
                  }
                  <div class="d-flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      class="btn btn-outline-primary btn-sm"
                      (click)="generateExample()"
                      [disabled]="isGeneratingExample">
                      @if (isGeneratingExample) {
                        <span class="spinner-border spinner-border-sm me-1"></span>
                      }
                      MI-példamondat
                    </button>
                  </div>
                }
              }

              @if (generatedDefinition) {
                <div class="alert alert-info mt-3 mb-0">
                  <strong>MI-definíció:</strong> {{ generatedDefinition }}
                </div>
              }

              @if (generatedExample) {
                <div class="alert alert-info mt-3 mb-0">
                  <strong>MI-példamondat:</strong> {{ generatedExample }}
                </div>
              }

              @if (validationResult) {
                <div
                  class="alert mt-3 mb-0"
                  [class.alert-success]="validationResult.isCorrect"
                  [class.alert-danger]="!validationResult.isCorrect">
                  <strong>{{ validationResult.isCorrect ? 'Helyes válasz.' : 'Még nem pontos.' }}</strong>
                  {{ validationResult.feedback }}
                </div>
              }

              @if (updatedProgress) {
                <div class="border-top mt-4 pt-4">
                  <p class="mb-3">
                    Mentve: {{ updatedProgress.streak }} helyes válasz sorban,
                    következő időköz {{ updatedProgress.interval }} nap,
                    könnyűség {{ updatedProgress.easeFactor | number:'1.1-1' }}.
                  </p>
                  <button
                    type="button"
                    class="btn btn-success"
                    (click)="continueToNext()"
                    [disabled]="isGeneratingDefinition || isGeneratingExample || isGeneratingTargetMeaning || isSavingTargetMeaning || isLoadingPrompt || isValidating || isSubmitting">
                    Következő kártya
                  </button>
                </div>
              }
            </div>
          </section>
        }
      </div>
    </main>
  `,
})
export class StudyCardComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api';

  card: StudyCard | null = null;
  mode: StudyMode = 'meaning';
  answer = '';
  targetMeaningsDraft = '';
  generatedDefinition: string | null = null;
  generatedExample: string | null = null;
  promptDefinition: string | null = null;
  meaningCorrect: boolean | null = null;
  recognitionCorrect: boolean | null = null;
  validationResult: ValidationResponse | null = null;
  updatedProgress: CardProgress | null = null;
  isDefinitionRevealed = false;
  isMeaningRevealed = false;
  isRecognitionRevealed = false;
  isLoadingCard = false;
  isLoadingPrompt = false;
  isGeneratingDefinition = false;
  isGeneratingExample = false;
  isGeneratingTargetMeaning = false;
  isSavingTargetMeaning = false;
  isValidating = false;
  isSubmitting = false;
  errorMessage: string | null = null;
  studyStatus: StudyNextResponse['status'] | null = null;
  newCardsIntroducedToday = 0;
  dailyNewCardGoal: number | null = null;
  secondsUntilAnswer = 0;
  private answerToken: string | null = null;
  private answerUnlockedAt = 0;
  private answerUnlockTimer: ReturnType<typeof setInterval> | null = null;
  private loadGeneration = 0;

  get hasTargetMeanings(): boolean {
    return !!this.card?.targetMeanings?.trim();
  }

  get isInteractionLocked(): boolean {
    return this.isLoadingCard ||
      this.isLoadingPrompt ||
      this.isGeneratingDefinition ||
      this.isGeneratingExample ||
      this.isGeneratingTargetMeaning ||
      this.isSavingTargetMeaning ||
      this.isValidating ||
      this.isSubmitting;
  }

  ngOnInit(): void {
    this.loadNextCard();
  }

  ngOnDestroy(): void {
    this.clearAnswerTimer();
  }

  setMode(mode: StudyMode): void {
    if (mode === this.mode || this.isInteractionLocked) {
      return;
    }

    this.mode = mode;
    this.loadNextCard();
  }

  loadNextCard(): void {
    const generation = ++this.loadGeneration;
    this.isLoadingCard = true;
    this.studyStatus = null;
    this.card = null;
    this.resetCardState();

    this.http.get<StudyNextResponse>(`${this.apiBaseUrl}/study/next`)
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingCard = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.newCardsIntroducedToday = response.newCardsIntroducedToday;
          this.dailyNewCardGoal = response.dailyNewCardGoal;
          this.studyStatus = response.status;
          this.answerToken = response.answerToken;
          if (response.status !== 'ready' || !response.card || !response.answerToken) {
            this.studyStatus = response.status === 'dailyLimitReached' ? 'dailyLimitReached' : 'empty';
            return;
          }

          this.card = response.card;
          this.startAnswerDelay(response.minimumAnswerSeconds);
          if (this.mode === 'recognition') {
            this.loadPromptDefinition();
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.setHttpError(error, 'A kártya betöltése');
        },
      });
  }

  loadPromptDefinition(): void {
    if (!this.card || this.mode !== 'recognition') {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.promptDefinition = null;
    this.isLoadingPrompt = true;
    this.http.post<DefinitionResponse>(
      `${this.apiBaseUrl}/ai/generate/definition`,
      { term: this.card.term },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isLoadingPrompt = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.promptDefinition = response.definition;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'Az MI-definíció generálása');
        },
      });
  }

  checkMeaningAnswer(): void {
    const stored = this.card?.targetMeanings?.trim() ?? '';
    if (!stored || this.isMeaningRevealed || this.secondsUntilAnswer > 0 || this.isSubmitting) {
      return;
    }

    const trimmedAnswer = this.answer.trim();
    if (!trimmedAnswer) {
      this.errorMessage = 'A válasz nem lehet üres.';
      return;
    }

    this.errorMessage = null;
    const isCorrect = this.matchesTargetMeaning(trimmedAnswer, stored);
    this.meaningCorrect = isCorrect;
    this.isMeaningRevealed = true;
    this.submitResult(isCorrect, false);
  }

  giveUpMeaning(): void {
    if (!this.card?.targetMeanings?.trim() || this.isMeaningRevealed || this.isSubmitting || this.secondsUntilAnswer > 0) {
      return;
    }

    this.errorMessage = null;
    this.meaningCorrect = false;
    this.isMeaningRevealed = true;
    this.submitResult(false, false);
  }

  generateTargetMeaning(): void {
    if (!this.card || this.isGeneratingTargetMeaning || this.isSavingTargetMeaning || this.hasTargetMeanings) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.isGeneratingTargetMeaning = true;
    this.http.post<TargetMeaningResponse>(
      `${this.apiBaseUrl}/ai/generate/target-meaning`,
      { term: this.card.term, definition: this.card.definition },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isGeneratingTargetMeaning = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId || this.hasTargetMeanings) {
            return;
          }

          const combined = this.appendMeanings(this.targetMeaningsDraft, response.meanings ?? '');
          if (combined.length > 200) {
            this.errorMessage = 'A célnyelvi jelentés legfeljebb 200 karakter.';
            return;
          }

          this.targetMeaningsDraft = combined;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A célnyelvi jelentés generálása');
        },
      });
  }

  saveTargetMeaning(): void {
    if (!this.card || this.isSavingTargetMeaning || this.isGeneratingTargetMeaning || this.hasTargetMeanings) {
      return;
    }

    const meanings = this.targetMeaningsDraft.trim();
    if (!meanings) {
      return;
    }

    if (meanings.length > 200) {
      this.errorMessage = 'A célnyelvi jelentés legfeljebb 200 karakter.';
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.isSavingTargetMeaning = true;
    this.http.put<SavedCard>(`${this.apiBaseUrl}/cards/${cardId}`, {
      term: this.card.term,
      definition: this.card.definition,
      example: this.card.example,
      targetMeanings: meanings,
    })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isSavingTargetMeaning = false;
        }
      }))
      .subscribe({
        next: saved => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.card.targetMeanings = saved.targetMeanings?.trim() ? saved.targetMeanings : null;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A célnyelvi jelentés mentése');
        },
      });
  }

  checkRecognitionAnswer(): void {
    if (!this.card || !this.promptDefinition || this.isRecognitionRevealed || this.secondsUntilAnswer > 0) {
      return;
    }

    const trimmedAnswer = this.answer.trim();
    if (!trimmedAnswer) {
      this.errorMessage = 'A válasz nem lehet üres.';
      return;
    }

    this.errorMessage = null;
    const isCorrect = this.normalizeText(trimmedAnswer) === this.normalizeText(this.card.term);
    this.recognitionCorrect = isCorrect;
    this.isRecognitionRevealed = true;
    if (isCorrect) {
      this.submitResult(true, false);
    } else {
      this.submitResult(false, false, trimmedAnswer);
    }
  }

  giveUpRecognition(): void {
    if (!this.card || !this.promptDefinition || this.isRecognitionRevealed || this.isSubmitting || this.secondsUntilAnswer > 0) {
      return;
    }

    this.errorMessage = null;
    this.recognitionCorrect = false;
    this.isRecognitionRevealed = true;
    this.submitResult(false, false);
  }

  revealDefinition(): void {
    this.isDefinitionRevealed = true;
  }

  generateDefinition(): void {
    if (!this.card) {
      return;
    }

    this.errorMessage = null;
    this.isGeneratingDefinition = true;
    this.http.post<DefinitionResponse>(
      `${this.apiBaseUrl}/ai/generate/definition`,
      { term: this.card.term },
    )
      .pipe(finalize(() => this.isGeneratingDefinition = false))
      .subscribe({
        next: response => this.generatedDefinition = response.definition,
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'Az MI-definíció generálása'),
      });
  }

  generateExample(): void {
    if (!this.card) {
      return;
    }

    this.errorMessage = null;
    this.isGeneratingExample = true;
    this.http.post<ExampleResponse>(
      `${this.apiBaseUrl}/ai/generate/example`,
      { term: this.card.term, definition: this.card.definition },
    )
      .pipe(finalize(() => this.isGeneratingExample = false))
      .subscribe({
        next: response => this.generatedExample = response.example,
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'Az MI-példamondat generálása'),
      });
  }

  validateAnswer(): void {
    if (!this.card || this.secondsUntilAnswer > 0) {
      return;
    }

    const trimmedAnswer = this.answer.trim();
    if (!trimmedAnswer) {
      this.errorMessage = 'A válasz nem lehet üres.';
      return;
    }

    this.errorMessage = null;
    this.isValidating = true;
    this.http.post<ValidationResponse>(
      `${this.apiBaseUrl}/ai/validate`,
      {
        term: this.card.term,
        definition: this.card.definition,
        answer: trimmedAnswer,
      },
    )
      .pipe(finalize(() => this.isValidating = false))
      .subscribe({
        next: result => {
          this.validationResult = result;
          this.isDefinitionRevealed = true;
          this.submitResult(result.isCorrect, true);
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'A válasz ellenőrzése'),
      });
  }

  continueToNext(): void {
    if (this.updatedProgress &&
        !this.isGeneratingDefinition &&
        !this.isGeneratingExample &&
        !this.isGeneratingTargetMeaning &&
        !this.isSavingTargetMeaning &&
        !this.isLoadingPrompt &&
        !this.isValidating &&
        !this.isSubmitting) {
      this.loadNextCard();
    }
  }

  private normalizeText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private matchesTargetMeaning(answer: string, stored: string): boolean {
    const normalizedAnswer = this.normalizeTargetMeaning(answer);
    if (!normalizedAnswer) {
      return false;
    }

    return this.targetMeaningPieces(stored).includes(normalizedAnswer);
  }

  private targetMeaningPieces(stored: string): string[] {
    return stored
      .split(/[,;\n\r]+/)
      .map(piece => this.normalizeTargetMeaning(piece))
      .filter(piece => piece.length > 0);
  }

  private normalizeTargetMeaning(value: string): string {
    const lower = value.trim().toLocaleLowerCase('hu-HU');
    let withoutAccents = '';
    for (const character of lower) {
      const index = hungarianAccents.indexOf(character);
      withoutAccents += index >= 0 ? hungarianPlain[index] : character;
    }

    return withoutAccents
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  private submitResult(isCorrect: boolean, evaluatedByAi: boolean, typedAnswer?: string): void {
    if (!this.card || !this.answerToken) {
      return;
    }

    const request: StudySubmitRequest = {
      cardId: this.card.id,
      isCorrect,
      answerToken: this.answerToken,
    };
    if (typedAnswer !== undefined) {
      request.typedAnswer = typedAnswer;
    }
    this.isSubmitting = true;
    this.http.post<CardProgress>(`${this.apiBaseUrl}/study/submit`, request)
      .pipe(finalize(() => this.isSubmitting = false))
      .subscribe({
        next: progress => this.updatedProgress = progress,
        error: (error: HttpErrorResponse) => {
          if (error.status === 400) {
            this.errorMessage = 'A válasz még nem menthető. Várd meg a beállított minimum időt, majd próbáld újra.';
            if (this.mode === 'recognition') {
              this.isRecognitionRevealed = false;
              this.recognitionCorrect = null;
            }
            if (this.mode === 'meaning') {
              this.isMeaningRevealed = false;
              this.meaningCorrect = null;
            }
            return;
          }

          this.setHttpError(error, 'Az eredmény mentése');
          const evaluation = evaluatedByAi ? 'Az MI-értékelés' : 'Az értékelés';
          this.errorMessage =
            `${this.errorMessage} ${evaluation} elkészült, de a haladás nem lett elmentve.`;
        },
      });
  }

  private startAnswerDelay(seconds: number): void {
    this.clearAnswerTimer();
    if (seconds <= 0) {
      this.secondsUntilAnswer = 0;
      return;
    }

    this.answerUnlockedAt = Date.now() + seconds * 1000;
    this.secondsUntilAnswer = seconds;
    this.answerUnlockTimer = setInterval(() => {
      const remainingMs = this.answerUnlockedAt - Date.now();
      this.secondsUntilAnswer = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
      if (this.secondsUntilAnswer === 0) {
        this.clearAnswerTimer();
      }
    }, 250);
  }

  private clearAnswerTimer(): void {
    if (this.answerUnlockTimer !== null) {
      clearInterval(this.answerUnlockTimer);
      this.answerUnlockTimer = null;
    }
  }

  private resetCardState(): void {
    this.answer = '';
    this.targetMeaningsDraft = '';
    this.generatedDefinition = null;
    this.generatedExample = null;
    this.promptDefinition = null;
    this.meaningCorrect = null;
    this.recognitionCorrect = null;
    this.validationResult = null;
    this.updatedProgress = null;
    this.isDefinitionRevealed = false;
    this.isMeaningRevealed = false;
    this.isRecognitionRevealed = false;
    this.isLoadingPrompt = false;
    this.isGeneratingTargetMeaning = false;
    this.isSavingTargetMeaning = false;
    this.errorMessage = null;
    this.answerToken = null;
    this.secondsUntilAnswer = 0;
    this.clearAnswerTimer();
  }

  private setHttpError(error: HttpErrorResponse, context: string): void {
    if (error.status === 503) {
      this.errorMessage = `${context} sikertelen: az MI-szolgáltatás nincs konfigurálva.`;
    } else if (error.status === 502) {
      this.errorMessage = `${context} sikertelen: az MI-szolgáltató nem adott megfelelő választ.`;
    } else if (error.status === 404) {
      this.errorMessage = `${context} sikertelen: a kért adat nem található.`;
    } else {
      this.errorMessage = `${context} sikertelen. Kérlek, próbáld újra.`;
    }
  }
}
