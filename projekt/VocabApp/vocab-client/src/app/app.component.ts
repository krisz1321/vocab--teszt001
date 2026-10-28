import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, HostListener, inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { DecksComponent } from './decks.component';
import { StatsComponent } from './stats.component';
import { MuteButtonComponent } from './mute-button.component';
import { SpeechSettingsComponent } from './speech-settings.component';
import { StudyCardComponent } from './study-card.component';
import { GrammarComponent } from './grammar.component';
import { CompositionComponent } from './composition.component';
import { IconComponent, IconName } from './icon.component';
import { ThemeService } from './theme.service';

type AppView = 'study' | 'grammar' | 'composition' | 'stats' | 'decks' | 'profile' | 'settings';
type AuthMode = 'login' | 'register';

interface NavItem {
  id: AppView;
  label: string;
  icon: IconName;
}

interface AuthResponse {
  token: string;
  email: string;
}

interface ProblemDetails {
  title?: string;
}

interface ProfileResponse {
  email: string;
  username: string;
  displayName: string | null;
  hasAvatar: boolean;
  studyDayStreak: number;
}

interface StudySettings {
  dailyNewCardGoal: number;
  minimumAnswerSeconds: number;
  automaticAiCheck: boolean;
  acceptHungarianParaphrase: boolean;
  acceptPartialMeaningMatch: boolean;
  acceptEnglishSynonyms: boolean;
  repeatMistakes: boolean;
  requireAppealReason: boolean;
  reuseSavedExamples: boolean;
  savedLevelPolicy: string;
  generateAlternateDefinitions: boolean;
  leechThreshold: number;
  exampleLevel: string;
  aiModel: string;
  timeZoneId: string;
  aiFillBatchSize: number;
  aiFillDailyLimit: number;
  aiFillRemainingToday: number;
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
  imports: [CommonModule, FormsModule, StudyCardComponent, GrammarComponent, CompositionComponent, StatsComponent, DecksComponent, SpeechSettingsComponent, MuteButtonComponent, IconComponent],
  template: `
    @if (!session.isLoggedIn()) {
      <div class="auth">
        <aside class="auth-hero">
          <span class="brand"><span class="brand-mark">W</span>WordTárs</span>
          <div class="hero-copy">
            <h1 class="hero-title">Szavak, amik megmaradnak.</h1>
            <p>Angol szókártyák MI-segítséggel. Az ismétlés akkor jön, amikor kezdenéd elfelejteni a szót.</p>
          </div>
          <div class="hero-card" aria-hidden="true">
            <span class="eyebrow">Mai kártya</span>
            <span class="term"><span class="term-mark">eager</span></span>
            <span class="ipa">/ˈiːɡə/ · melléknév</span>
            <span class="hero-hu">lelkes, buzgó</span>
          </div>
          <ul class="hero-list">
            <li><app-icon name="check" />SM-2 alapú ismétlés, napi célokkal</li>
            <li><app-icon name="check" />Az MI ellenőrzi a válaszod, és elmagyarázza a hibát</li>
            <li><app-icon name="check" />Nyelvtan és mondatalkotás a saját szavaiddal</li>
          </ul>
        </aside>
        <main class="auth-main">
          <div class="auth-card">
            <div class="auth-brand-m"><span class="brand"><span class="brand-mark">W</span>WordTárs</span></div>
            <div class="ph-text">
              <h1 class="h1">{{ mode === 'login' ? 'Üdv újra!' : 'Fiók létrehozása' }}</h1>
              <p class="lead">Angol szókártyák MI-segítséggel.</p>
            </div>
            <div class="seg seg-full" role="group" aria-label="Belépés módja">
              <button type="button" [class.is-on]="mode === 'login'" [attr.aria-pressed]="mode === 'login'" (click)="setMode('login')">Bejelentkezés</button>
              <button type="button" [class.is-on]="mode === 'register'" [attr.aria-pressed]="mode === 'register'" (click)="setMode('register')">Regisztráció</button>
            </div>
            @if (session.expired()) {
              <div class="notice" role="status"><app-icon name="info" /><div>Lejárt a bejelentkezésed, lépj be újra.</div></div>
            }
            <form class="form-stack" (ngSubmit)="submit()" novalidate>
              <div class="field">
                <label for="email">E-mail</label>
                <input
                  id="email"
                  class="input-lg"
                  name="email"
                  type="email"
                  autocomplete="username"
                  placeholder="nev@példa.hu"
                  [class.is-invalid]="mode === 'register' && emailTaken"
                  [(ngModel)]="email"
                  (ngModelChange)="onRegisterFieldChange()"
                  [disabled]="isSubmitting">
                @if (mode === 'register' && emailTaken) {
                  <span class="field-error">Ezzel az email címmel már van fiók.</span>
                }
              </div>
              @if (mode === 'register') {
                <div class="field">
                  <label for="registerUsername">Felhasználónév</label>
                  <input
                    id="registerUsername"
                    class="input-lg"
                    name="registerUsername"
                    type="text"
                    autocomplete="nickname"
                    maxlength="30"
                    placeholder="3–30 karakter: betű, szám, . - _"
                    [class.is-invalid]="usernameTaken"
                    [(ngModel)]="registerUsername"
                    (ngModelChange)="onRegisterFieldChange()"
                    [disabled]="isSubmitting">
                  @if (usernameTaken) {
                    <span class="field-error">Ez a felhasználónév már foglalt.</span>
                  } @else {
                    <span class="help">Ez látszik a megosztott paklijaid mellett.</span>
                  }
                </div>
              }
              <div class="field">
                <label for="password">Jelszó</label>
                <input
                  id="password"
                  class="input-lg"
                  name="password"
                  type="password"
                  [attr.autocomplete]="mode === 'register' ? 'new-password' : 'current-password'"
                  [placeholder]="mode === 'register' ? 'Legalább 8 karakter, betűvel és számmal' : ''"
                  [(ngModel)]="password"
                  [disabled]="isSubmitting">
              </div>
              @if (mode === 'register') {
                <div class="field">
                  <label for="passwordConfirm">Jelszó újra</label>
                  <input
                    id="passwordConfirm"
                    class="input-lg"
                    name="passwordConfirm"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Írd be még egyszer a jelszót"
                    [class.is-invalid]="passwordConfirm.length > 0 && password !== passwordConfirm"
                    [(ngModel)]="passwordConfirm"
                    [disabled]="isSubmitting">
                  @if (passwordConfirm.length > 0 && password !== passwordConfirm) {
                    <span class="field-error">A két jelszó nem egyezik.</span>
                  }
                </div>
              }
              @if (errorMessage) {
                <div class="notice notice-bad" role="alert"><app-icon name="warn" /><div>{{ errorMessage }}</div></div>
              }
              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="isSubmitting">
                @if (isSubmitting) {
                  <span class="spinner spinner-sm"></span>
                }
                {{ mode === 'login' ? 'Bejelentkezés' : 'Regisztráció' }}
              </button>
            </form>
            <p class="auth-foot">
              {{ mode === 'login' ? 'Nincs még fiókod?' : 'Van már fiókod?' }}
              <button type="button" class="link-btn" (click)="setMode(mode === 'login' ? 'register' : 'login')">{{ mode === 'login' ? 'Regisztráció' : 'Bejelentkezés' }}</button>
            </p>
          </div>
        </main>
      </div>
    } @else {
      <ng-template #avatarTpl>
        @if (hasAvatar && avatarUrl) {
          <img [src]="avatarUrl" alt="" width="36" height="36" class="avatar" (error)="hasAvatar = false">
        } @else {
          <span class="avatar" aria-hidden="true">{{ initial() }}</span>
        }
      </ng-template>
      <ng-template #streakTpl>
        <span class="streak-pill" title="Napi sorozat" [attr.aria-label]="'Napi sorozat: ' + studyDayStreak + ' nap'"><app-icon name="flame" />{{ studyDayStreak }}</span>
      </ng-template>

      <div class="shell">
        <aside class="rail" aria-label="Fő navigáció">
          <span class="brand-mark rail-mark" role="img" aria-label="WordTárs">W</span>
          <span class="rail-streak"><ng-container *ngTemplateOutlet="streakTpl" /></span>
          @for (item of navItems; track item.id) {
            <button
              type="button"
              class="rail-item"
              [class.is-on]="view === item.id"
              [attr.aria-current]="view === item.id ? 'page' : null"
              (click)="goTo(item.id)">
              <span class="ic-wrap"><app-icon [name]="item.icon" /></span>
              {{ item.label }}
            </button>
          }
          <span class="spacer"></span>
          <button
            type="button"
            class="rail-item"
            [class.is-on]="view === 'settings'"
            [attr.aria-current]="view === 'settings' ? 'page' : null"
            (click)="goTo('settings')">
            <span class="ic-wrap"><app-icon name="sliders" /></span>
            Beállítások
          </button>
          <button
            type="button"
            class="avatar-btn rail-avatar"
            [class.is-on]="view === 'profile'"
            aria-label="Fiókmenü"
            aria-haspopup="menu"
            [attr.aria-expanded]="menuOpen"
            (click)="toggleMenu($event)">
            <ng-container *ngTemplateOutlet="avatarTpl" />
          </button>
        </aside>

        <header class="mtop">
          <span class="brand"><span class="brand-mark">W</span>WordTárs</span>
          <span class="spacer"></span>
          <ng-container *ngTemplateOutlet="streakTpl" />
          <button
            type="button"
            class="avatar-btn"
            aria-label="Fiókmenü"
            aria-haspopup="menu"
            [attr.aria-expanded]="menuOpen"
            (click)="toggleMenu($event)">
            <ng-container *ngTemplateOutlet="avatarTpl" />
          </button>
        </header>

        <div class="main" id="main">
      @if (errorMessage) {
        <div class="page">
          <div class="notice notice-bad" role="alert"><app-icon name="warn" /><div>{{ errorMessage }}</div></div>
        </div>
      }
      @if (view === 'study') {
        <app-study-card [initialDeckId]="studyDeckId" (openDecks)="goTo('decks')" />
      } @else if (view === 'grammar') {
        <app-grammar (openDecks)="goTo('decks')" />
      } @else if (view === 'composition') {
        <app-composition (openDecks)="goTo('decks')" />
      } @else if (view === 'stats') {
        <app-stats (startStudy)="goTo('study')" />
      } @else if (view === 'decks') {
        <app-decks (studyDeck)="studyDeck($event)" />
      } @else if (view === 'settings') {
        <main class="page page-narrow">
          <header class="page-head">
            <div class="ph-text">
              <h1 class="h1">Beállítások</h1>
              <p class="lead">A tanulási beállítások a Mentés gombbal lépnek életbe.</p>
            </div>
          </header>
          <section class="panel set-group">
            <h2 class="h2">Megjelenés</h2>
            <div class="set-row">
              <span>Téma</span>
              <div class="seg" role="group" aria-label="Téma">
                <button type="button" [class.is-on]="theme.choice() === 'light'" [attr.aria-pressed]="theme.choice() === 'light'" (click)="theme.setChoice('light')">Világos</button>
                <button type="button" [class.is-on]="theme.choice() === 'dark'" [attr.aria-pressed]="theme.choice() === 'dark'" (click)="theme.setChoice('dark')">Sötét</button>
                <button type="button" [class.is-on]="theme.choice() === 'system'" [attr.aria-pressed]="theme.choice() === 'system'" (click)="theme.setChoice('system')">Rendszer</button>
              </div>
            </div>
          </section>
          <section class="panel set-group">
            <div class="ph-text">
              <h2 class="h2">Hang és felolvasás</h2>
              <p class="help">A kártyák szövegét a hangszóró gombbal felolvastathatod. Itt állíthatod be, mit és milyen hangon olvasson.</p>
            </div>
            <app-speech-settings />
          </section>
          <form class="panel set-group" (ngSubmit)="saveStudySettings()">
            <h2 class="h2">Tanulási beállítások</h2>
            @if (!studySettingsLoaded) {
              <div class="notice" role="status">
                @if (isLoadingStudySettings) {
                  <span class="spinner spinner-sm" aria-hidden="true"></span>
                  <div>A beállítások betöltése…</div>
                } @else {
                  <app-icon name="warn" />
                  <div>
                    <span>Nem sikerült betölteni a beállításokat, ezért most nem tudsz menteni.</span>
                    <span><button type="button" class="btn btn-sm" (click)="loadStudySettings()">Újrapróbálás</button></span>
                  </div>
                }
              </div>
            }
            <div class="form-grid">
              <div class="field">
                <label for="dailyNewCardGoal">Napi új szavak</label>
                <div class="range-row">
                  <input
                    id="dailyNewCardGoal"
                    name="dailyNewCardGoal"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    [(ngModel)]="dailyNewCardGoal"
                    [disabled]="isSavingStudySettings">
                  <output for="dailyNewCardGoal">{{ dailyNewCardGoal }}</output>
                </div>
                <span class="help">Naponta ennyi új szót kapsz. Az esedékes ismétlések ezen felül jönnek.</span>
              </div>
              <div class="field">
                <label for="minimumAnswerSeconds">Minimum idő másodpercben</label>
                <input
                  id="minimumAnswerSeconds"
                  name="minimumAnswerSeconds"
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  [(ngModel)]="minimumAnswerSeconds"
                  [disabled]="isSavingStudySettings">
                <span class="help">Ennyi másodperc után válaszolhatsz a kártyára (0–120).</span>
              </div>
              <div class="field">
                <label for="exampleLevel">Mondatszint</label>
                <select
                  id="exampleLevel"
                  name="exampleLevel"
                  [(ngModel)]="exampleLevel"
                  [disabled]="isSavingStudySettings">
                  @for (level of exampleLevels; track level) {
                    <option [value]="level">{{ level }}</option>
                  }
                </select>
                <span class="help">Ez a fiókod szintje. Ha a paklinak saját szintje van, az számít.</span>
              </div>
              <div class="field">
                <label for="aiModel">MI-modell</label>
                <select
                  id="aiModel"
                  name="aiModel"
                  [(ngModel)]="aiModel"
                  [disabled]="isSavingStudySettings">
                  @for (model of aiModels; track model.id) {
                    <option [value]="model.id">{{ model.label }}</option>
                  }
                </select>
                <span class="help">Mindegyik ugyanazt az OpenRouter-kulcsot használja.</span>
              </div>
            </div>
            <div>
              <label class="row-toggle" for="automaticAiCheck">
                <span class="t"><span>Automatikus MI-ellenőrzés</span><small>Ha a válaszod nem egyezik a mentett jelentéssel, az MI megnézi. Kikapcsolva ezt hibás válasz után te indíthatod el.</small></span>
                <span class="switch"><input id="automaticAiCheck" name="automaticAiCheck" type="checkbox" [(ngModel)]="automaticAiCheck" [disabled]="isSavingStudySettings"><span></span></span>
              </label>
              <label class="row-toggle" for="acceptPartialMeaningMatch">
                <span class="t"><span>Részleges egyezés elfogadása</span><small>Elég, ha a vesszővel elválasztott részek közül egy egyezik a mentett jelentéssel. Kikapcsolva a teljes válasznak egyeznie kell.</small></span>
                <span class="switch"><input id="acceptPartialMeaningMatch" name="acceptPartialMeaningMatch" type="checkbox" [(ngModel)]="acceptPartialMeaningMatch" [disabled]="isSavingStudySettings"><span></span></span>
              </label>
              <label class="row-toggle" for="acceptEnglishSynonyms">
                <span class="t"><span>Angol szinonima elfogadása</span><small>Magyarról angolra fordításnál, ha a kártya szava helyett egy azonos jelentésű másik angol szót írsz, az MI sárgán jelzi. Bekapcsolva ez jó válasz, kikapcsolva hibás (a Mégis helyes volt gombbal vitathatod).</small></span>
                <span class="switch"><input id="acceptEnglishSynonyms" name="acceptEnglishSynonyms" type="checkbox" [(ngModel)]="acceptEnglishSynonyms" [disabled]="isSavingStudySettings"><span></span></span>
              </label>
              <label class="row-toggle" for="repeatMistakes">
                <span class="t"><span>Hibás válasz után azonnali gyakorló ismétlés</span><small>Az elrontott kártya rögtön visszajön, hogy begyakorold. Ha másodszor is hibázol, jön a következő. Ezek a körök nem számítanak a statisztikába és az ütemezésbe. Csak Fordítás módban működik.</small></span>
                <span class="switch"><input id="repeatMistakes" name="repeatMistakes" type="checkbox" [(ngModel)]="repeatMistakes" [disabled]="isSavingStudySettings"><span></span></span>
              </label>
            </div>
            <details class="adv">
              <summary>Haladó beállítások <app-icon name="chev" /></summary>
              <div class="adv-body">
                <label class="row-toggle" for="acceptHungarianParaphrase">
                  <span class="t"><span>Magyar körülírás elfogadása</span><small>Magyarul is elmagyarázhatod a szót, az MI angolra írja át. Kikapcsolva csak angolul lehet.</small></span>
                  <span class="switch"><input id="acceptHungarianParaphrase" name="acceptHungarianParaphrase" type="checkbox" [(ngModel)]="acceptHungarianParaphrase" [disabled]="isSavingStudySettings"><span></span></span>
                </label>
                <label class="row-toggle" for="requireAppealReason">
                  <span class="t"><span>A hibás válasz megvédéséhez indoklás kell</span><small>Bekapcsolva a Mégis helyes volt gomb indoklást kér, és az MI dönt. Kikapcsolva a Márpedig ez jó válasz volt gomb indoklás nélkül helyesnek veszi.</small></span>
                  <span class="switch"><input id="requireAppealReason" name="requireAppealReason" type="checkbox" [(ngModel)]="requireAppealReason" [disabled]="isSavingStudySettings"><span></span></span>
                </label>
                <label class="row-toggle" for="reuseSavedExamples">
                  <span class="t"><span>Mentett definíciók és példamondatok újrafelhasználása</span><small>Ha van már mentett példamondat vagy definíció, kb. minden második alkalommal azt kapod, MI-hívás nélkül. Kikapcsolva mindig újat kérünk az MI-től.</small></span>
                  <span class="switch"><input id="reuseSavedExamples" name="reuseSavedExamples" type="checkbox" [(ngModel)]="reuseSavedExamples" [disabled]="isSavingStudySettings"><span></span></span>
                </label>
                <label class="row-toggle" for="allowOtherSavedLevels">
                  <span class="t"><span>Eltérő szintű mentett válaszok is jöhetnek</span><small>Csak a már mentett példákra és definíciókra vonatkozik. Új MI-kérésnél továbbra is a pakli vagy a fiók szintje számít, és azon a szinten mentődik.</small></span>
                  <span class="switch"><input id="allowOtherSavedLevels" name="allowOtherSavedLevels" type="checkbox" [(ngModel)]="allowOtherSavedLevels" [disabled]="isSavingStudySettings"><span></span></span>
                </label>
                @if (allowOtherSavedLevels) {
                  <div class="field toggle-extra">
                    <label for="savedLevelPolicy">Melyik mentett válaszok jöhetnek?</label>
                    <select
                      id="savedLevelPolicy"
                      name="savedLevelPolicy"
                      [(ngModel)]="savedLevelPolicy"
                      [disabled]="isSavingStudySettings">
                      @for (policy of savedLevelPolicies; track policy.id) {
                        <option [value]="policy.id">{{ policy.label }}</option>
                      }
                    </select>
                  </div>
                }
                <label class="row-toggle" for="generateAlternateDefinitions">
                  <span class="t"><span>Váltakozó definíció</span><small>Mindig új angol definíció készül a mondatszintednek megfelelően. Kikapcsolva a kártyára írt definíciót kapod.</small></span>
                  <span class="switch"><input id="generateAlternateDefinitions" name="generateAlternateDefinitions" type="checkbox" [(ngModel)]="generateAlternateDefinitions" [disabled]="isSavingStudySettings"><span></span></span>
                </label>
                <div class="form-grid adv-grid">
                  <div class="field">
                    <label for="leechThreshold">Nehéz szó küszöbe (hibák száma)</label>
                    <input
                      id="leechThreshold"
                      name="leechThreshold"
                      type="number"
                      min="2"
                      max="50"
                      step="1"
                      [(ngModel)]="leechThreshold"
                      [disabled]="isSavingStudySettings">
                    <span class="help">Ennyi hiba után számít nehéznek egy szó, ha többször rontottad el, mint ahányszor eltaláltad. A nehéz szavakat megjelöljük, hogy félretehesd őket.</span>
                  </div>
                  <div class="field">
                    <label for="aiFillBatchSize">MI-kitöltés csomagmérete (szó / hívás)</label>
                    <input
                      id="aiFillBatchSize"
                      name="aiFillBatchSize"
                      type="number"
                      min="1"
                      max="10"
                      step="1"
                      [(ngModel)]="aiFillBatchSize"
                      [disabled]="isSavingStudySettings">
                    <span class="help">Szöveges importnál ennyi szót dolgoz fel egy MI-hívás (1–10). A nagyobb csomag gyorsabb, de egy hiba több szót érint.</span>
                    <span class="help">
                      Mai MI-kitöltés: {{ aiFillDailyLimit - aiFillRemainingToday }} / {{ aiFillDailyLimit }}, hátra: {{ aiFillRemainingToday }}.
                      A napi keret most nincs érvényben, ezért negatív is lehet.
                    </span>
                  </div>
                </div>
              </div>
            </details>
            <div class="start-row">
              <button type="submit" class="btn btn-primary btn-lg" [disabled]="isSavingStudySettings || !studySettingsLoaded">
                @if (isSavingStudySettings) {
                  <span class="spinner spinner-sm"></span>
                }
                Mentés
              </button>
            </div>
          </form>
        </main>
      } @else {
        <main class="page page-narrow">
          <header class="page-head">
            <div class="ph-text"><h1 class="h1">Profil</h1></div>
            <button type="button" class="btn" (click)="logout()"><app-icon name="logout" /> Kijelentkezés</button>
          </header>
          <section class="panel id-card">
            @if (hasAvatar && avatarUrl) {
              <img [src]="avatarUrl" alt="" width="76" height="76" class="avatar avatar-xl" (error)="hasAvatar = false">
            } @else {
              <span class="avatar avatar-xl" aria-hidden="true">{{ initial() }}</span>
            }
            <div class="ph-text">
              <h2 class="h2">{{ savedDisplayName || savedUsername || profileEmail || session.email() }}</h2>
              <p class="muted">@if (savedUsername) {&#64;{{ savedUsername }} · }{{ profileEmail || session.email() }}</p>
              <div class="chips">
                <span class="streak-pill" title="Napi sorozat" [attr.aria-label]="'Napi sorozat: ' + studyDayStreak + ' nap'"><app-icon name="flame" />{{ studyDayStreak }} nap</span>
              </div>
            </div>
            <div class="actions">
              <label class="btn btn-sm" for="avatarFile" [class.disabled]="isUploadingAvatar">
                @if (isUploadingAvatar) {
                  <span class="spinner spinner-sm"></span>
                } @else {
                  <app-icon name="camera" />
                }
                Kép cseréje
              </label>
              <input
                id="avatarFile"
                class="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                (change)="uploadAvatar($event)"
                [disabled]="isUploadingAvatar">
              @if (hasAvatar) {
                <button
                  type="button"
                  class="btn btn-sm btn-ghost btn-danger-ghost"
                  (click)="deleteAvatar()"
                  [disabled]="isDeletingAvatar">
                  Kép törlése
                </button>
              }
            </div>
          </section>
          <section class="panel set-group">
            <h2 class="h2">Adatok</h2>
            <form class="field" (ngSubmit)="saveUsername()">
              <label for="username">Felhasználónév</label>
              <div class="input-row">
                <input
                  id="username"
                  name="username"
                  type="text"
                  maxlength="30"
                  autocomplete="off"
                  [(ngModel)]="username"
                  [disabled]="isSavingUsername">
                <button type="submit" class="btn" [disabled]="isSavingUsername || !username.trim() || username.trim() === savedUsername">Mentés</button>
              </div>
              <span class="help">3–30 karakter: angol betű, szám, pont, kötőjel, aláhúzás. A megosztott paklijaid mellett ez látszik.</span>
            </form>
            <form class="field" (ngSubmit)="saveDisplayName()">
              <label for="displayName">Megjelenített név</label>
              <div class="input-row">
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  [(ngModel)]="displayName"
                  [disabled]="isSavingName">
                <button type="submit" class="btn" [disabled]="isSavingName">Mentés</button>
              </div>
            </form>
          </section>
          <form class="panel set-group" (ngSubmit)="changePassword()">
            <h2 class="h2">Jelszócsere</h2>
            <div class="form-grid">
              <div class="field">
                <label for="currentPassword">Jelenlegi jelszó</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autocomplete="current-password"
                  [(ngModel)]="currentPassword"
                  [disabled]="isChangingPassword">
              </div>
              <div class="field">
                <label for="newPassword">Új jelszó</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autocomplete="new-password"
                  [(ngModel)]="newPassword"
                  [disabled]="isChangingPassword">
                <span class="help">Legalább 8 karakter, benne betű és szám.</span>
              </div>
            </div>
            <div><button type="submit" class="btn btn-primary" [disabled]="isChangingPassword">Jelszócsere</button></div>
          </form>
          <section class="panel set-group danger-zone">
            <h2 class="h2">Fiók törlése</h2>
            <p class="muted">A fiókod, a profilképed, a paklijaid és a tanulási adataid véglegesen törlődnek. Ezt nem lehet visszacsinálni.</p>
            <div class="field">
              <label for="deleteAccountSlide">A törléshez húzd jobbra a csúszkát</label>
              <input
                id="deleteAccountSlide"
                type="range"
                class="range-danger"
                min="0"
                max="100"
                step="1"
                [value]="deleteSlide"
                (input)="onDeleteSlide($event)"
                [disabled]="isDeletingAccount">
            </div>
            <div>
              <button
                type="button"
                class="btn btn-danger"
                (click)="deleteAccount()"
                [disabled]="isDeletingAccount || deleteSlide < 100">
                <app-icon name="trash" /> Fiók végleges törlése
              </button>
            </div>
          </section>
        </main>
      }
      @if (profileError || profileMessage) {
        <div class="toast" [class.bad]="!!profileError" role="status">
          <app-icon [name]="profileError ? 'warn' : 'check'" />
          <span>{{ profileError || profileMessage }}</span>
          <button type="button" class="toast-x" aria-label="Bezárás" (click)="profileError = null; profileMessage = null"><app-icon name="x" /></button>
        </div>
      }
        </div>

        <nav class="dock" aria-label="Fő navigáció">
          @for (item of dockItems; track item.id) {
            @if (item.id === 'study') {
              <button
                type="button"
                class="fab"
                [class.is-on]="view === item.id"
                [attr.aria-current]="view === item.id ? 'page' : null"
                aria-label="Tanulás"
                (click)="goTo(item.id)">
                <app-icon name="play" />
              </button>
            } @else {
              <button
                type="button"
                [class.is-on]="view === item.id"
                [attr.aria-current]="view === item.id ? 'page' : null"
                (click)="goTo(item.id)">
                <app-icon [name]="item.icon" />
                <span>{{ item.label }}</span>
              </button>
            }
          }
        </nav>

        @if (menuOpen) {
          <div class="menu-pop" role="menu" aria-label="Fiókmenü" (click)="$event.stopPropagation()">
            <div class="mp-head">
              <ng-container *ngTemplateOutlet="avatarTpl" />
              <span class="who">
                <strong>{{ savedDisplayName || savedUsername || profileEmail || session.email() }}</strong>
                <span class="muted">{{ profileEmail || session.email() }}</span>
              </span>
            </div>
            <button type="button" class="mp-item" role="menuitem" (click)="goTo('profile')"><app-icon name="user" /> Profil</button>
            <button type="button" class="mp-item" role="menuitem" (click)="goTo('settings')"><app-icon name="sliders" /> Beállítások</button>
            <app-mute-button />
            <div class="mp-theme">
              <span>Téma</span>
              <div class="seg seg-sm" role="group" aria-label="Téma">
                <button type="button" [class.is-on]="theme.mode() === 'light'" [attr.aria-pressed]="theme.mode() === 'light'" (click)="theme.setChoice('light')">Világos</button>
                <button type="button" [class.is-on]="theme.mode() === 'dark'" [attr.aria-pressed]="theme.mode() === 'dark'" (click)="theme.setChoice('dark')">Sötét</button>
              </div>
            </div>
            <button type="button" class="mp-item" role="menuitem" (click)="logout()"><app-icon name="logout" /> Kijelentkezés</button>
          </div>
        }
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly session = inject(AuthSessionService);

  readonly theme = inject(ThemeService);

  view: AppView = 'study';
  // A Profil és a Beállítások nincs itt: a fiókmenü és az ikonsín alsó gombja nyitja.
  readonly navItems: NavItem[] = [
    { id: 'study', label: 'Tanulás', icon: 'layers' },
    { id: 'grammar', label: 'Nyelvtan', icon: 'pen' },
    { id: 'composition', label: 'Mondatok', icon: 'text' },
    { id: 'stats', label: 'Statisztika', icon: 'chart' },
    { id: 'decks', label: 'Paklik', icon: 'folder' },
  ];
  // Telefonon az alsó sávban a Tanulás a kiemelt középső gomb.
  readonly dockItems = (['grammar', 'composition', 'study', 'stats', 'decks'] as AppView[])
    .map(id => this.navItems.find(item => item.id === id)!);
  menuOpen = false;
  mode: AuthMode = 'login';
  email = '';
  registerUsername = '';
  password = '';
  passwordConfirm = '';
  emailTaken = false;
  usernameTaken = false;
  private availabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private availabilityRequest = 0;
  errorMessage: string | null = null;
  isSubmitting = false;
  isDeletingAccount = false;
  deleteSlide = 0;
  profileEmail: string | null = null;
  username = '';
  savedUsername = '';
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
  isSavingUsername = false;
  isUploadingAvatar = false;
  isDeletingAvatar = false;
  isChangingPassword = false;
  dailyNewCardGoal = 20;
  minimumAnswerSeconds = 0;
  automaticAiCheck = true;
  acceptHungarianParaphrase = false;
  acceptPartialMeaningMatch = true;
  acceptEnglishSynonyms = false;
  repeatMistakes = true;
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
  leechThreshold = 6;
  aiFillBatchSize = 5;
  aiFillDailyLimit = 100;
  aiFillRemainingToday = 100;
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
  // A PUT /api/study/settings teljes csere: csak a szerverről sikeresen betöltött értékek menthetők vissza,
  // különben az alapértékek vagy egy korábbi fiók értékei írnák felül a beállításokat.
  studySettingsLoaded = false;
  isLoadingStudySettings = false;
  private studySettingsRequest = 0;
  private userId: number | null = null;
  @ViewChild(DecksComponent) private decksView?: DecksComponent;

  constructor() {
    // A 401 miatti kijelentkezés (interceptor) is takarítsa a profilt és a nézetet, ne csak a Kijelentkezés gomb.
    effect(() => {
      if (!this.session.isLoggedIn()) {
        this.clearProfile();
      }
    });
  }

  ngOnInit(): void {
    if (this.session.isLoggedIn()) {
      this.loadProfile();
    }
  }

  setMode(mode: AuthMode): void {
    this.mode = mode;
    this.errorMessage = null;
    this.passwordConfirm = '';
    this.resetAvailability();
    if (mode === 'register') {
      this.onRegisterFieldChange();
    }
  }

  /** Regisztráció közben gépelés után röviddel megnézi, hogy az email vagy a felhasználónév foglalt-e. */
  onRegisterFieldChange(): void {
    if (this.mode !== 'register') {
      return;
    }

    this.emailTaken = false;
    this.usernameTaken = false;
    if (this.availabilityTimer) {
      clearTimeout(this.availabilityTimer);
    }

    const email = this.email.trim();
    const username = this.registerUsername.trim();
    const checkEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const checkUsername = /^[A-Za-z0-9_.-]{3,30}$/.test(username);
    if (!checkEmail && !checkUsername) {
      return;
    }

    const request = ++this.availabilityRequest;
    this.availabilityTimer = setTimeout(() => {
      this.availabilityTimer = null;
      const params: Record<string, string> = {};
      if (checkEmail) {
        params['email'] = email;
      }

      if (checkUsername) {
        params['username'] = username;
      }

      this.http.get<{ emailTaken: boolean | null; usernameTaken: boolean | null }>('/api/auth/availability', { params }).subscribe({
        next: (result) => {
          if (request === this.availabilityRequest && this.mode === 'register') {
            this.emailTaken = result.emailTaken === true;
            this.usernameTaken = result.usernameTaken === true;
          }
        },
        // Ha az ellenőrzés nem sikerül, a beküldéskor a szerver úgyis elutasítja a foglalt adatot.
        error: () => undefined,
      });
    }, 400);
  }

  private resetAvailability(): void {
    this.availabilityRequest++;
    if (this.availabilityTimer) {
      clearTimeout(this.availabilityTimer);
      this.availabilityTimer = null;
    }

    this.emailTaken = false;
    this.usernameTaken = false;
  }

  submit(): void {
    const email = this.email.trim();
    const password = this.password;
    if (!email || !password) {
      this.errorMessage = 'Add meg az emailt és a jelszót.';
      return;
    }

    if (this.mode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Ez nem tűnik érvényes email címnek.';
      return;
    }

    if (this.mode === 'register' && password.length < 8) {
      this.errorMessage = 'A jelszó legalább 8 karakter legyen.';
      return;
    }

    const username = this.registerUsername.trim();
    if (this.mode === 'register' && !/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
      this.errorMessage = 'A felhasználónév 3–30 karakter, angol betű, szám, pont, kötőjel és aláhúzás lehet.';
      return;
    }

    if (this.mode === 'register' && password !== this.passwordConfirm) {
      this.errorMessage = 'A két jelszó nem egyezik.';
      return;
    }

    if (this.mode === 'register' && this.emailTaken) {
      this.errorMessage = 'Ezzel az email címmel már van fiók.';
      return;
    }

    if (this.mode === 'register' && this.usernameTaken) {
      this.errorMessage = 'Ez a felhasználónév már foglalt.';
      return;
    }

    this.errorMessage = null;
    this.isSubmitting = true;
    const url = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = this.mode === 'login' ? { email, password } : { email, username, password };
    this.http.post<AuthResponse>(url, body).pipe(
      finalize(() => {
        this.isSubmitting = false;
      }),
    ).subscribe({
      next: (response) => {
        this.password = '';
        this.passwordConfirm = '';
        this.registerUsername = '';
        this.resetAvailability();
        this.session.setSession(response.token, response.email);
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error);
        if (this.mode === 'register' && error.status === 409) {
          this.onRegisterFieldChange();
        }
      },
    });
  }

  logout(): void {
    if (!this.confirmLeaveDecks()) {
      return;
    }

    this.password = '';
    this.passwordConfirm = '';
    this.errorMessage = null;
    this.clearProfile();
    this.session.clear();
  }

  studyDeckId: number | null = null;

  studyDeck(deckId: number): void {
    if (!this.confirmLeaveDecks()) {
      return;
    }

    this.studyDeckId = deckId;
    this.view = 'study';
  }

  // A beillesztéses import sorai és a futó MI-kitöltése a Paklik komponensben élnek, ezért a nézet elhagyásakor
  // elvesznek: ilyenkor előbb rákérdez.
  private confirmLeaveDecks(): boolean {
    if (this.view !== 'decks' || !this.decksView?.hasUnsavedPaste) {
      return true;
    }

    return confirm(
      'A be nem mentett sorok elvesznek, és a futó MI-kitöltés megszakad. Biztosan kilépsz?',
    );
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  // A fiókmenü a mellé kattintásra és az Escape-re bezárul.
  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
  }

  goTo(view: AppView): void {
    this.menuOpen = false;
    if (view !== 'decks' && !this.confirmLeaveDecks()) {
      return;
    }

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

  saveUsername(): void {
    const username = this.username.trim();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
      this.profileMessage = null;
      this.profileError = 'A felhasználónév 3–30 karakter, angol betű, szám, pont, kötőjel és aláhúzás lehet.';
      return;
    }

    this.profileError = null;
    this.profileMessage = null;
    this.isSavingUsername = true;
    this.http.put('/api/auth/profile/username', { username }).pipe(
      finalize(() => {
        this.isSavingUsername = false;
      }),
    ).subscribe({
      next: () => {
        this.profileMessage = 'A felhasználónév mentve.';
        this.loadProfile();
      },
      error: (error: HttpErrorResponse) => {
        this.profileError = this.readProblem(error, 'A felhasználónév mentése sikertelen.');
      },
    });
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
    if (!this.studySettingsLoaded || this.isSavingStudySettings) {
      return;
    }

    this.profileError = null;
    this.profileMessage = null;
    const goal = Number(this.dailyNewCardGoal);
    const seconds = Number(this.minimumAnswerSeconds);
    if (!Number.isInteger(goal) || goal < 0 || goal > 100
      || !Number.isInteger(seconds) || seconds < 0 || seconds > 120) {
      this.profileError = 'Napi új szó: 0–100, minimum idő: 0–120 másodperc.';
      return;
    }

    const leechThreshold = Number(this.leechThreshold);
    if (!Number.isInteger(leechThreshold) || leechThreshold < 2 || leechThreshold > 50) {
      this.profileError = 'A nehéz szó küszöbe 2–50 hiba lehet.';
      return;
    }

    const aiFillBatchSize = Number(this.aiFillBatchSize);
    if (!Number.isInteger(aiFillBatchSize) || aiFillBatchSize < 1 || aiFillBatchSize > 10) {
      this.profileError = 'Az MI-kitöltés csomagmérete 1 és 10 között lehet.';
      return;
    }

    if (!this.exampleLevels.includes(this.exampleLevel)) {
      this.profileError = 'A mondatszint A1, A2, B1, B2, C1 vagy C2 lehet.';
      return;
    }

    if (!this.aiModels.some((model) => model.id === this.aiModel)) {
      this.profileError = 'Válassz a listában szereplő modellek közül.';
      return;
    }

    const savedLevelPolicy = this.allowOtherSavedLevels ? this.savedLevelPolicy : 'exact';
    if (this.allowOtherSavedLevels && !this.savedLevelPolicies.some((policy) => policy.id === savedLevelPolicy)) {
      this.profileError = 'Válassz a három lehetőség közül.';
      return;
    }

    this.isSavingStudySettings = true;
    this.http.put<StudySettings>('/api/study/settings', {
      dailyNewCardGoal: goal,
      minimumAnswerSeconds: seconds,
      automaticAiCheck: this.automaticAiCheck,
      acceptHungarianParaphrase: this.acceptHungarianParaphrase,
      acceptPartialMeaningMatch: this.acceptPartialMeaningMatch,
      acceptEnglishSynonyms: this.acceptEnglishSynonyms,
      repeatMistakes: this.repeatMistakes,
      requireAppealReason: this.requireAppealReason,
      reuseSavedExamples: this.reuseSavedExamples,
      savedLevelPolicy,
      generateAlternateDefinitions: this.generateAlternateDefinitions,
      leechThreshold,
      aiFillBatchSize,
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
        this.acceptPartialMeaningMatch = settings.acceptPartialMeaningMatch;
        this.acceptEnglishSynonyms = settings.acceptEnglishSynonyms;
        this.repeatMistakes = settings.repeatMistakes;
        this.requireAppealReason = settings.requireAppealReason;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.applySavedLevelPolicy(settings.savedLevelPolicy);
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.leechThreshold = settings.leechThreshold ?? 6;
        this.applyAiFillSettings(settings);
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
      'Biztosan törlöd a fiókodat?\n\nA fiókod, a profilképed, a paklijaid és a tanulási adataid véglegesen törlődnek. Ezt nem lehet visszacsinálni. A mások által elmentett másolatok megmaradnak.',
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

  private applyAiFillSettings(settings: StudySettings): void {
    this.aiFillBatchSize = settings.aiFillBatchSize ?? 5;
    this.aiFillDailyLimit = settings.aiFillDailyLimit ?? 100;
    this.aiFillRemainingToday = settings.aiFillRemainingToday ?? this.aiFillDailyLimit;
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

  loadStudySettings(): void {
    const request = ++this.studySettingsRequest;
    this.studySettingsLoaded = false;
    this.isLoadingStudySettings = true;
    this.http.get<StudySettings>('/api/study/settings').pipe(
      finalize(() => {
        if (request === this.studySettingsRequest) {
          this.isLoadingStudySettings = false;
        }
      }),
    ).subscribe({
      next: (settings) => {
        if (request !== this.studySettingsRequest) {
          return;
        }

        this.studySettingsLoaded = true;
        this.dailyNewCardGoal = settings.dailyNewCardGoal;
        this.minimumAnswerSeconds = settings.minimumAnswerSeconds;
        this.automaticAiCheck = settings.automaticAiCheck;
        this.acceptHungarianParaphrase = settings.acceptHungarianParaphrase;
        this.acceptPartialMeaningMatch = settings.acceptPartialMeaningMatch;
        this.acceptEnglishSynonyms = settings.acceptEnglishSynonyms;
        this.repeatMistakes = settings.repeatMistakes;
        this.requireAppealReason = settings.requireAppealReason;
        this.reuseSavedExamples = settings.reuseSavedExamples;
        this.applySavedLevelPolicy(settings.savedLevelPolicy);
        this.generateAlternateDefinitions = settings.generateAlternateDefinitions;
        this.leechThreshold = settings.leechThreshold ?? 6;
        this.applyAiFillSettings(settings);
        this.exampleLevel = settings.exampleLevel;
        this.aiModel = settings.aiModel;
        this.timeZoneId = settings.timeZoneId || this.timeZoneId;
      },
      error: (error: HttpErrorResponse) => {
        if (request === this.studySettingsRequest) {
          this.profileError = this.readProblem(error, 'A tanulási beállítások betöltése sikertelen.');
        }
      },
    });
  }

  private loadProfile(): void {
    this.userId = this.readUserId();
    this.http.get<ProfileResponse>('/api/auth/profile').subscribe({
      next: (profile) => {
        this.profileEmail = profile.email;
        this.username = profile.username;
        this.savedUsername = profile.username;
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
    this.username = '';
    this.savedUsername = '';
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
    // Az előző fiók tanulási beállításai ne legyenek menthetők; a Beállítások nézet újra betölti őket.
    this.studySettingsRequest++;
    this.studySettingsLoaded = false;
    this.isLoadingStudySettings = false;
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

    return 'Nem sikerült, próbáld újra.';
  }
}
