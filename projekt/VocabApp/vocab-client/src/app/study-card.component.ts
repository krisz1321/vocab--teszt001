import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewChecked, Component, DoCheck, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, switchMap, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { SpeakButtonComponent } from './speak-button.component';
import { SpeechService } from './speech.service';

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
  isLeech: boolean;
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
  availableCards: number;
  minimumAnswerSeconds: number;
  automaticAiCheck: boolean;
  acceptHungarianParaphrase: boolean;
  acceptPartialMeaningMatch: boolean;
  aiCheckAvailable: boolean;
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
  cardCount?: number;
}

interface FreeStudyCard {
  id: number;
  term: string;
  targetMeanings: string | null;
  definition: string;
  example: string | null;
  knows: boolean | null;
}

interface FreeUndoState {
  cardId: number;
  index: number;
  previousKnows: boolean | null;
}

type StudyDeckChoice = number | 'all';
type StudyFocus = 'all' | 'due' | 'mistakes' | 'new';

interface StudyTagOption {
  tag: string;
  count: number;
}
type StudyMode = 'meaning' | 'definition' | 'recognition' | 'free';
type StudyDirection = 'en' | 'hu' | 'mixed';
type FreeFront = 'term' | 'other';
type FreeBack = 'bilingual' | 'definition';

const hungarianAccents = 'áéíóöőúüű';
const hungarianPlain = 'aeiooouuu';

