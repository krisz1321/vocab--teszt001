import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { DecksComponent } from './decks.component';
import { StatsComponent } from './stats.component';
import { MuteButtonComponent } from './mute-button.component';
import { SpeechSettingsComponent } from './speech-settings.component';
import { StudyCardComponent } from './study-card.component';
import { ThemePickerComponent } from './theme-picker.component';

type AppView = 'study' | 'stats' | 'decks' | 'profile' | 'settings';
type AuthMode = 'login' | 'register';

interface AuthResponse {
  token: string;
  email: string;
}

interface ProblemDetails {
  title?: string;
}

interface ProfileResponse {
  email: string;
  displayName: string | null;
  hasAvatar: boolean;
  studyDayStreak: number;
}

interface StudySettings {
  dailyNewCardGoal: number;
  minimumAnswerSeconds: number;
  automaticAiCheck: boolean;
  acceptHungarianParaphrase: boolean;
  requireAppealReason: boolean;
  reuseSavedExamples: boolean;
  savedLevelPolicy: string;
  generateAlternateDefinitions: boolean;
  exampleLevel: string;
  aiModel: string;
  timeZoneId: string;
}

type SavedLevelChoice = 'all' | 'noHarder' | 'noEasier';

interface SavedLevelPolicyOption {
  id: SavedLevelChoice;
  label: string;
}

