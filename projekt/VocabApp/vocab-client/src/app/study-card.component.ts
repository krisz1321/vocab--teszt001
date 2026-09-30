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
  automaticAiCheck: boolean;
  acceptHungarianParaphrase: boolean;
  requireAppealReason: boolean;
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
  fromCard: boolean;
  reused: boolean;
}

interface ExtraDefinitionResponse {
  available: boolean;
  definition: string;
  reason: string | null;
}

interface RecognizeAmbiguityResponse {
  matchesTerm: boolean;
  fitsGuess: boolean;
  hint: string | null;
}

interface ExampleResponse {
  example: string;
  reused: boolean;
}

interface ValidationResponse {
  isCorrect: boolean;
  feedback: string;
  englishAnswer?: string;
}

interface AppealResponse {
  accepted: boolean;
  feedback: string;
}

interface ExplanationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExplainResponse {
  onTopic: boolean;
  text: string;
}

interface StudyDeck {
  id: number;
  name: string;
}

interface FreeStudyCard {
  id: number;
  term: string;
  targetMeanings: string | null;
  definition: string;
  example: string | null;
  knows: boolean | null;
}

type StudyDeckChoice = number | 'all';
type StudyMode = 'meaning' | 'definition' | 'recognition' | 'free';
type FreeFront = 'term' | 'other';
type FreeBack = 'bilingual' | 'definition';

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
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'free'"
              [class.btn-outline-primary]="mode !== 'free'"
              (click)="setMode('free')"
              [disabled]="isInteractionLocked">
              Szabad tanulás
            </button>
          </div>
          @if (dailyNewCardGoal !== null) {
            <p class="text-body-secondary mb-0 mt-3">Új szavak ma: {{ newCardsIntroducedToday }}/{{ dailyNewCardGoal }}</p>
          }
          @if (studying) {
            <div class="d-flex flex-wrap justify-content-center align-items-center gap-2 mt-3">
              <span class="fw-semibold">{{ activeDeckLabel }}</span>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                (click)="chooseAnotherDeck()"
                [disabled]="!canChangeDeck">
                Másik pakli
              </button>
            </div>
          }
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        @if (!studying) {
          <form class="card border-0 shadow-sm" (ngSubmit)="startStudy()">
            <div class="card-body p-4">
              @if (isLoadingDecks) {
                <div class="text-center py-4" role="status">
                  <div class="spinner-border text-primary"></div>
                  <p class="mt-3 mb-0">Paklik betöltése…</p>
                </div>
              } @else {
                <label class="form-label fw-semibold" for="study-deck">Pakli</label>
                <select
                  id="study-deck"
                  name="studyDeck"
                  class="form-select mb-3"
                  [(ngModel)]="deckChoice">
                  <option [ngValue]="null" disabled>Válassz paklit</option>
                  <option [ngValue]="'all'">Összes pakli</option>
                  @for (deck of decks; track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
                <button type="submit" class="btn btn-primary" [disabled]="deckChoice === null">Tanulás</button>
              }
            </div>
          </form>
        }

        @if (studying && isLoadingCard) {
          <div class="text-center py-5" role="status">
            <div class="spinner-border text-primary"></div>
            <p class="mt-3 mb-0">Kártya betöltése…</p>
          </div>
        }

        @if (studying && mode !== 'free' && studyStatus === 'empty' && !isLoadingCard) {
          <div class="alert alert-info">Jelenleg nincs tanulható kártya.</div>
        }

        @if (studying && mode !== 'free' && studyStatus === 'dailyLimitReached' && !isLoadingCard) {
          <div class="alert alert-info">
            A mai új szavak elfogytak, és nincs esedékes ismétlés. Holnap folytathatod, vagy a profilban emelheted a napi célt.
          </div>
        }

        @if (studying && mode === 'free' && freeListLoaded && freeCards.length === 0 && !isLoadingCard) {
          <div class="alert alert-info">Ebben a választásban nincs kártya.</div>
        }

        @if (studying && mode === 'free' && !isLoadingCard) {
          @if (freeCard; as card) {
          <section>
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <span class="fw-semibold">{{ freeIndex + 1 }}/{{ freeCards.length }}</span>
              <span>Tudom {{ freeKnowCount }}</span>
              <span>Nem tudom {{ freeDontKnowCount }}</span>
              <span>Jelöletlen {{ freeUnmarkedCount }}</span>
            </div>
            <div class="row g-3 mb-3">
              <div class="col-sm-6">
                <label class="form-label fw-semibold" for="free-front">Elöl</label>
                <select id="free-front" name="freeFront" class="form-select" [(ngModel)]="freeFront">
                  <option [ngValue]="'term'">Angol szó</option>
                  <option [ngValue]="'other'">A másik oldal</option>
                </select>
              </div>
              <div class="col-sm-6">
                <label class="form-label fw-semibold" for="free-back">Szemközti oldal</label>
                <select id="free-back" name="freeBack" class="form-select" [(ngModel)]="freeBack">
                  <option [ngValue]="'bilingual'">Angol–magyar</option>
                  <option [ngValue]="'definition'">Definícióval</option>
                </select>
              </div>
            </div>
            <div
              class="card border-0 shadow-sm free-study-face"
              (pointerdown)="onFreePointerDown($event)"
              (pointerup)="onFreePointerUp($event)"
              (pointercancel)="onFreePointerCancel($event)">
              <div class="card-body d-flex flex-column justify-content-center align-items-center text-center p-4 p-md-5">
                @if (card.knows === true) {
                  <span class="badge text-bg-success mb-3">Tudom</span>
                } @else if (card.knows === false) {
                  <span class="badge text-bg-danger mb-3">Nem tudom</span>
                }
                @if (freeShowingTerm) {
                  <p class="display-6" [class.mb-0]="freeBack !== 'definition'" [class.mb-3]="freeBack === 'definition'">{{ card.term }}</p>
                  @if (freeBack === 'definition') {
                    <p class="mb-0">{{ card.definition }}</p>
                    @if (card.example) {
                      <p class="mb-0 mt-2 fst-italic text-body-secondary">{{ card.example }}</p>
                    }
                  }
                } @else {
                  <p class="display-6 mb-0">{{ card.targetMeanings?.trim() || 'Nincs megadva magyar jelentés.' }}</p>
                }
              </div>
            </div>
            <div class="d-grid d-sm-flex gap-2 mt-3">
              <button type="button" class="btn btn-outline-primary" (click)="flipFree()" [disabled]="isSavingFreeMark || isClearingFreeMarks">
                Fordítás
              </button>
              <button type="button" class="btn btn-success" (click)="markFree(true)" [disabled]="isSavingFreeMark || isClearingFreeMarks">
                Tudom
              </button>
              <button type="button" class="btn btn-outline-danger" (click)="markFree(false)" [disabled]="isSavingFreeMark || isClearingFreeMarks">
                Nem tudom
              </button>
            </div>
            <button
              type="button"
              class="btn btn-outline-secondary mt-3"
              (click)="askRestartFree()"
              [disabled]="isSavingFreeMark || isClearingFreeMarks">
              Újrakezdés
            </button>
            @if (freeRestartConfirm) {
              <div class="alert alert-warning mt-3 mb-0">
                <p class="mb-3">Biztosan törlöd a jelöléseket?</p>
                <div class="d-grid d-sm-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary" (click)="cancelRestartFree()" [disabled]="isClearingFreeMarks">
                    Mégse
                  </button>
                  <button type="button" class="btn btn-danger" (click)="confirmRestartFree()" [disabled]="isClearingFreeMarks">
                    @if (isClearingFreeMarks) {
                      <span class="spinner-border spinner-border-sm me-2"></span>
                    }
                    Törlés
                  </button>
                </div>
              </div>
            }
          </section>
          }
        }

        @if (studying && mode !== 'free' && card && !isLoadingCard) {
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
                    @if (meaningCorrect !== null && !validationResult && !isValidating) {
                      <div
                        class="alert mt-3 mb-0"
                        [class.alert-success]="meaningCorrect"
                        [class.alert-danger]="!meaningCorrect">
                        <strong>{{ meaningCorrect ? 'Helyes válasz.' : 'Még nem pontos.' }}</strong>
                      </div>
                    }
                    @if (isValidating) {
                      <p class="text-body-secondary mt-3 mb-0" role="status">
                        <span class="spinner-border spinner-border-sm me-2"></span>
                        Az MI ellenőrzi a választ…
                      </p>
                    }
                    @if (meaningAwaitingGrade && !isValidating) {
                      <div class="d-flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          class="btn btn-outline-primary"
                          (click)="evaluateMeaningWithAi()"
                          [disabled]="isSubmitting">
                          MI-ellenőrzés
                        </button>
                        <button
                          type="button"
                          class="btn btn-success"
                          (click)="skipMeaningAiCheck()"
                          [disabled]="isSubmitting">
                          Következő kártya
                        </button>
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
                  [disabled]="isValidating || isSubmitting || updatedProgress !== null || definitionPenaltyPending !== null || validationResult !== null"
                  [placeholder]="acceptHungarianParaphrase ? 'Írd le angolul vagy magyarul a jelentését…' : 'Írd le angolul a jelentését…'"></textarea>

                <div class="d-grid d-sm-flex gap-2 mt-3">
                  <button
                    type="button"
                    class="btn btn-primary"
                    (click)="validateAnswer()"
                    [disabled]="!answer.trim() || secondsUntilAnswer > 0 || isValidating || isSubmitting || updatedProgress !== null || definitionPenaltyPending !== null || validationResult !== null">
                    @if (isValidating || isSubmitting) {
                      <span class="spinner-border spinner-border-sm me-2"></span>
                    }
                    Válasz ellenőrzése
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    (click)="revealDefinition()"
                    [disabled]="secondsUntilAnswer > 0 || isDefinitionRevealed || isSubmitting || isValidating || updatedProgress !== null || definitionPenaltyPending !== null">
                    Definíció felfedése
                  </button>
                </div>

                <hr class="my-4">

                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    (click)="generateDefinition()"
                    [disabled]="isGeneratingDefinition || definitionPenaltyPending !== null || isSubmitting || isValidating || (updatedProgress === null && secondsUntilAnswer > 0)">
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
                @if (definitionPenaltyApplied) {
                  <div class="alert alert-danger mt-3 mb-0">
                    <strong>Még nem pontos.</strong>
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
                  @if (recognitionSecondChance && !isRecognitionRevealed) {
                    @if (recognitionHint) {
                      <p class="small text-body-secondary">{{ recognitionHint }}</p>
                    }
                    <p class="small text-body-secondary">Ez a definíció a beírt szóra is illik. Írd be újra a szót.</p>
                  } @else {
                    @if (extraDefinition) {
                      <p class="small text-body-secondary">{{ extraDefinition }}</p>
                    }
                    @if (extraDefinitionMessage) {
                      <p class="small text-body-secondary">{{ extraDefinitionMessage }}</p>
                    }
                  }
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
                    [disabled]="isLoadingPrompt || isCheckingRecognition || isSubmitting || updatedProgress !== null"
                    placeholder="Írd be az angol szót…"></textarea>

                  <div class="d-grid d-sm-flex gap-2 mt-3">
                    <button
                      type="button"
                      class="btn btn-primary"
                      (click)="checkRecognitionAnswer()"
                      [disabled]="!answer.trim() || secondsUntilAnswer > 0 || isLoadingPrompt || isCheckingRecognition || isSubmitting || updatedProgress !== null">
                      @if (isCheckingRecognition || isSubmitting) {
                        <span class="spinner-border spinner-border-sm me-2"></span>
                      }
                      Válasz ellenőrzése
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      (click)="giveUpRecognition()"
                      [disabled]="secondsUntilAnswer > 0 || isCheckingRecognition || isSubmitting || updatedProgress !== null">
                      Nem tudom
                    </button>
                  </div>
                  @if (!recognitionSecondChance) {
                    <div class="mt-3">
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        (click)="loadExtraDefinition()"
                        [disabled]="isLoadingExtraDefinition || isCheckingRecognition"
                        aria-label="Másik definíció">
                        @if (isLoadingExtraDefinition) {
                          <span class="spinner-border spinner-border-sm"></span>
                        } @else {
                          +
                        }
                      </button>
                    </div>
                  }
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
                  <strong>{{ generatedDefinitionLabel() }}:</strong> {{ generatedDefinition }}
                </div>
              }

              @if (generatedExample) {
                <div class="alert alert-info mt-3 mb-0">
                  <strong>{{ generatedExampleReused ? 'Mentett példamondat' : 'MI-példamondat' }}:</strong> {{ generatedExample }}
                </div>
              }

              @if (validationResult) {
                <div
                  class="alert mt-3 mb-0"
                  [class.alert-success]="validationResult.isCorrect"
                  [class.alert-danger]="!validationResult.isCorrect">
                  <strong>{{ validationResult.isCorrect ? 'Helyes válasz.' : 'Még nem pontos.' }}</strong>
                  @if (validationResult.feedback) {
                    {{ ' ' + validationResult.feedback }}
                  }
                  @if (mode === 'definition' && validationResult.isCorrect && validationResult.englishAnswer) {
                    <div class="mt-2">Angolul: {{ validationResult.englishAnswer }}</div>
                  }
                  @if (appealFeedback && !validationResult.isCorrect) {
                    <div class="mt-2">{{ appealFeedback }}</div>
                  }
                </div>
              }

              @if (showChallengeActions) {
                <div class="d-flex flex-wrap gap-2 mt-3">
                  @if (canAppeal) {
                    @if (!requireAppealReason) {
                      <button
                        type="button"
                        class="btn btn-outline-success"
                        (click)="acceptAppealWithoutReason()"
                        [disabled]="isSubmitting || isAppealing">
                        Márpedig ez jó válasz volt
                      </button>
                    } @else if (!appealOpen) {
                      <button
                        type="button"
                        class="btn btn-outline-success"
                        (click)="appealOpen = true"
                        [disabled]="isSubmitting || isAppealing">
                        Mégis helyes volt
                      </button>
                    }
                  }
                  @if (!explanationStarted) {
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      (click)="explainWhyWrong()"
                      [disabled]="isExplaining || isSubmitting">
                      @if (isExplaining) {
                        <span class="spinner-border spinner-border-sm me-2"></span>
                      }
                      Miért volt rossz?
                    </button>
                  }
                </div>
                @if (canAppeal && requireAppealReason && appealOpen) {
                  <label for="appeal-reason" class="form-label fw-semibold mt-3">Indoklás</label>
                  <textarea
                    id="appeal-reason"
                    class="form-control"
                    rows="3"
                    maxlength="1000"
                    [(ngModel)]="appealReason"
                    [disabled]="isAppealing || isSubmitting"
                    placeholder="Magyarul vagy angolul…"></textarea>
                  <button
                    type="button"
                    class="btn btn-primary mt-2"
                    (click)="submitAppeal()"
                    [disabled]="!appealReason.trim() || isAppealing || isSubmitting">
                    @if (isAppealing) {
                      <span class="spinner-border spinner-border-sm me-2"></span>
                    }
                    Indoklás elküldése
                  </button>
                }
              }

              @if (explanationMessages.length > 0) {
                <div class="mt-3">
                  @for (message of explanationMessages; track $index) {
                    <p class="mb-2" [class.text-body-secondary]="message.role === 'user'">
                      @if (message.role === 'user') {
                        <span class="fw-semibold">Kérdés. </span>
                      }
                      {{ message.content }}
                    </p>
                  }
                </div>
              }

              @if (explanationStarted && !explanationClosed) {
                <label for="follow-up" class="form-label fw-semibold mt-3">Kérdés</label>
                <textarea
                  id="follow-up"
                  class="form-control"
                  rows="3"
                  maxlength="2000"
                  [(ngModel)]="followUpQuestion"
                  [disabled]="isExplaining || isSubmitting"
                  placeholder="A szóról, a jelentéséről vagy a hibáról…"></textarea>
                <button
                  type="button"
                  class="btn btn-outline-primary mt-2"
                  (click)="askFollowUp()"
                  [disabled]="!followUpQuestion.trim() || isExplaining || isSubmitting">
                  @if (isExplaining) {
                    <span class="spinner-border spinner-border-sm me-2"></span>
                  }
                  Kérdés küldése
                </button>
              }

              @if (pendingIncorrect && !updatedProgress) {
                <div class="border-top mt-4 pt-4">
                  <button
                    type="button"
                    class="btn btn-success"
                    (click)="savePendingAndContinue()"
                    [disabled]="isSubmitting || isAppealing">
                    @if (isSubmitting) {
                      <span class="spinner-border spinner-border-sm me-2"></span>
                    }
                    Következő kártya
                  </button>
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
  styles: [`
    .free-study-face {
      min-height: 16rem;
      touch-action: pan-y;
      user-select: none;
      display: flex;
    }
    .free-study-face > .card-body {
      flex: 1 1 auto;
    }
  `],
})
export class StudyCardComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api';

  card: StudyCard | null = null;
  mode: StudyMode = 'meaning';
  automaticAiCheck = false;
  acceptHungarianParaphrase = false;
  requireAppealReason = true;
  meaningAwaitingGrade = false;
  answer = '';
  targetMeaningsDraft = '';
  generatedDefinition: string | null = null;
  generatedDefinitionFromCard = false;
  generatedDefinitionReused = false;
  generatedExample: string | null = null;
  generatedExampleReused = false;
  promptDefinition: string | null = null;
  extraDefinition: string | null = null;
  extraDefinitionMessage: string | null = null;
  recognitionSecondChance = false;
  recognitionHint: string | null = null;
  isLoadingExtraDefinition = false;
  isCheckingRecognition = false;
  meaningCorrect: boolean | null = null;
  recognitionCorrect: boolean | null = null;
  validationResult: ValidationResponse | null = null;
  updatedProgress: CardProgress | null = null;
  isDefinitionRevealed = false;
  definitionPenaltyApplied = false;
  definitionPenaltyPending: 'reveal' | 'ai' | null = null;
  isMeaningRevealed = false;
  isRecognitionRevealed = false;
  isLoadingCard = false;
  isLoadingDecks = false;
  studying = false;
  decks: StudyDeck[] = [];
  deckChoice: StudyDeckChoice | null = null;
  isLoadingPrompt = false;
  isGeneratingDefinition = false;
  isGeneratingExample = false;
  isGeneratingTargetMeaning = false;
  isSavingTargetMeaning = false;
  isValidating = false;
  isSubmitting = false;
  isAppealing = false;
  isExplaining = false;
  pendingIncorrect = false;
  aiIncorrect = false;
  recognitionIncorrect = false;
  overrideCorrect = false;
  appealUsed = false;
  appealOpen = false;
  appealReason = '';
  appealFeedback: string | null = null;
  explanationStarted = false;
  explanationClosed = false;
  followUpQuestion = '';
  explanationMessages: ExplanationMessage[] = [];
  errorMessage: string | null = null;
  studyStatus: StudyNextResponse['status'] | null = null;
  newCardsIntroducedToday = 0;
  dailyNewCardGoal: number | null = null;
  secondsUntilAnswer = 0;
  freeFront: FreeFront = 'term';
  freeBack: FreeBack = 'bilingual';
  freeCards: FreeStudyCard[] = [];
  freeIndex = 0;
  freeFlipped = false;
  freeListLoaded = false;
  freeRestartConfirm = false;
  isSavingFreeMark = false;
  isClearingFreeMarks = false;
  private answerToken: string | null = null;
  private heldAnswer = '';
  private heldDefinition = '';
  private pendingTypedAnswer: string | null = null;
  private continueAfterSave = false;
  private answerUnlockedAt = 0;
  private answerUnlockTimer: ReturnType<typeof setInterval> | null = null;
  private loadGeneration = 0;
  private continueAfterMeaningSubmit = false;
  private freeKeyListener: ((event: KeyboardEvent) => void) | null = null;
  private freePointerId: number | null = null;
  private freePointerType = '';
  private freePointerStartX = 0;
  private freePointerStartY = 0;
  private freeLastTapAt = 0;
  private freeIgnoreMouseUntil = 0;

  get hasTargetMeanings(): boolean {
    return !!this.card?.targetMeanings?.trim();
  }

  get showChallengeActions(): boolean {
    if (!this.answer.trim() || this.overrideCorrect || this.validationResult?.isCorrect) {
      return false;
    }

    return this.aiIncorrect || this.recognitionIncorrect;
  }

  get canAppeal(): boolean {
    return this.showChallengeActions && this.aiIncorrect && !this.appealUsed && this.updatedProgress === null;
  }

  get activeDeckLabel(): string {
    if (this.deckChoice === 'all' || this.deckChoice === null) {
      return 'Összes pakli';
    }

    return this.decks.find(deck => deck.id === this.deckChoice)?.name ?? 'Pakli';
  }

  get canChangeDeck(): boolean {
    if (this.mode === 'free') {
      return !this.isSavingFreeMark && !this.isClearingFreeMarks;
    }

    return this.card === null || this.updatedProgress !== null;
  }

  get isInteractionLocked(): boolean {
    return this.isLoadingCard ||
      this.isLoadingPrompt ||
      this.isCheckingRecognition ||
      this.isGeneratingDefinition ||
      this.isGeneratingExample ||
      this.isGeneratingTargetMeaning ||
      this.isSavingTargetMeaning ||
      this.isValidating ||
      this.isSubmitting ||
      this.isAppealing ||
      this.pendingIncorrect ||
      this.isSavingFreeMark ||
      this.isClearingFreeMarks;
  }

  get freeCard(): FreeStudyCard | null {
    return this.freeCards[this.freeIndex] ?? null;
  }

  get freeShowingTerm(): boolean {
    const frontIsTerm = this.freeFront === 'term';
    return this.freeFlipped ? !frontIsTerm : frontIsTerm;
  }

  get freeKnowCount(): number {
    return this.freeCards.filter(card => card.knows === true).length;
  }

  get freeDontKnowCount(): number {
    return this.freeCards.filter(card => card.knows === false).length;
  }

  get freeUnmarkedCount(): number {
    return this.freeCards.filter(card => card.knows == null).length;
  }

  ngOnInit(): void {
    this.loadDecks();
  }

  ngOnDestroy(): void {
    this.clearAnswerTimer();
    this.removeFreeKeyListener();
    if (this.pendingIncorrect && !this.updatedProgress && !this.isSubmitting) {
      this.submitResult(this.overrideCorrect, this.aiIncorrect, this.pendingTypedAnswer ?? undefined);
    }
  }

  setMode(mode: StudyMode): void {
    if (mode === this.mode || this.isInteractionLocked) {
      return;
    }

    this.mode = mode;
    this.syncFreeKeyListener();
    if (!this.studying) {
      return;
    }

    if (mode === 'free') {
      this.loadFreeCards();
      return;
    }

    this.loadNextCard();
  }

  startStudy(): void {
    if (this.deckChoice === null || this.studying) {
      return;
    }

    this.studying = true;
    this.errorMessage = null;
    this.syncFreeKeyListener();
    if (this.mode === 'free') {
      this.loadFreeCards();
      return;
    }

    this.loadNextCard();
  }

  chooseAnotherDeck(): void {
    if (!this.canChangeDeck) {
      return;
    }

    this.loadGeneration++;
    this.studying = false;
    this.isLoadingCard = false;
    this.card = null;
    this.studyStatus = null;
    this.isGeneratingDefinition = false;
    this.isGeneratingExample = false;
    this.isValidating = false;
    this.isAppealing = false;
    this.isExplaining = false;
    this.clearFreeStudy();
    this.resetCardState();
  }

  loadDecks(): void {
    this.isLoadingDecks = true;
    this.http.get<StudyDeck[]>(`${this.apiBaseUrl}/decks`)
      .pipe(finalize(() => this.isLoadingDecks = false))
      .subscribe({
        next: decks => {
          this.decks = decks;
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'A paklik betöltése'),
      });
  }

  loadNextCard(): void {
    if (!this.studying) {
      return;
    }

    const generation = ++this.loadGeneration;
    this.isLoadingCard = true;
    this.studyStatus = null;
    this.card = null;
    this.resetCardState();

    const params: Record<string, number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    this.http.get<StudyNextResponse>(`${this.apiBaseUrl}/study/next`, { params })
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
          this.automaticAiCheck = response.automaticAiCheck;
          this.acceptHungarianParaphrase = response.acceptHungarianParaphrase;
          this.requireAppealReason = response.requireAppealReason;
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
    this.extraDefinition = null;
    this.extraDefinitionMessage = null;
    this.isLoadingPrompt = true;
    this.http.post<DefinitionResponse>(
      `${this.apiBaseUrl}/ai/generate/definition`,
      { term: this.card.term, cardId: this.card.id },
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
          this.extraDefinition = null;
          this.extraDefinitionMessage = null;
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
    if (isCorrect) {
      this.meaningAwaitingGrade = false;
      this.submitResult(true, false);
      return;
    }

    if (this.automaticAiCheck) {
      this.evaluateMeaningWithAi();
      return;
    }

    this.meaningAwaitingGrade = true;
  }

  evaluateMeaningWithAi(): void {
    const trimmedAnswer = this.answer.trim();
    if (!this.card || !trimmedAnswer || this.isValidating || this.isSubmitting || this.updatedProgress || this.validationResult || this.pendingIncorrect) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.meaningAwaitingGrade = false;
    this.isValidating = true;
    this.http.post<ValidationResponse>(
      `${this.apiBaseUrl}/ai/validate`,
      {
        term: this.card.term,
        definition: this.card.targetMeanings ?? '',
        answer: trimmedAnswer,
      },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isValidating = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.validationResult = result;
          this.meaningCorrect = result.isCorrect;
          this.meaningAwaitingGrade = false;
          if (result.isCorrect) {
            this.submitResult(true, true);
            return;
          }

          this.holdIncorrectAnswer(this.card?.targetMeanings ?? '', null, true);
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.meaningAwaitingGrade = true;
          this.setHttpError(error, 'A válasz ellenőrzése');
        },
      });
  }

  skipMeaningAiCheck(): void {
    if (!this.meaningAwaitingGrade || this.isSubmitting || this.isValidating) {
      return;
    }

    this.meaningAwaitingGrade = false;
    this.continueAfterMeaningSubmit = true;
    this.submitResult(false, false);
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

  loadExtraDefinition(): void {
    if (!this.card || !this.promptDefinition || this.isRecognitionRevealed || this.recognitionSecondChance || this.isLoadingExtraDefinition || this.isCheckingRecognition) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    const avoidDefinition = this.promptDefinition;
    this.extraDefinitionMessage = null;
    this.isLoadingExtraDefinition = true;
    this.http.post<ExtraDefinitionResponse>(
      `${this.apiBaseUrl}/ai/generate/extra-definition`,
      { term: this.card.term, cardId: this.card.id, avoidDefinition },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isLoadingExtraDefinition = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId || this.isRecognitionRevealed) {
            return;
          }

          if (!response.available || !response.definition) {
            this.extraDefinitionMessage = response.reason === 'alternateDisabled'
              ? 'A váltakozó definíció ki van kapcsolva, ezért nincs második, eltérő definíció.'
              : 'Nem sikerült a látható definíciótól legalább 30 százalékban eltérő szöveget kapni.';
            if (response.reason === 'alternateDisabled') {
              this.extraDefinition = null;
            }
            return;
          }

          this.extraDefinition = response.definition;
          this.extraDefinitionMessage = null;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A második definíció kérése');
        },
      });
  }

  checkRecognitionAnswer(): void {
    if (!this.card || !this.promptDefinition || this.isRecognitionRevealed || this.secondsUntilAnswer > 0 || this.isCheckingRecognition || this.isSubmitting) {
      return;
    }

    const trimmedAnswer = this.answer.trim();
    if (!trimmedAnswer) {
      this.errorMessage = 'A válasz nem lehet üres.';
      return;
    }

    this.errorMessage = null;
    if (this.recognitionSecondChance || this.normalizeText(trimmedAnswer) === this.normalizeText(this.card.term)) {
      this.finishRecognitionAnswer(trimmedAnswer);
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    const visibleDefinition = this.promptDefinition;
    this.isCheckingRecognition = true;
    this.http.post<RecognizeAmbiguityResponse>(
      `${this.apiBaseUrl}/ai/recognize-ambiguity`,
      { cardId, definition: visibleDefinition, guess: trimmedAnswer },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isCheckingRecognition = false;
        }
      }))
      .subscribe({
        next: response => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId || this.isRecognitionRevealed) {
            return;
          }

          if (response.matchesTerm) {
            this.recognitionCorrect = true;
            this.isRecognitionRevealed = true;
            this.submitResult(true, false);
            return;
          }

          if (!response.fitsGuess) {
            this.finishRecognitionAnswer(trimmedAnswer);
            return;
          }

          const hint = response.hint?.trim();
          this.recognitionHint = hint ? hint : null;
          this.recognitionSecondChance = true;
          this.answer = '';
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A válasz ellenőrzése');
        },
      });
  }

  giveUpRecognition(): void {
    if (!this.card || !this.promptDefinition || this.isRecognitionRevealed || this.isCheckingRecognition || this.isSubmitting || this.secondsUntilAnswer > 0) {
      return;
    }

    this.errorMessage = null;
    this.recognitionCorrect = false;
    this.isRecognitionRevealed = true;
    this.submitResult(false, false);
  }

  revealDefinition(): void {
    if (!this.card || !this.answerToken || this.updatedProgress || this.definitionPenaltyPending ||
        this.isSubmitting || this.isValidating || this.secondsUntilAnswer > 0 || this.isDefinitionRevealed) {
      return;
    }

    this.definitionPenaltyPending = 'reveal';
    this.submitResult(false, false);
  }

  generatedDefinitionLabel(): string {
    if (this.generatedDefinitionFromCard) {
      return 'Definíció';
    }

    return this.generatedDefinitionReused ? 'Mentett definíció' : 'MI-definíció';
  }

  generateDefinition(): void {
    if (!this.card || this.isGeneratingDefinition || this.definitionPenaltyPending || this.isSubmitting || this.isValidating) {
      return;
    }

    if (!this.updatedProgress && !this.pendingIncorrect) {
      if (!this.answerToken || this.secondsUntilAnswer > 0) {
        return;
      }

      this.definitionPenaltyPending = 'ai';
      this.submitResult(false, false);
      return;
    }

    this.requestGeneratedDefinition();
  }

  private requestGeneratedDefinition(): void {
    if (!this.card) {
      return;
    }

    this.errorMessage = null;
    this.isGeneratingDefinition = true;
    this.http.post<DefinitionResponse>(
      `${this.apiBaseUrl}/ai/generate/definition`,
      { term: this.card.term, cardId: this.card.id },
    )
      .pipe(finalize(() => this.isGeneratingDefinition = false))
      .subscribe({
        next: response => {
          this.generatedDefinition = response.definition;
          this.generatedDefinitionFromCard = response.fromCard;
          this.generatedDefinitionReused = response.reused;
        },
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
      { term: this.card.term, definition: this.card.definition, cardId: this.card.id },
    )
      .pipe(finalize(() => this.isGeneratingExample = false))
      .subscribe({
        next: response => {
          this.generatedExample = response.example;
          this.generatedExampleReused = response.reused;
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'Az MI-példamondat generálása'),
      });
  }

  validateAnswer(): void {
    if (!this.card || this.secondsUntilAnswer > 0 || this.isValidating || this.isSubmitting || this.validationResult || this.pendingIncorrect) {
      return;
    }

    const trimmedAnswer = this.answer.trim();
    if (!trimmedAnswer) {
      this.errorMessage = 'A válasz nem lehet üres.';
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    const definition = this.card.definition;
    this.errorMessage = null;
    this.isValidating = true;
    this.http.post<ValidationResponse>(
      `${this.apiBaseUrl}/ai/validate`,
      {
        term: this.card.term,
        definition,
        answer: trimmedAnswer,
        paraphrase: true,
      },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isValidating = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.validationResult = result;
          this.isDefinitionRevealed = true;
          if (result.isCorrect) {
            this.submitResult(true, true);
            return;
          }

          this.holdIncorrectAnswer(definition, null, true);
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A válasz ellenőrzése');
        },
      });
  }

  acceptAppealWithoutReason(): void {
    if (!this.canAppeal || this.requireAppealReason || this.isSubmitting || this.isAppealing) {
      return;
    }

    this.markAppealAccepted('');
    this.submitResult(true, true);
  }

  submitAppeal(): void {
    if (!this.card || !this.canAppeal || !this.requireAppealReason || this.isAppealing || this.isSubmitting) {
      return;
    }

    const reason = this.appealReason.trim();
    if (!reason) {
      this.errorMessage = 'Az indoklás nem lehet üres.';
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.isAppealing = true;
    this.http.post<AppealResponse>(
      `${this.apiBaseUrl}/ai/appeal-answer`,
      {
        term: this.card.term,
        definition: this.heldDefinition,
        answer: this.heldAnswer,
        reason,
      },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isAppealing = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId || this.appealUsed) {
            return;
          }

          this.appealUsed = true;
          this.appealOpen = false;
          if (result.accepted) {
            this.markAppealAccepted(result.feedback);
            this.submitResult(true, true);
            return;
          }

          this.appealFeedback = result.feedback;
          this.submitResult(false, true, this.pendingTypedAnswer ?? undefined);
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          if (error.status === 400) {
            this.errorMessage = 'Az indoklás nem lehet üres.';
            return;
          }

          this.setHttpError(error, 'A válasz megvédése');
        },
      });
  }

  explainWhyWrong(): void {
    if (!this.showChallengeActions || this.explanationStarted || this.isExplaining) {
      return;
    }

    this.requestExplanation(this.explanationMessages);
  }

  askFollowUp(): void {
    if (!this.explanationStarted || this.explanationClosed || this.isExplaining || this.isSubmitting) {
      return;
    }

    const question = this.followUpQuestion.trim();
    if (!question) {
      return;
    }

    this.requestExplanation(
      [...this.explanationMessages, { role: 'user', content: question }],
      question,
    );
  }

  savePendingAndContinue(): void {
    if (!this.pendingIncorrect || this.updatedProgress || this.isSubmitting || this.isAppealing) {
      return;
    }

    this.continueAfterSave = true;
    this.submitResult(this.overrideCorrect, this.aiIncorrect, this.pendingTypedAnswer ?? undefined);
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

  private finishRecognitionAnswer(trimmedAnswer: string): void {
    if (!this.card) {
      return;
    }

    const isCorrect = this.normalizeText(trimmedAnswer) === this.normalizeText(this.card.term);
    this.recognitionCorrect = isCorrect;
    this.isRecognitionRevealed = true;
    if (isCorrect) {
      this.submitResult(true, false);
      return;
    }

    this.holdIncorrectAnswer(this.card.definition, trimmedAnswer, false);
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

  private holdIncorrectAnswer(referenceDefinition: string, typedForConfusion: string | null, fromAi: boolean): void {
    this.pendingIncorrect = true;
    this.heldAnswer = this.answer.trim();
    this.heldDefinition = referenceDefinition;
    this.pendingTypedAnswer = typedForConfusion;
    this.aiIncorrect = fromAi;
    this.recognitionIncorrect = !fromAi;
  }

  private markAppealAccepted(feedback: string): void {
    this.overrideCorrect = true;
    this.appealUsed = true;
    this.appealOpen = false;
    this.appealFeedback = null;
    this.meaningCorrect = this.mode === 'meaning' ? true : this.meaningCorrect;
    if (this.validationResult) {
      this.validationResult = {
        isCorrect: true,
        feedback,
        englishAnswer: '',
      };
    }
  }

  private requestExplanation(messages: ExplanationMessage[], pendingQuestion?: string): void {
    if (!this.card || this.explanationClosed || this.isExplaining) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = this.card.id;
    this.errorMessage = null;
    this.isExplaining = true;
    this.http.post<ExplainResponse>(
      `${this.apiBaseUrl}/ai/explain-answer`,
      {
        term: this.card.term,
        definition: this.heldDefinition,
        answer: this.heldAnswer,
        messages,
      },
    )
      .pipe(finalize(() => {
        if (generation === this.loadGeneration && this.card?.id === cardId) {
          this.isExplaining = false;
        }
      }))
      .subscribe({
        next: result => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          if (pendingQuestion) {
            this.explanationMessages = [
              ...this.explanationMessages,
              { role: 'user', content: pendingQuestion },
            ];
            this.followUpQuestion = '';
          }

          const text = result.onTopic ? result.text : 'Ez nem kapcsolódik a tárgyhoz.';
          this.explanationMessages = [
            ...this.explanationMessages,
            { role: 'assistant', content: text },
          ];
          this.explanationStarted = true;
          if (!result.onTopic) {
            this.explanationClosed = true;
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.setHttpError(error, 'A magyarázat kérése');
        },
      });
  }

  private submitResult(isCorrect: boolean, evaluatedByAi: boolean, typedAnswer?: string): void {
    if (!this.card || !this.answerToken || this.updatedProgress || this.isSubmitting) {
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
        next: progress => {
          const penalty = this.definitionPenaltyPending;
          const continueAfter = this.continueAfterSave;
          this.definitionPenaltyPending = null;
          this.continueAfterSave = false;
          this.pendingIncorrect = false;
          this.updatedProgress = progress;
          if (penalty === 'reveal') {
            this.isDefinitionRevealed = true;
            this.definitionPenaltyApplied = true;
          } else if (penalty === 'ai') {
            this.definitionPenaltyApplied = true;
            this.requestGeneratedDefinition();
          }
          if (this.continueAfterMeaningSubmit || continueAfter) {
            this.continueAfterMeaningSubmit = false;
            this.loadNextCard();
          }
        },
        error: (error: HttpErrorResponse) => {
          this.definitionPenaltyPending = null;
          this.continueAfterSave = false;
          if (error.status === 400) {
            this.errorMessage = 'A válasz még nem menthető. Várd meg a beállított minimum időt, majd próbáld újra.';
            this.continueAfterMeaningSubmit = false;
            if (this.pendingIncorrect) {
              return;
            }
            if (this.mode === 'recognition') {
              this.isRecognitionRevealed = false;
              this.recognitionCorrect = null;
            }
            if (this.mode === 'meaning') {
              this.isMeaningRevealed = false;
              this.meaningCorrect = null;
              this.meaningAwaitingGrade = false;
              this.validationResult = null;
            }
            return;
          }

          if (this.continueAfterMeaningSubmit) {
            this.continueAfterMeaningSubmit = false;
            this.meaningAwaitingGrade = true;
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
    this.generatedDefinitionFromCard = false;
    this.generatedDefinitionReused = false;
    this.generatedExample = null;
    this.generatedExampleReused = false;
    this.promptDefinition = null;
    this.extraDefinition = null;
    this.extraDefinitionMessage = null;
    this.recognitionSecondChance = false;
    this.recognitionHint = null;
    this.isLoadingExtraDefinition = false;
    this.isCheckingRecognition = false;
    this.meaningCorrect = null;
    this.meaningAwaitingGrade = false;
    this.continueAfterMeaningSubmit = false;
    this.recognitionCorrect = null;
    this.validationResult = null;
    this.updatedProgress = null;
    this.pendingIncorrect = false;
    this.aiIncorrect = false;
    this.recognitionIncorrect = false;
    this.overrideCorrect = false;
    this.appealUsed = false;
    this.appealOpen = false;
    this.appealReason = '';
    this.appealFeedback = null;
    this.explanationStarted = false;
    this.explanationClosed = false;
    this.followUpQuestion = '';
    this.explanationMessages = [];
    this.heldAnswer = '';
    this.heldDefinition = '';
    this.pendingTypedAnswer = null;
    this.continueAfterSave = false;
    this.isDefinitionRevealed = false;
    this.definitionPenaltyApplied = false;
    this.definitionPenaltyPending = null;
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

  flipFree(): void {
    if (!this.freeCard || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    this.freeFlipped = !this.freeFlipped;
  }

  markFree(knows: boolean): void {
    const card = this.freeCard;
    if (!card || this.mode !== 'free' || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    this.errorMessage = null;
    this.isSavingFreeMark = true;
    this.http.put<void>(`${this.apiBaseUrl}/free-study/cards/${cardId}/mark`, { knows })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isSavingFreeMark = false;
        }
      }))
      .subscribe({
        next: () => {
          if (generation !== this.loadGeneration || this.mode !== 'free') {
            return;
          }

          const saved = this.freeCards.find(item => item.id === cardId);
          if (!saved) {
            return;
          }

          saved.knows = knows;
          if (this.freeCard?.id === cardId) {
            this.stepFree(1);
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.setHttpError(error, 'A jelölés mentése');
        },
      });
  }

  askRestartFree(): void {
    if (this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    this.freeRestartConfirm = true;
  }

  cancelRestartFree(): void {
    if (this.isClearingFreeMarks) {
      return;
    }

    this.freeRestartConfirm = false;
  }

  confirmRestartFree(): void {
    if (this.isClearingFreeMarks || !this.studying || this.mode !== 'free') {
      return;
    }

    const generation = this.loadGeneration;
    const params: Record<string, number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    this.errorMessage = null;
    this.isClearingFreeMarks = true;
    this.http.delete<void>(`${this.apiBaseUrl}/free-study/marks`, { params })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isClearingFreeMarks = false;
        }
      }))
      .subscribe({
        next: () => {
          if (generation !== this.loadGeneration || this.mode !== 'free') {
            return;
          }

          for (const card of this.freeCards) {
            card.knows = null;
          }

          this.freeCards = this.shuffleFreeCards(this.freeCards);
          this.freeIndex = 0;
          this.freeFlipped = false;
          this.freeRestartConfirm = false;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.setHttpError(error, 'A jelölések törlése');
        },
      });
  }

  onFreePointerDown(event: PointerEvent): void {
    if (!this.freeCard || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    if (event.pointerType === 'mouse' && (event.button !== 0 || Date.now() < this.freeIgnoreMouseUntil)) {
      return;
    }

    const face = event.currentTarget;
    if (face instanceof HTMLElement) {
      face.setPointerCapture(event.pointerId);
    }

    this.freePointerId = event.pointerId;
    this.freePointerType = event.pointerType;
    this.freePointerStartX = event.clientX;
    this.freePointerStartY = event.clientY;
  }

  onFreePointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.freePointerId) {
      return;
    }

    const dx = event.clientX - this.freePointerStartX;
    const dy = event.clientY - this.freePointerStartY;
    const pointerType = this.freePointerType;
    this.freePointerId = null;
    if (pointerType !== 'mouse') {
      this.freeIgnoreMouseUntil = Date.now() + 700;
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX >= 48 && absX > absY) {
      this.freeLastTapAt = 0;
      this.markFree(dx > 0);
      return;
    }

    if (absX >= 48 || absY >= 48) {
      this.freeLastTapAt = 0;
      return;
    }

    if (pointerType !== 'mouse') {
      const now = Date.now();
      if (now - this.freeLastTapAt <= 300) {
        this.freeLastTapAt = 0;
        this.flipFree();
      } else {
        this.freeLastTapAt = now;
      }
      return;
    }

    this.flipFree();
  }

  onFreePointerCancel(event: PointerEvent): void {
    if (event.pointerId === this.freePointerId) {
      this.freePointerId = null;
    }
  }

  private loadFreeCards(): void {
    if (!this.studying || this.mode !== 'free') {
      return;
    }

    const generation = ++this.loadGeneration;
    this.isLoadingCard = true;
    this.card = null;
    this.studyStatus = null;
    this.freeListLoaded = false;
    this.freeCards = [];
    this.freeIndex = 0;
    this.freeFlipped = false;
    this.freeRestartConfirm = false;
    this.freePointerId = null;
    this.resetCardState();

    const params: Record<string, number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    this.http.get<FreeStudyCard[]>(`${this.apiBaseUrl}/free-study/cards`, { params })
      .pipe(finalize(() => {
        if (generation === this.loadGeneration) {
          this.isLoadingCard = false;
        }
      }))
      .subscribe({
        next: cards => {
          if (generation !== this.loadGeneration || this.mode !== 'free') {
            return;
          }

          this.freeCards = this.shuffleFreeCards(cards);
          this.freeIndex = 0;
          this.freeFlipped = false;
          this.freeListLoaded = true;
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.setHttpError(error, 'A kártyák betöltése');
        },
      });
  }

  private shuffleFreeCards(cards: FreeStudyCard[]): FreeStudyCard[] {
    const copy = [...cards];
    for (let index = copy.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = current;
    }

    return copy;
  }

  private stepFree(delta: number): void {
    const count = this.freeCards.length;
    if (count === 0) {
      return;
    }

    this.freeIndex = (this.freeIndex + delta + count) % count;
    this.freeFlipped = false;
  }

  private clearFreeStudy(): void {
    this.freeCards = [];
    this.freeIndex = 0;
    this.freeFlipped = false;
    this.freeListLoaded = false;
    this.freeRestartConfirm = false;
    this.freePointerId = null;
    this.isSavingFreeMark = false;
    this.isClearingFreeMarks = false;
  }

  private syncFreeKeyListener(): void {
    if (this.mode === 'free') {
      if (this.freeKeyListener) {
        return;
      }

      this.freeKeyListener = (event: KeyboardEvent) => this.onFreeKeyDown(event);
      document.addEventListener('keydown', this.freeKeyListener);
      return;
    }

    this.removeFreeKeyListener();
  }

  private removeFreeKeyListener(): void {
    if (!this.freeKeyListener) {
      return;
    }

    document.removeEventListener('keydown', this.freeKeyListener);
    this.freeKeyListener = null;
  }

  private onFreeKeyDown(event: KeyboardEvent): void {
    if (!this.studying || this.mode !== 'free' || !this.freeCard || this.isSavingFreeMark || this.isClearingFreeMarks || this.isLoadingCard) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
    }

    if (event.code === 'Space' || event.key === ' ') {
      if (event.repeat) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      this.flipFree();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.stepFree(1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.stepFree(-1);
    }
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