@Component({
  selector: 'app-study-card',
  standalone: true,
  imports: [CommonModule, FormsModule, SpeakButtonComponent],
  template: `
    <main class="container py-5">
      <div class="mx-auto page-wrap">
        <header class="text-center" [class.mb-4]="!studying" [class.mb-3]="studying">
          <h1 class="h3 mb-1">Tanulás</h1>
          @if (!studying) {
            <p class="text-body-secondary mb-3">Válassz gyakorlási módot.</p>
          }
          <div class="study-modes" role="group" aria-label="Tanulási mód">
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'meaning'"
              [class.btn-outline-primary]="mode !== 'meaning'"
              [title]="modeHints.meaning"
              (click)="setMode('meaning')"
              [disabled]="isInteractionLocked">
              Fordítás
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'definition'"
              [class.btn-outline-primary]="mode !== 'definition'"
              [title]="modeHints.definition"
              (click)="setMode('definition')"
              [disabled]="isInteractionLocked">
              Magyarázd el angolul
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'recognition'"
              [class.btn-outline-primary]="mode !== 'recognition'"
              [title]="modeHints.recognition"
              (click)="setMode('recognition')"
              [disabled]="isInteractionLocked">
              Találd ki a szót
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'free'"
              [class.btn-outline-primary]="mode !== 'free'"
              [title]="modeHints.free"
              (click)="setMode('free')"
              [disabled]="isInteractionLocked">
              Kártyázás
            </button>
          </div>
          @if (mode === 'meaning' || mode === 'definition') {
            <div class="d-flex flex-wrap justify-content-center align-items-center gap-2 mt-2">
              <span class="text-body-secondary small">Szót kapok:</span>
              <div class="btn-group btn-group-sm" role="group" aria-label="A kérdés nyelve">
                @for (option of directionOptions; track option.value) {
                  <button
                    type="button"
                    class="btn"
                    [class.btn-primary]="direction === option.value"
                    [class.btn-outline-primary]="direction !== option.value"
                    [attr.aria-pressed]="direction === option.value"
                    (click)="setDirection(option.value)"
                    [disabled]="isInteractionLocked">
                    {{ option.label }}
                  </button>
                }
              </div>
            </div>
          }
          <p class="study-mode-hint text-body-secondary small mb-0 mt-2">{{ modeHint }}</p>
          @if (mode !== 'free' && (dailyNewCardGoal !== null || (studying && studyStatus === 'ready'))) {
            <p class="text-body-secondary small mb-0 mt-2">
              @if (dailyNewCardGoal !== null) {
                <span>Új szavak ma: {{ newCardsIntroducedToday }}/{{ dailyNewCardGoal }}</span>
              }
              @if (dailyNewCardGoal !== null && studying && studyStatus === 'ready') {
                <span> · </span>
              }
              @if (studying && studyStatus === 'ready') {
                <span>még {{ availableCards > 0 ? availableCards - 1 : 0 }} kártya választható</span>
              }
            </p>
          }
          @if (studying && mode !== 'free' && dailyNewCardGoal !== null && dailyNewCardGoal > 0) {
            <div
              class="progress study-progress mx-auto mt-2"
              role="progressbar"
              aria-label="Mai új szavak haladása"
              [attr.aria-valuenow]="newCardsIntroducedToday"
              aria-valuemin="0"
              [attr.aria-valuemax]="dailyNewCardGoal">
              <div class="progress-bar" [style.width.%]="dailyGoalPercent"></div>
            </div>
          }
          @if (studying && mode !== 'free' && sessionAnswered > 0) {
            <p class="text-body-secondary small mb-0 mt-1">
              Ebben a gyakorlásban: {{ sessionAnswered }} válasz, ebből {{ sessionCorrect }} helyes ({{ sessionPercent }}%)
            </p>
          }
          @if (studying) {
            <div class="d-flex flex-wrap justify-content-center align-items-center gap-2 mt-2">
              <span class="fw-semibold">{{ activeDeckLabel }}</span>
              <span class="text-body-secondary">· {{ studyFocusLabel }}</span>
              @if (studyTag) {
                <span class="text-body-secondary">· címke: {{ studyTag }}</span>
              }
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

        @if (cardNotice && studying && mode !== 'free') {
          <div class="alert alert-info py-2" role="status">{{ cardNotice }}</div>
        }

        @if (!studying) {
          <form class="card border-0 shadow-sm" (ngSubmit)="startStudy()">
            <div class="card-body p-4">
              @if (showStudyGuide) {
                <div class="alert alert-info" role="note">
                  <h2 class="h6">Így működik a tanulás</h2>
                  <p class="mb-2">Válassz paklit és gyakorlási típust. Az esedékes ismétlések elsőbbséget kapnak, a hibás kártyákat pedig külön is gyakorolhatod.</p>
                  <button type="button" class="btn btn-sm btn-outline-primary" (click)="dismissStudyGuide()">Értem</button>
                </div>
              }
              @if (isLoadingDecks) {
                <div class="text-center py-4" role="status">
                  <div class="spinner-border text-primary"></div>
                  <p class="mt-3 mb-0">Paklik betöltése…</p>
                </div>
              } @else {
                @if (hasNoCards) {
                  <div class="alert alert-warning" role="status">
                    <p class="mb-2">Még nincs egyetlen kártyád sem, így nincs mit gyakorolni. Vegyél fel kártyákat a saját paklidba, vagy másolj le egy kész közös paklit.</p>
                    <button type="button" class="btn btn-sm btn-primary" (click)="openDecks.emit()">Ugrás a paklikhoz</button>
                  </div>
                }
                <label class="form-label fw-semibold" for="study-deck">Pakli</label>
                <select
                  id="study-deck"
                  name="studyDeck"
                  class="form-select mb-3"
                  [(ngModel)]="deckChoice"
                  (ngModelChange)="refreshTagOptions()">
                  <option [ngValue]="null" disabled>Válassz paklit</option>
                  <option [ngValue]="'all'">Összes pakli</option>
                  @for (deck of decks; track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
                @if (tagOptions.length > 0) {
                  <label class="form-label fw-semibold" for="study-tag">Címke</label>
                  <select
                    id="study-tag"
                    name="studyTag"
                    class="form-select mb-3"
                    [(ngModel)]="studyTag"
                    (ngModelChange)="saveStudyTag()">
                    <option [ngValue]="''">Minden címke</option>
                    @for (option of tagOptions; track option.tag) {
                      <option [ngValue]="option.tag">{{ option.tag }} ({{ option.count }})</option>
                    }
                  </select>
                }
                <label class="form-label fw-semibold" for="study-focus">Gyakorlás típusa</label>
                <select
                  id="study-focus"
                  name="studyFocus"
                  class="form-select mb-3"
                  [(ngModel)]="studyFocus"
                  (ngModelChange)="saveStudyFocus()">
                  <option [ngValue]="'all'">Összes tanulható kártya</option>
                  <option [ngValue]="'due'">Csak esedékes ismétlések</option>
                  <option [ngValue]="'mistakes'">Csak korábban hibás kártyák</option>
                  <option [ngValue]="'new'">Csak új kártyák</option>
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
          <section class="free-study-shell" aria-label="Kártyázás">
            <div class="free-study-toolbar">
              <div>
                <span class="free-study-kicker">{{ activeDeckLabel }}</span>
                <strong>{{ freeIndex + 1 }} / {{ freeCards.length }}</strong>
              </div>
              <div class="d-flex align-items-center gap-2">
                @if (freeShowStats) {
                  <span class="free-study-progress">{{ freeKnowCount }} tudom · {{ freeDontKnowCount }} nem tudom</span>
                }
                <button type="button" class="btn btn-light btn-sm free-settings-button" (click)="freeSettingsOpen = !freeSettingsOpen" aria-label="Kártyázás beállításai" title="Beállítások">
                  Beállítások
                </button>
              </div>
            </div>

            @if (freeSettingsOpen) {
              <div class="free-settings-panel" role="dialog" aria-label="Kártyázás beállításai">
                <div class="free-settings-heading">
                  <strong>Tanulási nézet</strong>
                  <button type="button" class="btn-close" aria-label="Bezárás" (click)="freeSettingsOpen = false"></button>
                </div>
                <label class="free-setting-row"><input type="checkbox" [(ngModel)]="freeShowStats" (ngModelChange)="saveFreeSetting('stats', $event)"> <span>Statisztikák megjelenítése</span></label>
                <label class="free-setting-row"><input type="checkbox" [(ngModel)]="freeShowAudio" (ngModelChange)="saveFreeSetting('audio', $event)"> <span>Kiejtés gomb megjelenítése</span></label>
                <label class="free-setting-row"><input type="checkbox" [(ngModel)]="freeKeyboardEnabled" (ngModelChange)="saveFreeSetting('keyboard', $event)"> <span>Billentyűparancsok engedélyezése</span></label>
                <label class="free-setting-row"><input type="checkbox" [(ngModel)]="freeShowExample" (ngModelChange)="saveFreeSetting('example', $event)"> <span>Példamondat megjelenítése</span></label>
                <div class="row g-2 mt-2">
                  <div class="col-6"><label class="small text-body-secondary" for="free-front">Elöl</label><select id="free-front" name="freeFront" class="form-select form-select-sm" [(ngModel)]="freeFront"><option [ngValue]="'term'">Angol szó</option><option [ngValue]="'other'">A másik oldal</option></select></div>
                  <div class="col-6"><label class="small text-body-secondary" for="free-back">Hátul</label><select id="free-back" name="freeBack" class="form-select form-select-sm" [(ngModel)]="freeBack"><option [ngValue]="'bilingual'">Angol–magyar</option><option [ngValue]="'definition'">Definícióval</option></select></div>
                </div>
              </div>
            }

            <div class="free-study-stage">
              <div class="free-swipe-label free-swipe-label-left" [class.is-visible]="freeSwipeX < -24">Nem tudom</div>
              <div class="free-swipe-label free-swipe-label-right" [class.is-visible]="freeSwipeX > 24">Tudom</div>
              <div
                class="card border-0 free-study-face"
                [class.is-dragging]="isFreeDragging"
                [class.is-exiting]="freeSwipeAnimating"
                [style.transform]="freeCardTransform"
                (pointerdown)="onFreePointerDown($event)"
                (pointermove)="onFreePointerMove($event)"
                (pointerup)="onFreePointerUp($event)"
                (pointercancel)="onFreePointerCancel($event)"
                role="button"
                tabindex="0"
                [attr.aria-label]="freeShowingTerm ? 'A kártya eleje, fordításhoz kattints vagy használd a Space billentyűt' : 'A kártya hátulja'">
                <div class="card-body d-flex flex-column justify-content-center align-items-center text-center p-4 p-md-5">
                  <span class="free-card-hint">{{ freeShowingTerm ? 'Fordítsd meg a kártyát' : 'Megoldás' }}</span>
                  @if (freeShowingTerm) {
                    <p class="free-card-word">{{ freeFront === 'term' ? card.term : (card.targetMeanings?.trim() || 'Nincs megadva magyar jelentés.') }}</p>
                    @if (freeFront === 'other' && !card.targetMeanings?.trim()) {
                      <button type="button" class="btn btn-outline-primary btn-sm mb-2" (click)="generateFreeMeaning()" (pointerdown)="$event.stopPropagation()" (pointerup)="$event.stopPropagation()" [disabled]="isGeneratingFreeMeaning">
                        @if (isGeneratingFreeMeaning) {
                          <span class="spinner-border spinner-border-sm me-2"></span>
                        }
                        Magyar jelentés generálása
                      </button>
                    }
                    @if (freeShowAudio) {
                      <app-speak-button
                        [text]="freeFront === 'term' ? card.term : card.targetMeanings"
                        [lang]="freeFront === 'term' ? 'en' : 'hu'"
                        [label]="freeFront === 'term' ? 'A szó' : 'A magyar jelentés'" />
                    }
                  } @else {
                    <p class="free-card-word">{{ freeFront === 'term' ? (card.targetMeanings?.trim() || 'Nincs megadva magyar jelentés.') : card.term }}</p>
                    @if (freeFront === 'term' && !card.targetMeanings?.trim()) {
                      <button type="button" class="btn btn-outline-primary btn-sm mb-2" (click)="generateFreeMeaning()" (pointerdown)="$event.stopPropagation()" (pointerup)="$event.stopPropagation()" [disabled]="isGeneratingFreeMeaning">
                        @if (isGeneratingFreeMeaning) {
                          <span class="spinner-border spinner-border-sm me-2"></span>
                        }
                        Magyar jelentés generálása
                      </button>
                    }
                    @if (freeShowAudio) {
                      <app-speak-button
                        [text]="freeFront === 'term' ? card.targetMeanings : card.term"
                        [lang]="freeFront === 'term' ? 'hu' : 'en'"
                        [label]="freeFront === 'term' ? 'A magyar jelentés' : 'A szó'" />
                    }
                    @if (freeBack === 'definition') {
                      <p class="free-card-definition">{{ card.definition }}</p>
                      @if (freeShowAudio) {
                        <app-speak-button [text]="card.definition" lang="en" label="A definíció" />
                      }
                    }
                    @if (freeShowExample && card.example) {
                      <p class="free-card-example">{{ card.example }}</p>
                      @if (freeShowAudio) {
                        <app-speak-button [text]="card.example" lang="en" label="A példamondat" />
                      }
                    }
                  }
                  <span class="free-card-hint free-card-hint-bottom">Space a fordításhoz</span>
                </div>
              </div>
            </div>

            <div class="free-study-actions">
              <button type="button" class="btn free-action free-action-no" (click)="markFree(false)" [disabled]="isSavingFreeMark || isClearingFreeMarks" aria-label="Nem tudom, balra húzás"><span aria-hidden="true">←</span><span>Nem tudom</span></button>
              <button type="button" class="btn btn-outline-secondary free-flip-button" (click)="flipFree()" [disabled]="isSavingFreeMark || isClearingFreeMarks">Fordítás</button>
              <button type="button" class="btn free-action free-action-yes" (click)="markFree(true)" [disabled]="isSavingFreeMark || isClearingFreeMarks" aria-label="Tudom, jobbra húzás"><span>Tudom</span><span aria-hidden="true">→</span></button>
            </div>
            <div class="free-study-footer">
              <button type="button" class="btn btn-link btn-sm" (click)="undoFree()" [disabled]="!freeUndo || isSavingFreeMark || isClearingFreeMarks">Visszavonás</button>
              <button type="button" class="btn btn-link btn-sm text-body-secondary" (click)="askRestartFree()" [disabled]="isSavingFreeMark || isClearingFreeMarks">Újrakezdés</button>
            </div>
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
                @if (!showTermInHeader) {
                  <div class="d-flex align-items-center gap-2">
                    <h2 class="h1 mb-0 text-break">{{ card.targetMeanings }}</h2>
                    <app-speak-button [text]="card.targetMeanings" lang="hu" label="A magyar jelentés" />
                  </div>
                } @else if (mode !== 'recognition' || isRecognitionRevealed) {
                  <div class="d-flex align-items-center gap-2">
                    <h2 class="h1 mb-0 text-break">{{ card.term }}</h2>
                    <app-speak-button [text]="card.term" lang="en" label="A szó" />
                  </div>
                } @else {
                  <h2 class="h3 mb-0">Körülírás</h2>
                }
                <div class="d-flex flex-wrap gap-2 align-items-center">
                  <span class="badge text-bg-success">Sorozat: {{ card.streak }}</span>
                  @if (card.isLeech) {
                    <span class="badge text-bg-warning" title="Sokszor elrontott szó. Ha zavar, tedd félre az óra vagy a szünet gombbal.">Nehéz szó</span>
                  }
                  <span class="badge text-bg-danger">Hibák: {{ card.incorrectCount }}</span>
                  <span class="badge text-bg-secondary">Időköz: {{ card.interval }} nap</span>
                  <span class="badge text-bg-info">Könnyűség: {{ card.easeFactor | number:'1.1-1' }}</span>
                  <button
                    type="button"
                    class="btn btn-sm suspend-btn"
                    [class.btn-outline-primary]="automaticAiCheck"
                    [class.btn-outline-secondary]="!automaticAiCheck"
                    [disabled]="isTogglingAiCheck"
                    (click)="toggleAutomaticAiCheck()"
                    [attr.aria-pressed]="automaticAiCheck"
                    [attr.aria-label]="automaticAiCheck ? 'Automatikus MI-ellenőrzés kikapcsolása' : 'Automatikus MI-ellenőrzés bekapcsolása'"
                    [attr.title]="automaticAiCheck ? 'Automatikus MI-ellenőrzés: bekapcsolva (kattints a kikapcsoláshoz)' : 'Automatikus MI-ellenőrzés: kikapcsolva (kattints a bekapcsoláshoz)'">
                    <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4l1.8 4.7L17.5 10.5l-4.7 1.8L11 17l-1.8-4.7L4.5 10.5l4.7-1.8z"/><path d="M18 3v4M16 5h4"/>@if (!automaticAiCheck) {<path d="M4 20L20 4"/>}</svg>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm suspend-btn"
                    [disabled]="isSuspendBusy"
                    (click)="suspendCurrentCard('buried')"
                    aria-label="Elnapolás holnapig"
                    title="Elnapolás holnapig: a kártya holnapig nem jelenik meg">
                    <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm suspend-btn"
                    [disabled]="isSuspendBusy"
                    (click)="suspendCurrentCard('suspended')"
                    aria-label="Felfüggesztés"
                    title="Felfüggesztés: a kártya addig nem jelenik meg, amíg a pakli kártyalistájában vissza nem kapcsolod">
                    <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>
                  </button>
                </div>
              </div>

              @if (secondsUntilAnswer > 0) {
                <p class="text-body-secondary">Még {{ secondsUntilAnswer }} mp a válaszadásig.</p>
              }

              @if (mode === 'meaning') {
                @if (hasTargetMeanings) {
                  @if (!isReversed) {
                    <p class="text-body-secondary">Ehhez a szóhoz már van célnyelvi jelentés.</p>
                  }
                  <label for="meaning-answer" class="form-label fw-semibold">{{ isReversed ? 'Írd be az angol szót.' : 'Írd be a magyar jelentést.' }}</label>
                  <textarea
                    id="meaning-answer"
                    class="form-control"
                    [attr.rows]="isReversed ? 2 : 4"
                    [attr.maxlength]="isReversed ? 100 : 1000"
                    [(ngModel)]="answer"
                    (keydown.control.enter)="submitShortcut($event)"
                    (keydown.enter)="onAnswerEnter($event)"
                    [disabled]="isSubmitting || updatedProgress !== null || isMeaningRevealed"
                    [placeholder]="isReversed ? 'Ide írd az angol szót…' : 'Ide írd a választ…'"></textarea>

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
                      <div class="speak-row mb-2">
                        <p class="mb-0">{{ card.targetMeanings }}</p>
                        <app-speak-button [text]="card.targetMeanings" lang="hu" label="A magyar jelentés" />
                      </div>
                      <div class="speak-row mb-2">
                        <p class="mb-0">{{ card.definition }}</p>
                        <app-speak-button [text]="card.definition" lang="en" label="A definíció" />
                      </div>
                      @if (card.example) {
                        <div class="speak-row">
                          <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                          <app-speak-button [text]="card.example" lang="en" label="A példamondat" />
                        </div>
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
                          [disabled]="isSubmitting || !aiCheckAvailable"
                          [attr.title]="aiCheckAvailable ? null : 'Az MI-keret elfogyott.'">
                          MI-ellenőrzés
                        </button>
                        <button
                          type="button"
                          class="btn btn-success"
                          (click)="skipMeaningAiCheck()"
                          data-next-card
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
                    maxlength="300"
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
                <label for="answer" class="form-label fw-semibold">{{ definitionPromptLabel }}</label>
                <textarea
                  id="answer"
                  class="form-control"
                  rows="4"
                  maxlength="1000"
                  [(ngModel)]="answer"
                  (keydown.control.enter)="submitShortcut($event)"
                    (keydown.enter)="onAnswerEnter($event)"
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
                    <div class="speak-row mb-2">
                      <p class="mb-0">{{ card.definition }}</p>
                      <app-speak-button [text]="card.definition" lang="en" label="A definíció" />
                    </div>
                    @if (card.example) {
                      <div class="speak-row">
                        <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                        <app-speak-button [text]="card.example" lang="en" label="A példamondat" />
                      </div>
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
                  <div class="speak-row mb-3">
                    <p class="lead mb-0">{{ promptDefinition }}</p>
                    <app-speak-button [text]="promptDefinition" lang="en" label="A körülírás" />
                  </div>
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
                    (keydown.control.enter)="submitShortcut($event)"
                    (keydown.enter)="onAnswerEnter($event)"
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
                        aria-label="Másik definíció kérése" title="Másik definíció kérése">
                        @if (isLoadingExtraDefinition) {
                          <span class="spinner-border spinner-border-sm"></span>
                        } @else {
                          Másik definíció
                        }
                      </button>
                    </div>
                  }
                }

                @if (isRecognitionRevealed) {
                  <div class="mt-4 p-3 bg-body-tertiary rounded">
                    <h3 class="h6">A szó</h3>
                    <div class="speak-row mb-2">
                      <p class="mb-0 fw-semibold">{{ card.term }}</p>
                      <app-speak-button [text]="card.term" lang="en" label="A szó" />
                    </div>
                    <div class="speak-row mb-2">
                      <p class="mb-0">{{ card.definition }}</p>
                      <app-speak-button [text]="card.definition" lang="en" label="A definíció" />
                    </div>
                    @if (card.example) {
                      <div class="speak-row">
                        <p class="mb-0 fst-italic text-body-secondary">{{ card.example }}</p>
                        <app-speak-button [text]="card.example" lang="en" label="A példamondat" />
                      </div>
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
                <div class="alert alert-info mt-3 mb-0 speak-row">
                  <div><strong>{{ generatedDefinitionLabel() }}:</strong> {{ generatedDefinition }}</div>
                  <app-speak-button [text]="generatedDefinition" lang="en" label="A definíció" />
                </div>
              }

              @if (generatedExample) {
                <div class="alert alert-info mt-3 mb-0 speak-row">
                  <div><strong>{{ generatedExampleReused ? 'Mentett példamondat' : 'MI-példamondat' }}:</strong> @for (part of generatedExampleParts; track $index) {@if (part.hit) {<mark class="example-term">{{ part.text }}</mark>} @else {{{ part.text }}}}</div>
                  <app-speak-button [text]="generatedExample" lang="en" label="A példamondat" />
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
                          data-next-card
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
                          data-next-card
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
    .free-card-word, .free-card-definition, .free-card-example { overflow-wrap: anywhere; }
    [data-next-card] { scroll-margin-bottom: 5rem; }
    .study-progress { height: .45rem; max-width: 22rem; }
    .study-progress .progress-bar { background-color: var(--app-primary); }
    .free-study-shell { position: relative; max-width: 880px; margin: 0 auto; }
    .free-study-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .free-study-kicker { display: block; color: var(--app-muted); font-size: .78rem; letter-spacing: .04em; text-transform: uppercase; }
    .free-study-progress { color: var(--app-muted); font-size: .85rem; }
    .free-settings-button { border: 1px solid var(--app-border); }
    .free-settings-panel { position: absolute; z-index: 5; top: 3.5rem; right: 0; width: min(20rem, calc(100vw - 2rem)); padding: 1rem; border: 1px solid var(--app-border); border-radius: .75rem; background: var(--app-surface); box-shadow: 0 .75rem 2rem rgba(0, 0, 0, .25); }
    .free-settings-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
    .free-setting-row { display: flex; align-items: center; gap: .6rem; padding: .42rem 0; font-size: .9rem; cursor: pointer; }
    .free-setting-row input { width: 1rem; height: 1rem; accent-color: var(--app-primary); }
    .suspend-btn { display: inline-flex; align-items: center; justify-content: center; padding: .3rem .45rem; line-height: 1; }
    .free-study-stage { position: relative; min-height: 25rem; }
    .free-study-face { min-height: 25rem; touch-action: pan-y; user-select: none; display: flex; position: relative; z-index: 2; border: 1px solid var(--app-border) !important; border-radius: var(--app-radius-lg); background: linear-gradient(145deg, var(--app-surface), color-mix(in srgb, var(--app-primary) 6%, var(--app-surface))); box-shadow: var(--app-shadow) !important; transition: transform .22s ease, box-shadow .22s ease; cursor: grab; }
    .free-study-face.is-dragging { transition: none; cursor: grabbing; }
    .free-study-face.is-exiting { transition: transform .18s ease-out; }
    .free-study-face > .card-body { flex: 1 1 auto; }
    .example-term { padding: .05em .4em; border-radius: .35rem; background: color-mix(in srgb, var(--app-primary) 28%, transparent); color: var(--app-primary); font-weight: 700; }
    .free-card-hint { color: var(--app-muted); font-size: .76rem; letter-spacing: .08em; text-transform: uppercase; }
    .free-card-word { max-width: 100%; margin: 1rem 0 .5rem; color: var(--app-text); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.1; overflow-wrap: anywhere; }
    .free-card-definition { max-width: 42rem; margin: .4rem 0; color: var(--app-text); font-size: 1.12rem; }
    .free-card-example { max-width: 42rem; margin: .4rem 0; color: var(--app-muted); font-style: italic; }
    .free-card-hint-bottom { margin-top: auto; }
    .free-swipe-label { position: absolute; z-index: 3; top: 1.5rem; padding: .5rem .8rem; border: 2px solid currentColor; border-radius: .5rem; font-weight: 700; opacity: 0; transition: opacity .12s ease; pointer-events: none; }
    .free-swipe-label.is-visible { opacity: 1; }
    .free-swipe-label-left { left: 1.5rem; color: var(--app-danger); transform: rotate(-8deg); }
    .free-swipe-label-right { right: 1.5rem; color: var(--app-success); transform: rotate(8deg); }
    .free-study-actions { display: grid; grid-template-columns: 1fr auto 1fr; gap: .75rem; align-items: center; margin-top: 1rem; }
    .free-action { display: inline-flex; align-items: center; justify-content: center; gap: .6rem; min-height: 3.2rem; border: 1px solid; border-radius: var(--app-radius); font-weight: 600; }
    .free-action-no { color: var(--app-danger); border-color: color-mix(in srgb, var(--app-danger) 40%, transparent); background: color-mix(in srgb, var(--app-danger) 10%, var(--app-surface)); }
    .free-action-yes { color: var(--app-success); border-color: color-mix(in srgb, var(--app-success) 40%, transparent); background: color-mix(in srgb, var(--app-success) 10%, var(--app-surface)); }
    .free-action span:first-child, .free-action span:last-child { font-size: 1.25rem; }
    .free-flip-button { min-height: 2.8rem; }
    .free-study-footer { display: flex; justify-content: space-between; margin-top: .35rem; }
    @media (max-width: 575.98px) { .free-study-toolbar { align-items: flex-start; } .free-study-progress { display: none; } .free-study-stage, .free-study-face { min-height: 22rem; } .free-study-actions { grid-template-columns: 1fr 1fr; } .free-flip-button { grid-column: 1 / -1; grid-row: 1; } .free-action { min-height: 3rem; } }
    @media (prefers-reduced-motion: reduce) { .free-study-face, .free-swipe-label { transition: none; } }
  `],
})
export class StudyCardComponent implements OnInit, OnDestroy, AfterViewChecked, DoCheck {
  @Input() initialDeckId: number | null = null;
  @Output() readonly openDecks = new EventEmitter<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly speech = inject(SpeechService);
  private readonly apiBaseUrl = '/api';