interface AiModelOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, StudyCardComponent, StatsComponent, DecksComponent, ThemePickerComponent, SpeechSettingsComponent, MuteButtonComponent],
  template: `
    @if (!session.isLoggedIn()) {
      <div class="auth-shell">
        <header class="auth-top">
          <span class="brand"><span class="brand-mark">V</span>VocabApp</span>
          <app-theme-picker />
        </header>
        <main class="container d-flex pb-5">
          <div class="auth-card">
            <h1 class="h3 mb-1">{{ mode === 'login' ? 'Üdv újra!' : 'Fiók létrehozása' }}</h1>
            <p class="text-body-secondary mb-4">MI-támogatott angol szókártyák, ismétléssel.</p>
            <div class="seg mb-4" role="group" aria-label="Belépés módja">
              <button type="button" [class.is-active]="mode === 'login'" (click)="setMode('login')">Bejelentkezés</button>
              <button type="button" [class.is-active]="mode === 'register'" (click)="setMode('register')">Regisztráció</button>
            </div>
            <form (ngSubmit)="submit()">
              <div class="mb-3">
                <label class="form-label" for="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  class="form-control form-control-lg"
                  autocomplete="username"
                  placeholder="nev@példa.hu"
                  [(ngModel)]="email"
                  [disabled]="isSubmitting">
              </div>
              <div class="mb-3">
                <label class="form-label" for="password">Jelszó</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  class="form-control form-control-lg"
                  [attr.autocomplete]="mode === 'register' ? 'new-password' : 'current-password'"
                  [placeholder]="mode === 'register' ? 'Legalább 8 karakter, betűvel és számmal' : ''"
                  [(ngModel)]="password"
                  [disabled]="isSubmitting">
              </div>
              @if (errorMessage) {
                <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
              }
              <button type="submit" class="btn btn-primary btn-lg w-100" [disabled]="isSubmitting">
                {{ mode === 'login' ? 'Bejelentkezés' : 'Regisztráció' }}
              </button>
            </form>
          </div>
        </main>
      </div>
    } @else {
      <div class="app-shell">
        <aside class="app-sidebar" aria-label="Fő navigáció">
          <span class="brand"><span class="brand-mark">V</span>VocabApp</span>
          @for (item of navItems; track item.id) {
            <button
              type="button"
              class="nav-item-btn"
              [class.is-active]="view === item.id"
              [attr.aria-current]="view === item.id ? 'page' : null"
              (click)="goTo(item.id)">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
              {{ item.label }}
            </button>
          }
          <span class="sidebar-spacer"></span>
          <div class="sidebar-tools">
            <app-mute-button [compact]="true" />
            <app-theme-picker class="from-sidebar" [compact]="true" />
            <button
              type="button"
              class="btn btn-outline-secondary p-2 d-inline-flex"
              [class.is-active]="view === 'settings'"
              (click)="goTo('settings')"
              aria-label="Beállítások"
              title="Beállítások">
              <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path [attr.d]="settingsIcon" /></svg>
            </button>
          </div>
          <div class="sidebar-user">
            @if (hasAvatar && avatarUrl) {
              <img [src]="avatarUrl" alt="" class="avatar-sm" (error)="hasAvatar = false">
            } @else {
              <span class="avatar-sm">{{ initial() }}</span>
            }
            <div class="who">
              <strong>{{ savedDisplayName || profileEmail || session.email() }}</strong>
              <span class="streak-chip" title="Napi sorozat" [attr.aria-label]="'Napi sorozat: ' + studyDayStreak">{{ studyDayStreak }} nap</span>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="logout()" aria-label="Kijelentkezés" title="Kijelentkezés">
              <svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path [attr.d]="logoutIcon" /></svg>
            </button>
          </div>
        </aside>

        <header class="app-topbar">
          <span class="brand"><span class="brand-mark">V</span>VocabApp</span>
          <div class="d-flex align-items-center gap-2">
            <span class="streak-chip" title="Napi sorozat" [attr.aria-label]="'Napi sorozat: ' + studyDayStreak">{{ studyDayStreak }} nap</span>
            <app-mute-button [compact]="true" />
            <app-theme-picker [compact]="true" />
            <button type="button" class="btn btn-outline-secondary p-2 d-inline-flex" [class.is-active]="view === 'settings'" (click)="goTo('settings')" aria-label="Beállítások" title="Beállítások">
              <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path [attr.d]="settingsIcon" /></svg>
            </button>
            <button type="button" class="btn p-0 border-0" (click)="openProfile()" aria-label="Profil">
              @if (hasAvatar && avatarUrl) {
                <img [src]="avatarUrl" alt="" class="avatar-sm" (error)="hasAvatar = false">
              } @else {
                <span class="avatar-sm">{{ initial() }}</span>
              }
            </button>
          </div>
        </header>

        <div class="app-content">
      @if (errorMessage) {
        <div class="container pt-3 page-wrap">
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        </div>
      }
      @if (view === 'study') {
        <app-study-card [initialDeckId]="studyDeckId" (openDecks)="goTo('decks')" />
      } @else if (view === 'stats') {
        <app-stats />
      } @else if (view === 'decks') {
        <app-decks (studyDeck)="studyDeck($event)" />
      } @else if (view === 'settings') {
        <main class="container py-4 page-wrap">
          <h1 class="h3 mb-4">Beállítások</h1>
          @if (profileError) {
            <div class="alert alert-danger" role="alert">{{ profileError }}</div>
          }
          @if (profileMessage) {
            <div class="alert alert-success" role="alert">{{ profileMessage }}</div>
          }
          <section class="mb-4">
            <h2 class="h5 mb-3">Megjelenés</h2>
            <p class="text-body-secondary">Válassz kinézetet, és hogy világos vagy sötét változatban használod. A beállítás ezen az eszközön megmarad.</p>
            <app-theme-picker [inline]="true" />
          </section>
          <section class="mb-4">
            <h2 class="h5 mb-3">Hang és felolvasás</h2>
            <p class="text-body-secondary">A tanulás közben a kártyák angol és magyar szövegei felolvashatók a hangszóró gombbal. Itt állíthatod be, mit és milyen hangon olvasson fel.</p>
            <app-speech-settings />
          </section>
          <form class="mb-4" (ngSubmit)="saveStudySettings()">
            <h2 class="h5 mb-3">Tanulási beállítások</h2>
            <div class="mb-3">
              <label class="form-label" for="dailyNewCardGoal">Napi új szavak</label>
              <input
                id="dailyNewCardGoal"
                name="dailyNewCardGoal"
                type="number"
                class="form-control"
                min="0"
                max="100"
                step="1"
                [(ngModel)]="dailyNewCardGoal"
                [disabled]="isSavingStudySettings">
              <div class="form-text">Hány még soha meg nem válaszolt szót kaphatsz egy napon (0–100). Az esedékes ismétlések ettől függetlenül jönnek.</div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="minimumAnswerSeconds">Minimum idő másodpercben</label>
              <input
                id="minimumAnswerSeconds"
                name="minimumAnswerSeconds"
                type="number"
                class="form-control"
                min="0"
                max="120"
                step="1"
                [(ngModel)]="minimumAnswerSeconds"
                [disabled]="isSavingStudySettings">
              <div class="form-text">Ennyi másodpercig kell a kártyának látszania, mielőtt a válasz menthető (0–120).</div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="exampleLevel">Mondatszint</label>
              <select
                id="exampleLevel"
                name="exampleLevel"
                class="form-select"
                [(ngModel)]="exampleLevel"
                [disabled]="isSavingStudySettings">
                @for (level of exampleLevels; track level) {
                  <option [value]="level">{{ level }}</option>
                }
              </select>
              <div class="form-text">Ez a fiók szintje, a pakli saját szintje felülírja.</div>
            </div>
            <details class="advanced-settings mb-4">
              <summary class="fw-semibold">Haladó beállítások (MI és példamondatok)</summary>
              <div class="pt-3">
            <div class="mb-3">
              <label class="form-label" for="aiModel">MI-modell</label>
              <select
                id="aiModel"
                name="aiModel"
                class="form-select"
                [(ngModel)]="aiModel"
                [disabled]="isSavingStudySettings">
                @for (model of aiModels; track model.id) {
                  <option [value]="model.id">{{ model.label }}</option>
                }
              </select>
              <div class="form-text">Minden modell a meglévő OpenRouter-kulcsot használja.</div>
            </div>
            <div class="form-check mb-3">
              <input
                id="automaticAiCheck"
                name="automaticAiCheck"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="automaticAiCheck"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="automaticAiCheck">Automatikus MI-ellenőrzés</label>
              <div class="form-text">Ha a beírt jelentés nem egyezik a mentett alakkal, az MI automatikusan kiértékeli. Kikapcsolva ez csak a hibás válasznál, kézzel indítható.</div>
            </div>
            <div class="form-check mb-3">
              <input
                id="acceptHungarianParaphrase"
                name="acceptHungarianParaphrase"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="acceptHungarianParaphrase"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="acceptHungarianParaphrase">Magyar körülírás elfogadása</label>
              <div class="form-text">Bekapcsolva a helyes magyar mondat is elfogadható, és az MI angolul visszaírja. Kikapcsolva a körülírást angolul kell megadni.</div>
            </div>
            <div class="form-check mb-3">
              <input
                id="requireAppealReason"
                name="requireAppealReason"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="requireAppealReason"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="requireAppealReason">A hibás válasz megvédéséhez indoklás kell.</label>
              <div class="form-text">Bekapcsolva a Mégis helyes volt gomb indoklást kér, és az MI dönt. Kikapcsolva a Márpedig ez jó válasz volt gomb indoklás nélkül helyesként ment.</div>
            </div>
            <div class="form-check mb-3">
              <input
                id="reuseSavedExamples"
                name="reuseSavedExamples"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="reuseSavedExamples"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="reuseSavedExamples">Mentett példamondatok újrafelhasználása</label>
              <div class="form-text">Bekapcsolva, ha már van mentett mondat vagy definíció, kettőből egyszer egy korábbit ad vissza, API-hívás nélkül. Kikapcsolva minden kérés új mondatot vagy definíciót kér.</div>
            </div>
            <div class="mb-3">
              <div class="form-check">
                <input
                  id="allowOtherSavedLevels"
                  name="allowOtherSavedLevels"
                  type="checkbox"
                  class="form-check-input"
                  [(ngModel)]="allowOtherSavedLevels"
                  [disabled]="isSavingStudySettings">
                <label class="form-check-label" for="allowOtherSavedLevels">Eltérő szintű mentett válaszok is jöhetnek.</label>
              </div>
              @if (allowOtherSavedLevels) {
                <select
                  id="savedLevelPolicy"
                  name="savedLevelPolicy"
                  class="form-select mt-2"
                  [(ngModel)]="savedLevelPolicy"
                  [disabled]="isSavingStudySettings">
                  @for (policy of savedLevelPolicies; track policy.id) {
                    <option [value]="policy.id">{{ policy.label }}</option>
                  }
                </select>
              }
              <div class="form-text">Ez csak a már elmentett példamondatokra és definíciókra vonatkozik. Az új MI-kérés továbbra is a pakli vagy a fiók szintjét kéri, és azon a szinten kerül mentésre.</div>
            </div>
            <div class="form-check mb-3">
              <input
                id="generateAlternateDefinitions"
                name="generateAlternateDefinitions"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="generateAlternateDefinitions"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="generateAlternateDefinitions">Váltakozó definíció</label>
              <div class="form-text">Bekapcsolva új angol definíció készül a mondatszint szerint. Kikapcsolva mindig a kártyán tárolt definíció jelenik meg.</div>
            </div>
              </div>
            </details>
            <button type="submit" class="btn btn-primary" [disabled]="isSavingStudySettings">Mentés</button>
          </form>
        </main>
      } @else {
        <main class="container py-4 page-wrap">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h1 class="h3 mb-0">Profil</h1>
            <button type="button" class="btn btn-outline-secondary" (click)="logout()">Kijelentkezés</button>
          </div>
          @if (profileError) {
            <div class="alert alert-danger" role="alert">{{ profileError }}</div>
          }
          @if (profileMessage) {
            <div class="alert alert-success" role="alert">{{ profileMessage }}</div>
          }
          <p class="mb-4">
            <span class="text-secondary d-block">Email</span>
            {{ profileEmail || session.email() }}
          </p>
          <div class="d-flex align-items-center gap-3 mb-4">
            @if (hasAvatar && avatarUrl) {
              <img
                [src]="avatarUrl"
                alt=""
                class="rounded-circle border"
                style="width: 6rem; height: 6rem; object-fit: cover;"
                (error)="hasAvatar = false">
            } @else {
              <span
                class="rounded-circle border d-inline-flex align-items-center justify-content-center bg-secondary text-white fs-3"
                style="width: 6rem; height: 6rem;">
                {{ initial() }}
              </span>
            }
            <span
              class="rounded-circle border d-inline-flex flex-column align-items-center justify-content-center flex-shrink-0"
              style="width: 6rem; height: 6rem;"
              title="Napi sorozat"
              [attr.aria-label]="'Napi sorozat: ' + studyDayStreak">
              <span class="fs-3 fw-semibold lh-1">{{ studyDayStreak }}</span>
              <span class="small text-secondary">nap</span>
            </span>
            <div>
              <label class="form-label" for="avatarFile">Profilkép</label>
              <input
                id="avatarFile"
                type="file"
                class="form-control"
                accept="image/jpeg,image/png,image/webp"
                (change)="uploadAvatar($event)"
                [disabled]="isUploadingAvatar">
              <button
                type="button"
                class="btn btn-outline-danger mt-2"
                (click)="deleteAvatar()"
                [disabled]="isDeletingAvatar">
                Kép törlése
              </button>
            </div>
          </div>
          <form class="mb-4" (ngSubmit)="saveDisplayName()">
            <label class="form-label" for="displayName">Megjelenített név</label>
            <div class="input-group">
              <input
                id="displayName"
                name="displayName"
                type="text"
                class="form-control"
                [(ngModel)]="displayName"
                [disabled]="isSavingName">
              <button type="submit" class="btn btn-primary" [disabled]="isSavingName">Mentés</button>
            </div>
          </form>
          <form (ngSubmit)="changePassword()">
            <h2 class="h5 mb-3">Jelszócsere</h2>
            <div class="mb-3">
              <label class="form-label" for="currentPassword">Jelenlegi jelszó</label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                class="form-control"
                autocomplete="current-password"
                [(ngModel)]="currentPassword"
                [disabled]="isChangingPassword">
            </div>
            <div class="mb-3">
              <label class="form-label" for="newPassword">Új jelszó</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                class="form-control"
                autocomplete="new-password"
                [(ngModel)]="newPassword"
                [disabled]="isChangingPassword">
              <div class="form-text">Legalább 8 karakter, legalább egy betűvel és egy számmal.</div>
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="isChangingPassword">Jelszócsere</button>
          </form>
          <section class="mt-4 pt-4 border-top">
            <h2 class="h5 mb-2">Fiók törlése</h2>
            <p class="mb-3">A fiók, a profilkép, a saját paklik és a tanulási adatok véglegesen törlődnek. Ez a művelet nem vonható vissza.</p>
            <label class="form-label" for="deleteAccountSlide">Húzd jobbra a csúszkát a törlés feloldásához</label>
            <input
              id="deleteAccountSlide"
              type="range"
              class="form-range"
              min="0"
              max="100"
              step="1"
              [value]="deleteSlide"
              (input)="onDeleteSlide($event)"
              [disabled]="isDeletingAccount">
            @if (deleteSlide >= 100) {
              <button
                type="button"
                class="btn btn-outline-danger"
                (click)="deleteAccount()"
                [disabled]="isDeletingAccount">
                Fiók törlése
              </button>
            }
          </section>
        </main>
      }
        </div>
        <nav class="app-tabbar" aria-label="Fő navigáció">
          @for (item of navItems; track item.id) {
            <button
              type="button"
              class="tab-btn"
              [class.is-active]="view === item.id"
              [attr.aria-current]="view === item.id ? 'page' : null"
              (click)="goTo(item.id)">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
              {{ item.label }}
            </button>
          }
        </nav>
      </div>
    }
  `,
  styles: [`
    .advanced-settings { border: 1px solid var(--app-border); border-radius: .75rem; padding: .75rem 1rem; }
    .advanced-settings > summary { cursor: pointer; }
    .advanced-settings[open] > summary { margin-bottom: .25rem; }
  `],
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly session = inject(AuthSessionService);

  view: AppView = 'study';
  readonly navItems: { id: AppView; label: string; icon: string }[] = [
    { id: 'study', label: 'Tanulás', icon: 'M3 7l9-4 9 4-9 4-9-4Zm0 5l9 4 9-4M3 17l9 4 9-4' },
    { id: 'stats', label: 'Statisztika', icon: 'M5 20V10M12 20V4M19 20v-7' },
    { id: 'decks', label: 'Paklik', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' },
    { id: 'profile', label: 'Profil', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0' },
  ];
  readonly settingsIcon = 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6';
  readonly logoutIcon = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9';
  mode: AuthMode = 'login';
  email = '';
  password = '';
  errorMessage: string | null = null;
  isSubmitting = false;
  isDeletingAccount = false;
  deleteSlide = 0;
  profileEmail: string | null = null;
  displayName = '';
  savedDisplayName = '';
  hasAvatar = false;
  avatarUrl: string | null = null;
  studyDayStreak = 0;
  profileError: string | null = null;
  profileMessage: string | null = null;
  currentPassword = '';
  newPassword = '';
  isSavingName = false;
  isUploadingAvatar = false;
  isDeletingAvatar = false;
  isChangingPassword = false;
  dailyNewCardGoal = 20;
  minimumAnswerSeconds = 0;
  automaticAiCheck = false;
  acceptHungarianParaphrase = false;
  requireAppealReason = true;
  reuseSavedExamples = true;
  allowOtherSavedLevels = false;
  readonly savedLevelPolicies: SavedLevelPolicyOption[] = [
    { id: 'all', label: 'Minden mentett válasz' },
    { id: 'noHarder', label: 'A nehezebbeket nem' },
    { id: 'noEasier', label: 'A könnyebbeket nem' },
  ];
  savedLevelPolicy: SavedLevelChoice = 'all';
  generateAlternateDefinitions = true;
  readonly exampleLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  exampleLevel = 'B1';
  readonly aiModels: AiModelOption[] = [
    { id: 'google/gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  ];
  aiModel = 'google/gemini-3.6-flash';
  timeZoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest';
  isSavingStudySettings = false;
  private userId: number | null = null;

  ngOnInit(): void {
    if (this.session.isLoggedIn()) {
      this.loadProfile();
    }
  }

  setMode(mode: AuthMode): void {
    this.mode = mode;
    this.errorMessage = null;
  }

  submit(): void {
    const email = this.email.trim();
    const password = this.password;
    if (!email || !password) {
      this.errorMessage = 'Az email és a jelszó megadása kötelező.';
      return;
    }

    if (this.mode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Az email cím formátuma érvénytelen.';
      return;
    }

    if (this.mode === 'register' && password.length < 8) {
      this.errorMessage = 'A jelszónak legalább 8 karakter hosszúnak kell lennie.';
      return;
    }

    this.errorMessage = null;
    this.isSubmitting = true;
    const url = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    this.http.post<AuthResponse>(url, { email, password }).pipe(
      finalize(() => {
        this.isSubmitting = false;
      }),
    ).subscribe({
      next: (response) => {
        this.password = '';
        this.session.setSession(response.token, response.email);
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error);
      },
    });
  }

  logout(): void {
    this.password = '';
    this.errorMessage = null;
    this.clearProfile();
    this.session.clear();
  }

  studyDeckId: number | null = null;

  studyDeck(deckId: number): void {
    this.studyDeckId = deckId;
    this.view = 'study';
  }

  goTo(view: AppView): void {
    this.studyDeckId = null;
    if (view === 'profile') {
      this.openProfile();
      return;
    }

    if (view === 'settings') {
      this.openSettings();
      return;
    }

    this.view = view;
  }

  openProfile(): void {
    this.view = 'profile';
    this.profileError = null;
    this.profileMessage = null;
    this.deleteSlide = 0;
    this.loadProfile();
  }

  openSettings(): void {
    this.view = 'settings';
    this.profileError = null;
    this.profileMessage = null;
    this.loadStudySettings();
  }

  onDeleteSlide(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.deleteSlide = Number.isFinite(value) ? value : 0;
  }

  initial(): string {
    const source = this.savedDisplayName.trim() || this.profileEmail || this.session.email() || '?';
    return source.charAt(0).toLocaleUpperCase('hu-HU');
  }

  saveDisplayName(): void {
    this.profileError = null;
    this.profileMessage = null;
    this.isSavingName = true;
    this.http.put('/api/auth/profile', { displayName: this.displayName }).pipe(
      finalize(() => {
        this.isSavingName = false;
      }),
    ).subscribe({
      next: () => {
        this.profileMessage = 'A megjelenített név mentve.';
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A név mentése sikertelen.');
      },
    });
  }

  uploadAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    const body = new FormData();
    body.append('file', file);
    this.profileError = null;
    this.profileMessage = null;
    this.isUploadingAvatar = true;
    this.http.put('/api/auth/avatar', body).pipe(
      finalize(() => {
        this.isUploadingAvatar = false;
      }),
    ).subscribe({
      next: () => {
        this.profileMessage = 'A profilkép feltöltve.';
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A kép feltöltése sikertelen.');
      },
    });
  }

  deleteAvatar(): void {
    this.profileError = null;
    this.profileMessage = null;
    this.isDeletingAvatar = true;
    this.http.delete('/api/auth/avatar').pipe(
      finalize(() => {
        this.isDeletingAvatar = false;
      }),
    ).subscribe({
      next: () => {
        this.profileMessage = 'A profilkép törölve.';
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A kép törlése sikertelen.');
      },
    });
  }

  saveStudySettings(): void {
    this.profileError = null;
    this.profileMessage = null;
    const goal = Number(this.dailyNewCardGoal);
    const seconds = Number(this.minimumAnswerSeconds);
    if (!Number.isInteger(goal) || goal < 0 || goal > 100
      || !Number.isInteger(seconds) || seconds < 0 || seconds > 120) {
      this.profileError = 'A napi új szavak 0 és 100, a minimum idő 0 és 120 másodperc között lehet.';
      return;
    }

    if (!this.exampleLevels.includes(this.exampleLevel)) {
      this.profileError = 'A mondatszint A1, A2, B1, B2, C1 vagy C2 lehet.';
      return;
    }

    if (!this.aiModels.some((model) => model.id === this.aiModel)) {
      this.profileError = 'Az MI-modell a felsorolt négy közül választható.';
      return;
    }

    const savedLevelPolicy = this.allowOtherSavedLevels ? this.savedLevelPolicy : 'exact';
    if (this.allowOtherSavedLevels && !this.savedLevelPolicies.some((policy) => policy.id === savedLevelPolicy)) {
      this.profileError = 'Az eltérő szintű mentett válaszok csak a felsorolt három lehetőség egyike lehet.';
      return;
    }

    this.isSavingStudySettings = true;
    this.http.put<StudySettings>('/api/study/settings', {
      dailyNewCardGoal: goal,
      minimumAnswerSeconds: seconds,
      automaticAiCheck: this.automaticAiCheck,
      acceptHungarianParaphrase: this.acceptHungarianParaphrase,
      requireAppealReason: this.requireAppealReason,
      reuseSavedExamples: this.reuseSavedExamples,
      savedLevelPolicy,
      generateAlternateDefinitions: this.generateAlternateDefinitions,
      exampleLevel: this.exampleLevel,
      aiModel: this.aiModel,
      timeZoneId: this.timeZoneId,
    }).pipe(
      finalize(() => {
        this.isSavingStudySettings = false;
      }),
    ).subscribe({
      next: (settings) => {
        this.dailyNewCardGoal = settings.dailyNewCardGoal;
        this.minimumAnswerSeconds = settings.minimumAnswerSeconds;
        this.automaticAiCheck = settings.automaticAiCheck;
        this.acceptHungarianParaphrase = settings.acceptHungarianParaphrase;
        this.requireAppealReason = settings.requireAppealReason;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.applySavedLevelPolicy(settings.savedLevelPolicy);
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.exampleLevel = settings.exampleLevel;
        this.aiModel = settings.aiModel;
        this.timeZoneId = settings.timeZoneId || this.timeZoneId;
        this.profileMessage = 'A tanulási beállítások mentve.';
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A tanulási beállítások mentése sikertelen.');
      },
    });
  }

  changePassword(): void {
    this.profileError = null;
    this.profileMessage = null;
    this.isChangingPassword = true;
    this.http.put('/api/auth/password', {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    }).pipe(
      finalize(() => {
        this.isChangingPassword = false;
      }),
    ).subscribe({
      next: () => {
        this.currentPassword = '';
        this.newPassword = '';
        this.profileMessage = 'A jelszó megváltozott.';
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A jelszócsere sikertelen.');
      },
    });
  }

  deleteAccount(): void {
    const confirmed = confirm(
      'Biztosan törlöd a fiókodat?\n\nA fiók, a profilkép, a saját paklik és a tanulási adatok véglegesen törlődnek. Ez a művelet nem vonható vissza. A mások által elmentett másolatok megmaradnak.',
    );
    if (!confirmed) {
      this.deleteSlide = 0;
      return;
    }

    this.profileError = null;
    this.profileMessage = null;
    this.isDeletingAccount = true;
    this.http.delete('/api/auth/account').pipe(
      finalize(() => {
        this.isDeletingAccount = false;
      }),
    ).subscribe({
      next: () => {
        this.password = '';
        this.clearProfile();
        this.session.clear();
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A fiók törlése sikertelen.');
      },
    });
  }

  private applySavedLevelPolicy(policy: string): void {
    if (policy === 'all' || policy === 'noHarder' || policy === 'noEasier') {
      this.allowOtherSavedLevels = true;
      this.savedLevelPolicy = policy;
      return;
    }

    this.allowOtherSavedLevels = false;
    this.savedLevelPolicy = 'all';
  }

  private loadStudySettings(): void {
    this.http.get<StudySettings>('/api/study/settings').subscribe({
      next: (settings) => {
        this.dailyNewCardGoal = settings.dailyNewCardGoal;
        this.minimumAnswerSeconds = settings.minimumAnswerSeconds;
        this.automaticAiCheck = settings.automaticAiCheck;
        this.acceptHungarianParaphrase = settings.acceptHungarianParaphrase;
        this.requireAppealReason = settings.requireAppealReason;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.applySavedLevelPolicy(settings.savedLevelPolicy);
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.exampleLevel = settings.exampleLevel;
        this.aiModel = settings.aiModel;
        this.timeZoneId = settings.timeZoneId || this.timeZoneId;
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A tanulási beállítások betöltése sikertelen.');
      },
    });
  }

  private loadProfile(): void {
    this.userId = this.readUserId();
    this.http.get<ProfileResponse>('/api/auth/profile').subscribe({
      next: (profile) => {
        this.profileEmail = profile.email;
        this.displayName = profile.displayName ?? '';
        this.savedDisplayName = this.displayName;
        this.hasAvatar = profile.hasAvatar;
        this.studyDayStreak = profile.studyDayStreak;
        this.avatarUrl = profile.hasAvatar && this.userId
          ? `/api/auth/avatar/${this.userId}?v=${Date.now()}`
          : null;
      },
      error: () => {
        this.hasAvatar = false;
        this.avatarUrl = null;
        this.studyDayStreak = 0;
      },
    });
  }

  private clearProfile(): void {
    this.view = 'study';
    this.profileEmail = null;
    this.displayName = '';
    this.savedDisplayName = '';
    this.hasAvatar = false;
    this.avatarUrl = null;
    this.studyDayStreak = 0;
    this.profileError = null;
    this.profileMessage = null;
    this.currentPassword = '';
    this.newPassword = '';
    this.deleteSlide = 0;
    this.dailyNewCardGoal = 20;
    this.minimumAnswerSeconds = 0;
    this.userId = null;
  }

  private readUserId(): number | null {
    const token = this.session.token();
    const segment = token?.split('.')[1];
    if (!segment) {
      return null;
    }

    try {
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = JSON.parse(atob(padded)) as { sub?: string };
      const id = Number(payload.sub);
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private readProblem(error: HttpErrorResponse, fallback: string): string {
    const title = (error.error as ProblemDetails | null)?.title;
    return typeof title === 'string' && title.trim() ? title : fallback;
  }

  private readError(error: HttpErrorResponse): string {
    if (error.status === 401) {
      return 'Hibás email vagy jelszó.';
    }

    const title = (error.error as ProblemDetails | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      return title;
    }

    return 'A kérés sikertelen. Kérlek, próbáld újra.';
  }
}
