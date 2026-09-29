import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { DecksComponent } from './decks.component';
import { StatsComponent } from './stats.component';
import { StudyCardComponent } from './study-card.component';

type AppView = 'study' | 'stats' | 'decks' | 'profile';
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
}

interface StudySettings {
  dailyNewCardGoal: number;
  minimumAnswerSeconds: number;
  automaticAiCheck: boolean;
  reuseSavedExamples: boolean;
  generateAlternateDefinitions: boolean;
  exampleLevel: string;
  aiModel: string;
}

interface AiModelOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, StudyCardComponent, StatsComponent, DecksComponent],
  template: `
    @if (!session.isLoggedIn()) {
      <nav class="navbar bg-body-tertiary border-bottom">
        <div class="container" style="max-width: 760px;">
          <span class="navbar-brand mb-0 h1">VocabApp</span>
        </div>
      </nav>
      <main class="container py-5">
        <div class="mx-auto" style="max-width: 420px;">
          <h1 class="h3 mb-3">Belépés</h1>
          <div class="btn-group mb-4" role="group" aria-label="Belépés módja">
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'login'"
              [class.btn-outline-primary]="mode !== 'login'"
              (click)="setMode('login')">
              Bejelentkezés
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="mode === 'register'"
              [class.btn-outline-primary]="mode !== 'register'"
              (click)="setMode('register')">
              Regisztráció
            </button>
          </div>
          <form (ngSubmit)="submit()">
            <div class="mb-3">
              <label class="form-label" for="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                class="form-control"
                autocomplete="username"
                [(ngModel)]="email"
                [disabled]="isSubmitting">
            </div>
            <div class="mb-3">
              <label class="form-label" for="password">Jelszó</label>
              <input
                id="password"
                name="password"
                type="password"
                class="form-control"
                [attr.autocomplete]="mode === 'register' ? 'new-password' : 'current-password'"
                [(ngModel)]="password"
                [disabled]="isSubmitting">
            </div>
            @if (errorMessage) {
              <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
            }
            <button type="submit" class="btn btn-primary" [disabled]="isSubmitting">
              {{ mode === 'login' ? 'Bejelentkezés' : 'Regisztráció' }}
            </button>
          </form>
        </div>
      </main>
    } @else {
      <nav class="navbar bg-body-tertiary border-bottom">
        <div class="container" style="max-width: 760px;">
          <span class="navbar-brand mb-0 h1">VocabApp</span>
          <div class="d-flex align-items-center gap-3">
            <div class="btn-group" role="group" aria-label="Nézet">
              <button
                type="button"
                class="btn"
                [class.btn-primary]="view === 'study'"
                [class.btn-outline-primary]="view !== 'study'"
                (click)="view = 'study'">
                Tanulás
              </button>
              <button
                type="button"
                class="btn"
                [class.btn-primary]="view === 'stats'"
                [class.btn-outline-primary]="view !== 'stats'"
                (click)="view = 'stats'">
                Statisztika
              </button>
              <button
                type="button"
                class="btn"
                [class.btn-primary]="view === 'decks'"
                [class.btn-outline-primary]="view !== 'decks'"
                (click)="view = 'decks'">
                Paklik
              </button>
              <button
                type="button"
                class="btn"
                [class.btn-primary]="view === 'profile'"
                [class.btn-outline-primary]="view !== 'profile'"
                (click)="openProfile()">
                Profil
              </button>
            </div>
            @if (hasAvatar && avatarUrl) {
              <img
                [src]="avatarUrl"
                alt=""
                class="rounded-circle border"
                style="width: 2rem; height: 2rem; object-fit: cover;"
                (error)="hasAvatar = false">
            } @else {
              <span
                class="rounded-circle border d-inline-flex align-items-center justify-content-center bg-secondary text-white"
                style="width: 2rem; height: 2rem;">
                {{ initial() }}
              </span>
            }
            <button type="button" class="btn btn-outline-secondary" (click)="logout()">
              Kijelentkezés
            </button>
            <button
              type="button"
              class="btn btn-outline-danger"
              (click)="deleteAccount()"
              [disabled]="isDeletingAccount">
              Fiók törlése
            </button>
          </div>
        </div>
      </nav>
      @if (errorMessage) {
        <div class="container pt-3" style="max-width: 760px;">
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        </div>
      }
      @if (view === 'study') {
        <app-study-card />
      } @else if (view === 'stats') {
        <app-stats />
      } @else if (view === 'decks') {
        <app-decks />
      } @else {
        <main class="container py-4" style="max-width: 760px;">
          <h1 class="h3 mb-4">Profil</h1>
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
                id="reuseSavedExamples"
                name="reuseSavedExamples"
                type="checkbox"
                class="form-check-input"
                [(ngModel)]="reuseSavedExamples"
                [disabled]="isSavingStudySettings">
              <label class="form-check-label" for="reuseSavedExamples">Mentett példamondatok újrafelhasználása</label>
              <div class="form-text">Bekapcsolva, ha már van mentett mondat vagy definíció, kettőből egyszer egy korábbit ad vissza, API-hívás nélkül. Kikapcsolva minden kérés új mondatot vagy definíciót kér.</div>
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
            <button type="submit" class="btn btn-primary" [disabled]="isSavingStudySettings">Mentés</button>
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
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="isChangingPassword">Jelszócsere</button>
          </form>
        </main>
      }
    }
  `,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly session = inject(AuthSessionService);

  view: AppView = 'study';
  mode: AuthMode = 'login';
  email = '';
  password = '';
  errorMessage: string | null = null;
  isSubmitting = false;
  isDeletingAccount = false;
  profileEmail: string | null = null;
  displayName = '';
  savedDisplayName = '';
  hasAvatar = false;
  avatarUrl: string | null = null;
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
  reuseSavedExamples = true;
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

  openProfile(): void {
    this.view = 'profile';
    this.profileError = null;
    this.profileMessage = null;
    this.loadProfile();
    this.loadStudySettings();
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

    this.isSavingStudySettings = true;
    this.http.put<StudySettings>('/api/study/settings', {
      dailyNewCardGoal: goal,
      minimumAnswerSeconds: seconds,
      automaticAiCheck: this.automaticAiCheck,
      reuseSavedExamples: this.reuseSavedExamples,
      generateAlternateDefinitions: this.generateAlternateDefinitions,
      exampleLevel: this.exampleLevel,
      aiModel: this.aiModel,
    }).pipe(
      finalize(() => {
        this.isSavingStudySettings = false;
      }),
    ).subscribe({
      next: (settings) => {
        this.dailyNewCardGoal = settings.dailyNewCardGoal;
        this.minimumAnswerSeconds = settings.minimumAnswerSeconds;
        this.automaticAiCheck = settings.automaticAiCheck;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.exampleLevel = settings.exampleLevel;
        this.aiModel = settings.aiModel;
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
      'A saját fiókod és paklijaid végleg törlődnek. A mások által elmentett másolatok megmaradnak. Folytatod?',
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage = null;
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
        const title = (error.error as ProblemDetails | null)?.title;
        this.errorMessage = typeof title === 'string' && title.trim()
          ? title
          : 'A fiók törlése sikertelen.';
      },
    });
  }

  private loadStudySettings(): void {
    this.http.get<StudySettings>('/api/study/settings').subscribe({
      next: (settings) => {
        this.dailyNewCardGoal = settings.dailyNewCardGoal;
        this.minimumAnswerSeconds = settings.minimumAnswerSeconds;
        this.automaticAiCheck = settings.automaticAiCheck;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.exampleLevel = settings.exampleLevel;
        this.aiModel = settings.aiModel;
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
        this.avatarUrl = profile.hasAvatar && this.userId
          ? `/api/auth/avatar/${this.userId}?v=${Date.now()}`
          : null;
      },
      error: () => {
        this.hasAvatar = false;
        this.avatarUrl = null;
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
    this.profileError = null;
    this.profileMessage = null;
    this.currentPassword = '';
    this.newPassword = '';
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