  card: StudyCard | null = null;
  mode: StudyMode = this.readStudyMode();
  direction: StudyDirection = this.readStudyDirection();
  cardDirection: 'en' | 'hu' = 'en';
  automaticAiCheck = true;
  acceptHungarianParaphrase = false;
  acceptPartialMeaningMatch = true;
  aiCheckAvailable = true;
  requireAppealReason = true;
  meaningAwaitingGrade = false;
  answer = '';
  targetMeaningsDraft = '';
  generatedDefinition: string | null = null;
  generatedDefinitionFromCard = false;
  generatedDefinitionReused = false;
  generatedExample: string | null = null;
  generatedExampleParts: { text: string; hit: boolean }[] = [];
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
  studyFocus: StudyFocus = this.readStudyFocus();
  studyTag = this.readStudyTag();
  tagOptions: StudyTagOption[] = [];
  showStudyGuide = this.readStudyGuideVisibility();
  isLoadingPrompt = false;
  isGeneratingDefinition = false;
  isGeneratingExample = false;
  isGeneratingTargetMeaning = false;
  isSavingTargetMeaning = false;
  isGeneratingFreeMeaning = false;
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
  cardNotice: string | null = null;
  private pendingCardNotice: string | null = null;
  isSuspending = false;
  isTogglingAiCheck = false;
  studyStatus: StudyNextResponse['status'] | null = null;
  newCardsIntroducedToday = 0;
  sessionAnswered = 0;
  sessionCorrect = 0;
  dailyNewCardGoal: number | null = null;
  availableCards = 0;
  secondsUntilAnswer = 0;
  freeFront: FreeFront = 'term';
  freeBack: FreeBack = 'bilingual';
  freeCards: FreeStudyCard[] = [];
  freeIndex = 0;
  private lastAutoSpeechKey: string | null = null;
  freeFlipped = false;
  freeListLoaded = false;
  freeRestartConfirm = false;
  freeSettingsOpen = false;
  freeShowStats = true;
  freeShowAudio = true;
  freeKeyboardEnabled = true;
  freeShowExample = true;
  freeSwipeX = 0;
  freeSwipeAnimating = false;
  freeUndo: FreeUndoState | null = null;
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
  private lastNextButton: Element | null = null;
  private lastShownCardId: number | null = null;
  private nextFocusTimer: ReturnType<typeof setTimeout> | null = null;
  private freePointerId: number | null = null;
  private freePointerType = '';
  private freePointerStartX = 0;
  private freePointerStartY = 0;
  private freePointerMoved = false;
  private freeSwipeTimeout: ReturnType<typeof setTimeout> | null = null;
  private freeLastTapAt = 0;
  private freeIgnoreMouseUntil = 0;

  get dailyGoalPercent(): number {
    if (!this.dailyNewCardGoal || this.dailyNewCardGoal <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((this.newCardsIntroducedToday / this.dailyNewCardGoal) * 100));
  }

  get sessionPercent(): number {
    return this.sessionAnswered === 0 ? 0 : Math.round((this.sessionCorrect / this.sessionAnswered) * 100);
  }

  get hasNoCards(): boolean {
    return this.decks.length > 0 && this.decks.every(deck => (deck.cardCount ?? 0) === 0);
  }

  readonly directionOptions: { value: StudyDirection; label: string }[] = [
    { value: 'en', label: 'Angolul' },
    { value: 'hu', label: 'Magyarul' },
    { value: 'mixed', label: 'Vegyesen' },
  ];

  get modeHints(): Record<StudyMode, string> {
    const direction = this.direction;
    return {
      meaning: direction === 'en'
        ? 'Látod az angol szót, és beírod a magyar jelentését.'
        : direction === 'hu'
          ? 'Látod a magyar jelentést, és beírod az angol szót.'
          : 'Hol az angol szót látod és magyarul válaszolsz, hol fordítva.',
      definition: direction === 'en'
        ? 'Látod az angol szót, és angolul elmagyarázod, mit jelent.'
        : direction === 'hu'
          ? 'Látod a magyar szót, és angolul elmagyarázod, mit jelent.'
          : 'Hol az angol, hol a magyar szót látod, és angolul elmagyarázod, mit jelent.',
      recognition: 'Látod a körülírást, és beírod hozzá az angol szót.',
      free: 'Kártyák lapozgatása: fordítsd meg, majd jelöld, hogy tudod-e.',
    };
  }

  get modeHint(): string {
    return this.modeHints[this.mode];
  }

  get definitionPromptLabel(): string {
    const subject = this.isReversed ? 'mit jelent ez a magyar szó' : 'mit jelent';
    return this.acceptHungarianParaphrase
      ? `Magyarázd el saját szavaiddal, ${subject}.`
      : `Magyarázd el angolul saját szavaiddal, ${subject}.`;
  }

  /** Az aktuális kártyánál a magyar jelentés a kérdés, és angolul kell válaszolni. */
  get isReversed(): boolean {
    return this.cardDirection === 'hu' && (this.mode === 'meaning' || this.mode === 'definition');
  }

  /** Fordított irányban az angol szó csak a válasz után derülhet ki. */
  get showTermInHeader(): boolean {
    if (!this.isReversed) {
      return true;
    }

    return this.mode === 'meaning'
      ? this.isMeaningRevealed
      : this.isDefinitionRevealed || this.updatedProgress !== null;
  }

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

  get studyFocusLabel(): string {
    return {
      all: 'összes tanulható kártya',
      due: 'esedékes ismétlések',
      mistakes: 'hibás kártyák',
      new: 'új kártyák',
    }[this.studyFocus];
  }

  get canChangeDeck(): boolean {
    if (this.mode === 'free') {
      return !this.isSavingFreeMark && !this.isClearingFreeMarks;
    }

    // Megválaszolatlan kártyánál bármikor lehet paklit váltani, de egy kiértékelt,
    // még el nem mentett válasz esetén előbb a "Következő kártya" gombbal le kell zárni.
    return this.card === null
      || this.updatedProgress !== null
      || (!this.hasUnsavedAnswer && !this.isInteractionLocked);
  }

  get hasUnsavedAnswer(): boolean {
    return this.isMeaningRevealed
      || this.isRecognitionRevealed
      || this.isDefinitionRevealed
      || this.validationResult !== null
      || this.meaningAwaitingGrade
      || this.pendingIncorrect
      || this.definitionPenaltyPending !== null;
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

  get isFreeDragging(): boolean {
    return this.freePointerId !== null;
  }

  get freeCardTransform(): string {
    const rotation = Math.max(-12, Math.min(12, this.freeSwipeX / 18));
    return `translate3d(${this.freeSwipeX}px, 0, 0) rotate(${rotation}deg)`;
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
    this.loadFreeSettings();
    this.loadDecks();
  }

  ngDoCheck(): void {
    const face = this.autoSpeechFace();
    if (face?.key === this.lastAutoSpeechKey) {
      return;
    }

    this.lastAutoSpeechKey = face?.key ?? null;
    if (face) {
      this.speech.autoSpeak(face.text, face.lang);
    }
  }

  /** Ami a kártyán most elsőként látszik, és amit az automatikus felolvasás felolvas. */
  private autoSpeechFace(): { key: string; text: string; lang: 'en' | 'hu' } | null {
    if (!this.studying || this.isLoadingCard) {
      return null;
    }

    let text: string | null | undefined;
    let lang: 'en' | 'hu' = 'en';
    let key: string;
    if (this.mode === 'free') {
      const card = this.freeCard;
      if (!card || !this.freeShowAudio) {
        return null;
      }

      const showTerm = this.freeShowingTerm;
      lang = showTerm === (this.freeFront === 'term') ? 'en' : 'hu';
      text = lang === 'en' ? card.term : card.targetMeanings;
      key = `free:${card.id}:${showTerm}:${this.freeFront}`;
    } else if (!this.card) {
      return null;
    } else if (this.mode === 'recognition' && !this.isRecognitionRevealed) {
      text = this.isLoadingPrompt ? null : this.promptDefinition;
      key = `prompt:${this.card.id}:${text}`;
    } else {
      text = this.card.term;
      key = `term:${this.card.id}:${this.mode}`;
    }

    return text?.trim() ? { key, text, lang } : null;
  }

  ngAfterViewChecked(): void {
    const nextButton = this.host.nativeElement.querySelector('[data-next-card]');
    if (nextButton !== this.lastNextButton) {
      this.lastNextButton = nextButton;
      if (this.nextFocusTimer) {
        clearTimeout(this.nextFocusTimer);
        this.nextFocusTimer = null;
      }

      if (nextButton instanceof HTMLElement) {
        // Rövid késleltetés, hogy a gyors dupla Enter ne ugorja át az eredmény elolvasását.
        this.nextFocusTimer = setTimeout(() => {
          this.nextFocusTimer = null;
          nextButton.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          if (nextButton.isConnected && !nextButton.hasAttribute('disabled')) {
            nextButton.focus({ preventScroll: true });
          }
        }, 350);
      }
    }

    const shownCardId = this.card?.id ?? null;
    if (shownCardId !== this.lastShownCardId) {
      this.lastShownCardId = shownCardId;
      if (shownCardId !== null) {
        this.host.nativeElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
  }

  ngOnDestroy(): void {
    if (this.nextFocusTimer) {
      clearTimeout(this.nextFocusTimer);
    }
    this.clearAnswerTimer();
    this.clearFreeSwipeTimeout();
    this.removeFreeKeyListener();
    this.speech.stop();
    if (this.pendingIncorrect && !this.updatedProgress && !this.isSubmitting) {
      this.submitResult(this.overrideCorrect, this.aiIncorrect, this.pendingTypedAnswer ?? undefined);
    }
  }

  setMode(mode: StudyMode): void {
    if (mode === this.mode || this.isInteractionLocked) {
      return;
    }

    this.mode = mode;
    this.saveStudyMode();
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

  setDirection(direction: StudyDirection): void {
    if (direction === this.direction || this.isInteractionLocked) {
      return;
    }

    this.direction = direction;
    this.saveStudyDirection();
    if (this.studying && (this.mode === 'meaning' || this.mode === 'definition')) {
      this.loadNextCard();
    }
  }

  startStudy(): void {
    if (this.deckChoice === null || this.studying) {
      return;
    }

    this.saveStudyDeck();
    this.studying = true;
    this.errorMessage = null;
    this.sessionAnswered = 0;
    this.sessionCorrect = 0;
    this.syncFreeKeyListener();
    if (this.mode === 'free') {
      this.loadFreeCards();
      return;
    }

    this.loadNextCard();
  }

  dismissStudyGuide(): void {
    localStorage.setItem(this.preferenceKey('study-guide-dismissed'), 'true');
    this.showStudyGuide = false;
  }

  saveStudyFocus(): void {
    localStorage.setItem(this.preferenceKey('study-focus'), this.studyFocus);
  }

  saveStudyTag(): void {
    try {
      localStorage.setItem(this.preferenceKey('study-tag'), this.studyTag);
    } catch {
      // A böngésző tárolója nem elérhető, ilyenkor a címke nem jegyződik meg.
    }
  }

  private readStudyTag(): string {
    try {
      return localStorage.getItem(this.preferenceKey('study-tag')) ?? '';
    } catch {
      return '';
    }
  }

  /** A választható címkék a kiválasztott paklihoz tartozó kártyákról jönnek; az eltűnt címke kiválasztása törlődik. */
  refreshTagOptions(afterLoad?: () => void): void {
    const params: Record<string, string | number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }

    this.http.get<StudyTagOption[]>(`${this.apiBaseUrl}/cards/tags`, { params }).subscribe({
      next: options => {
        this.tagOptions = options;
        if (this.studyTag && !options.some(option => option.tag === this.studyTag)) {
          this.studyTag = '';
          this.saveStudyTag();
        }

        afterLoad?.();
      },
      error: () => {
        this.tagOptions = [];
        this.studyTag = '';
        afterLoad?.();
      },
    });
  }

  private saveStudyDeck(): void {
    if (this.deckChoice === null) {
      return;
    }

    try {
      localStorage.setItem(this.preferenceKey('study-deck'), String(this.deckChoice));
    } catch {
      // A böngésző tárolója nem elérhető, ilyenkor a pakli nem jegyződik meg.
    }
  }

  private readStudyDeck(): StudyDeckChoice | null {
    try {
      const stored = localStorage.getItem(this.preferenceKey('study-deck'));
      if (stored === 'all') {
        return 'all';
      }

      const id = Number(stored);
      return stored !== null && Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private saveStudyMode(): void {
    try {
      localStorage.setItem(this.preferenceKey('study-mode'), this.mode);
    } catch {
      // A böngésző tárolója nem elérhető, ilyenkor a mód nem jegyződik meg.
    }
  }

  private readStudyMode(): StudyMode {
    try {
      const stored = localStorage.getItem(this.preferenceKey('study-mode'));
      return stored === 'definition' || stored === 'recognition' || stored === 'free' ? stored : 'meaning';
    } catch {
      return 'meaning';
    }
  }

  private saveStudyDirection(): void {
    try {
      localStorage.setItem(this.preferenceKey('study-direction'), this.direction);
    } catch {
      // A böngésző tárolója nem elérhető, ilyenkor az irány nem jegyződik meg.
    }
  }

  private readStudyDirection(): StudyDirection {
    try {
      const stored = localStorage.getItem(this.preferenceKey('study-direction'));
      return stored === 'hu' || stored === 'mixed' ? stored : 'en';
    } catch {
      return 'en';
    }
  }

  /** Vegyes irányban kártyánként dől el; magyar jelentés nélküli kártyánál mindig az angol irány marad. */
  private pickCardDirection(card: StudyCard): 'en' | 'hu' {
    if ((this.mode !== 'meaning' && this.mode !== 'definition') || !card.targetMeanings?.trim()) {
      return 'en';
    }

    if (this.direction === 'mixed') {
      return Math.random() < 0.5 ? 'en' : 'hu';
    }

    return this.direction;
  }

  private readStudyFocus(): StudyFocus {
    const stored = localStorage.getItem(this.preferenceKey('study-focus'));
    return stored === 'due' || stored === 'mistakes' || stored === 'new' ? stored : 'all';
  }

  private readStudyGuideVisibility(): boolean {
    return localStorage.getItem(this.preferenceKey('study-guide-dismissed')) !== 'true';
  }

  private preferenceKey(name: string): string {
    const identity = this.session.email()?.trim().toLowerCase() || 'anonymous';
    return `vocabapp.${identity}.${name}`;
  }

  private loadFreeSettings(): void {
    this.freeShowStats = this.readBooleanPreference('free-stats', true);
    this.freeShowAudio = this.readBooleanPreference('free-audio', true);
    this.freeKeyboardEnabled = this.readBooleanPreference('free-keyboard', true);
    this.freeShowExample = this.readBooleanPreference('free-example', true);
  }

  private readBooleanPreference(name: string, fallback: boolean): boolean {
    const stored = localStorage.getItem(this.preferenceKey(name));
    return stored === null ? fallback : stored === 'true';
  }

  saveFreeSetting(name: 'stats' | 'audio' | 'keyboard' | 'example', value: boolean): void {
    localStorage.setItem(this.preferenceKey(`free-${name}`), String(value));
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
          if (this.studying) {
            return;
          }

          if (this.initialDeckId !== null && decks.some(deck => deck.id === this.initialDeckId)) {
            this.deckChoice = this.initialDeckId;
            this.initialDeckId = null;
            this.refreshTagOptions(() => this.startStudy());
            return;
          }

          // Az utoljára használt pakli megjegyződik: ha még él és van benne kártya, a tanulás
          // rögtön indul, a pakli a "Másik pakli" gombbal módosítható.
          const remembered = this.readStudyDeck();
          if (remembered === 'all' ? decks.some(deck => (deck.cardCount ?? 0) > 0) : decks.some(deck => deck.id === remembered && (deck.cardCount ?? 0) > 0)) {
            this.deckChoice = remembered;
            this.refreshTagOptions(() => this.startStudy());
            return;
          }

          this.refreshTagOptions();
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'A paklik betöltése'),
      });
  }

  loadNextCard(): void {
    if (!this.studying) {
      return;
    }

    this.speech.stop();
    const generation = ++this.loadGeneration;
    this.isLoadingCard = true;
    this.studyStatus = null;
    this.card = null;
    this.resetCardState();
    this.cardNotice = this.pendingCardNotice;
    this.pendingCardNotice = null;

    const params: Record<string, string | number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }
    params['focus'] = this.studyFocus;
    if (this.studyTag) {
      params['tag'] = this.studyTag;
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
          this.availableCards = response.availableCards;
          this.automaticAiCheck = response.automaticAiCheck;
          this.acceptHungarianParaphrase = response.acceptHungarianParaphrase;
          this.acceptPartialMeaningMatch = response.acceptPartialMeaningMatch;
          this.aiCheckAvailable = response.aiCheckAvailable;
          this.requireAppealReason = response.requireAppealReason;
          this.studyStatus = response.status;
          this.answerToken = response.answerToken;
          if (response.status !== 'ready' || !response.card || !response.answerToken) {
            this.studyStatus = response.status === 'dailyLimitReached' ? 'dailyLimitReached' : 'empty';
            return;
          }

          this.card = response.card;
          this.cardDirection = this.pickCardDirection(response.card);
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

  get isSuspendBusy(): boolean {
    return this.isSuspending || this.isSubmitting || this.isValidating || this.isAppealing;
  }

  toggleAutomaticAiCheck(): void {
    if (this.isTogglingAiCheck) {
      return;
    }

    this.errorMessage = null;
    this.isTogglingAiCheck = true;
    this.http.put<{ enabled: boolean }>(`${this.apiBaseUrl}/study/settings/automatic-ai-check`, { enabled: !this.automaticAiCheck })
      .pipe(finalize(() => this.isTogglingAiCheck = false))
      .subscribe({
        next: result => this.automaticAiCheck = result.enabled,
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'Az automatikus MI-ellenőrzés átkapcsolása'),
      });
  }

  suspendCurrentCard(mode: 'suspended' | 'buried'): void {
    const card = this.card;
    if (!card || this.isSuspendBusy) {
      return;
    }

    this.errorMessage = null;
    this.isSuspending = true;
    this.http.put(`${this.apiBaseUrl}/cards/${card.id}/suspension`, { mode })
      .pipe(finalize(() => this.isSuspending = false))
      .subscribe({
        next: () => {
          this.pendingCardNotice = mode === 'suspended'
            ? `A(z) „${card.term}” felfüggesztve. A pakli kártyalistájában kapcsolhatod vissza.`
            : `A(z) „${card.term}” holnapig elnapolva.`;
          this.loadNextCard();
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'A kártya felfüggesztése'),
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
    const isCorrect = this.isReversed
      ? this.normalizeTargetMeaning(trimmedAnswer) === this.normalizeTargetMeaning(this.card?.term ?? '')
      : this.matchesTargetMeaning(trimmedAnswer, stored);
    this.meaningCorrect = isCorrect;
    this.isMeaningRevealed = true;
    if (isCorrect) {
      this.meaningAwaitingGrade = false;
      this.submitResult(true, false);
      return;
    }

    if (this.automaticAiCheck && this.aiCheckAvailable) {
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
    const reversed = this.isReversed;
    const heldDefinition = reversed ? this.card.definition : this.card.targetMeanings ?? '';
    this.errorMessage = null;
    this.meaningAwaitingGrade = false;
    this.isValidating = true;
    this.http.post<ValidationResponse>(
      `${this.apiBaseUrl}/ai/validate`,
      {
        term: this.card.term,
        definition: this.card.targetMeanings ?? '',
        answer: trimmedAnswer,
        toEnglish: reversed,
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

          this.holdIncorrectAnswer(heldDefinition, null, true);
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration || this.card?.id !== cardId) {
            return;
          }

          this.meaningAwaitingGrade = true;
          if (error.status === 429) {
            this.aiCheckAvailable = false;
          }

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
          if (combined.length > 300) {
            this.errorMessage = 'A célnyelvi jelentés legfeljebb 300 karakter.';
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

  /** Kártyázás: a hiányzó magyar jelentést legenerálja és el is menti a kártyához. */
  generateFreeMeaning(): void {
    const card = this.freeCard;
    if (!card || this.isGeneratingFreeMeaning || card.targetMeanings?.trim()) {
      return;
    }

    const cardId = card.id;
    this.errorMessage = null;
    this.isGeneratingFreeMeaning = true;
    this.http.post<TargetMeaningResponse>(
      `${this.apiBaseUrl}/ai/generate/target-meaning`,
      { term: card.term, definition: card.definition },
    )
      .pipe(
        switchMap(response => {
          const meanings = (response.meanings ?? '').trim();
          if (!meanings) {
            return throwError(() => new Error('empty'));
          }

          if (meanings.length > 300) {
            return throwError(() => new Error('too-long'));
          }

          return this.http.put<SavedCard>(`${this.apiBaseUrl}/cards/${cardId}`, {
            term: card.term,
            definition: card.definition,
            example: card.example,
            targetMeanings: meanings,
          });
        }),
        finalize(() => this.isGeneratingFreeMeaning = false),
      )
      .subscribe({
        next: saved => {
          card.targetMeanings = saved.targetMeanings?.trim() ? saved.targetMeanings : null;
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.setHttpError(error, 'A célnyelvi jelentés generálása');
          } else {
            this.errorMessage = error instanceof Error && error.message === 'too-long'
              ? 'A generált jelentés hosszabb a megengedett 300 karakternél.'
              : 'Az MI nem adott használható magyar jelentést.';
          }
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

    if (meanings.length > 300) {
      this.errorMessage = 'A célnyelvi jelentés legfeljebb 300 karakter.';
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
          this.generatedExampleParts = this.highlightTerm(response.example, this.card?.term ?? '');
          this.generatedExampleReused = response.reused;
        },
        error: (error: HttpErrorResponse) => this.setHttpError(error, 'Az MI-példamondat generálása'),
      });
  }

  /** A példamondatot részekre bontja, a tanult szó (és ragozott alakjai) „hit” jelöléssel. */
  private highlightTerm(sentence: string, term: string): { text: string; hit: boolean }[] {
    const trimmed = term.trim();
    if (!trimmed) {
      return [{ text: sentence, hit: false }];
    }

    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stem = trimmed.length > 4 ? trimmed.replace(/[ey]$/i, '') : trimmed;
    for (const candidate of [trimmed, stem]) {
      const pattern = new RegExp(`(?<![\\p{L}])${escape(candidate).replace(/\s+/g, '\\s+')}\\p{L}*`, 'giu');
      const parts: { text: string; hit: boolean }[] = [];
      let last = 0;
      for (const match of sentence.matchAll(pattern)) {
        if (match.index > last) {
          parts.push({ text: sentence.slice(last, match.index), hit: false });
        }
        parts.push({ text: match[0], hit: true });
        last = match.index + match[0].length;
      }
      if (parts.length) {
        if (last < sentence.length) {
          parts.push({ text: sentence.slice(last), hit: false });
        }
        return parts;
      }
    }

    return [{ text: sentence, hit: false }];
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

    const accepted = this.targetMeaningPieces(stored);
    if (accepted.includes(normalizedAnswer)) {
      return true;
    }

    return this.acceptPartialMeaningMatch
      && this.targetMeaningPieces(answer).some(piece => accepted.includes(piece));
  }

  // A zárójeles megjegyzés nélküli alak is elfogadott: "jobb (irány)" → "jobb" és "jobb irany".
  private targetMeaningPieces(stored: string): string[] {
    const withoutNotes = stored.replace(/\([^)]*\)/g, '');
    const pieces = [stored, withoutNotes]
      .flatMap(text => text.split(/[,;\n\r]+/))
      .map(piece => this.normalizeTargetMeaning(piece))
      .filter(piece => piece.length > 0);
    return [...new Set(pieces)];
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
          this.sessionAnswered++;
          if (isCorrect) {
            this.sessionCorrect++;
          }
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
    this.cardDirection = 'en';
    this.answer = '';
    this.targetMeaningsDraft = '';
    this.generatedDefinition = null;
    this.generatedDefinitionFromCard = false;
    this.generatedDefinitionReused = false;
    this.generatedExample = null;
    this.generatedExampleParts = [];
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
    this.availableCards = 0;
    this.clearAnswerTimer();
  }

  flipFree(): void {
    if (!this.freeCard || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    this.speech.stop();
    this.freeFlipped = !this.freeFlipped;
  }

  markFree(knows: boolean): void {
    const card = this.freeCard;
    if (!card || this.mode !== 'free' || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    const generation = this.loadGeneration;
    const cardId = card.id;
    const previousKnows = card.knows;
    this.speech.stop();
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
          this.freeUndo = { cardId, index: this.freeIndex, previousKnows };
          this.freeSwipeX = 0;
          this.freeSwipeAnimating = false;
          if (this.freeCard?.id === cardId) {
            this.stepFree(1);
          }
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.loadGeneration) {
            return;
          }

          this.freeSwipeX = 0;
          this.freeSwipeAnimating = false;
          this.setHttpError(error, 'A jelölés mentése');
        },
      });
  }

  undoFree(): void {
    const undo = this.freeUndo;
    if (!undo || this.isSavingFreeMark || this.isClearingFreeMarks || this.mode !== 'free') {
      return;
    }

    const generation = this.loadGeneration;
    this.isSavingFreeMark = true;
    const request = undo.previousKnows === null
      ? this.http.delete<void>(`${this.apiBaseUrl}/free-study/cards/${undo.cardId}/mark`)
      : this.http.put<void>(`${this.apiBaseUrl}/free-study/cards/${undo.cardId}/mark`, { knows: undo.previousKnows });
    request.pipe(finalize(() => {
      if (generation === this.loadGeneration) {
        this.isSavingFreeMark = false;
      }
    })).subscribe({
      next: () => {
        if (generation !== this.loadGeneration || this.mode !== 'free') {
          return;
        }

        const restored = this.freeCards.find(item => item.id === undo.cardId);
        if (restored) {
          restored.knows = undo.previousKnows;
        }
        this.freeIndex = undo.index;
        this.freeFlipped = false;
        this.freeUndo = null;
      },
      error: (error: HttpErrorResponse) => {
        if (generation === this.loadGeneration) {
          this.setHttpError(error, 'A visszavonás');
        }
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
    const params: Record<string, string | number> = {};
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }
    params['focus'] = this.studyFocus;

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
    this.freePointerMoved = false;
  }

  onFreePointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.freePointerId || this.isSavingFreeMark || this.isClearingFreeMarks) {
      return;
    }

    const dx = event.clientX - this.freePointerStartX;
    const dy = event.clientY - this.freePointerStartY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      this.freePointerMoved = true;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      this.freeSwipeX = dx;
    }
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
      this.freeSwipeX = dx > 0 ? 540 : -540;
      this.freeSwipeAnimating = true;
      this.clearFreeSwipeTimeout();
      this.freeSwipeTimeout = setTimeout(() => {
        this.freeSwipeTimeout = null;
        this.markFree(dx > 0);
      }, 180);
      return;
    }

    if (absX >= 48 || absY >= 48) {
      this.freeLastTapAt = 0;
      this.freeSwipeX = 0;
      return;
    }

    this.freeSwipeX = 0;
    if (pointerType !== 'mouse' && !this.freePointerMoved) {
      const now = Date.now();
      if (now - this.freeLastTapAt <= 300) {
        this.freeLastTapAt = 0;
        this.flipFree();
      } else {
        this.freeLastTapAt = now;
      }
      return;
    }

    if (this.freePointerMoved) {
      return;
    }

    this.flipFree();
  }

  onFreePointerCancel(event: PointerEvent): void {
    if (event.pointerId === this.freePointerId) {
      this.freePointerId = null;
      this.freeSwipeX = 0;
    }
  }

  private clearFreeSwipeTimeout(): void {
    if (this.freeSwipeTimeout !== null) {
      clearTimeout(this.freeSwipeTimeout);
      this.freeSwipeTimeout = null;
    }
  }

  onAnswerEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey || keyboardEvent.isComposing) {
      return;
    }

    this.submitShortcut(event);
  }

  submitShortcut(event: Event): void {
    event.preventDefault();
    if (this.mode === 'meaning') {
      this.checkMeaningAnswer();
    } else if (this.mode === 'definition') {
      this.validateAnswer();
    } else if (this.mode === 'recognition') {
      this.checkRecognitionAnswer();
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
    this.clearFreeSwipeTimeout();
    this.freeListLoaded = false;
    this.freeCards = [];
    this.freeIndex = 0;
    this.freeFlipped = false;
    this.freeUndo = null;
    this.freeSwipeX = 0;
    this.freeSwipeAnimating = false;
    this.freeRestartConfirm = false;
    this.freePointerId = null;
    this.resetCardState();

    const params: Record<string, string | number> = {
      focus: this.studyFocus,
    };
    if (typeof this.deckChoice === 'number') {
      params['deckId'] = this.deckChoice;
    }
    if (this.studyTag) {
      params['tag'] = this.studyTag;
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
          this.freeUndo = null;
          this.freeSwipeX = 0;
          this.freeSwipeAnimating = false;
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
    this.clearFreeSwipeTimeout();
    this.freeCards = [];
    this.freeIndex = 0;
    this.freeFlipped = false;
    this.freeListLoaded = false;
    this.freeRestartConfirm = false;
    this.freeUndo = null;
    this.freeSwipeX = 0;
    this.freeSwipeAnimating = false;
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
    if (!this.studying || this.mode !== 'free' || !this.freeKeyboardEnabled || !this.freeCard || this.isSavingFreeMark || this.isClearingFreeMarks || this.isLoadingCard) {
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
      this.markFree(true);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.markFree(false);
    }
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
