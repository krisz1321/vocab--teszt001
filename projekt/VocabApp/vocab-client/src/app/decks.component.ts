import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

interface Deck {
  id: number;
  name: string;
  isPublic: boolean;
}

interface PublicDeck {
  id: number;
  name: string;
  cardCount: number;
  ownerEmail: string;
}

interface VocabCard {
  id: number;
  deckId: number;
  term: string;
  definition: string;
  example: string | null;
}

interface ProblemDetails {
  title?: string;
}

interface ImportResult {
  importedCount: number;
}

@Component({
  selector: 'app-decks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="container py-5">
      <div class="mx-auto" style="max-width: 760px;">
        <header class="mb-4">
          <h1 class="display-6 fw-semibold">Paklik</h1>
          <p class="text-body-secondary mb-0">Saját paklik és a bennük lévő kártyák.</p>
        </header>

        @if (errorMessage) {
          <div class="alert alert-danger" role="alert">{{ errorMessage }}</div>
        }

        <form class="row g-2 align-items-end mb-4" (ngSubmit)="createDeck()">
          <div class="col">
            <label class="form-label" for="deckName">Új pakli</label>
            <input
              id="deckName"
              name="deckName"
              class="form-control"
              maxlength="100"
              [(ngModel)]="newDeckName"
              [disabled]="isSavingDeck">
          </div>
          <div class="col-auto">
            <button type="submit" class="btn btn-primary" [disabled]="isSavingDeck">Létrehozás</button>
          </div>
        </form>

        @if (isLoadingDecks) {
          <div class="text-center py-4" role="status">
            <div class="spinner-border text-primary"></div>
          </div>
        } @else if (decks.length === 0) {
          <div class="alert alert-info">Még nincs paklid.</div>
        } @else {
          <div class="list-group mb-4">
            @for (deck of decks; track deck.id) {
              <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
                <button
                  type="button"
                  class="btn btn-link text-start text-decoration-none p-0"
                  [class.fw-semibold]="selectedDeckId === deck.id"
                  (click)="selectDeck(deck.id)">
                  {{ deck.name }}
                </button>
                <div class="d-flex gap-2">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    [disabled]="sharingDeckId === deck.id"
                    (click)="toggleShare(deck)">
                    {{ deck.isPublic ? 'Megosztás visszavonása' : 'Megosztás' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    [disabled]="deletingDeckId === deck.id"
                    (click)="deleteDeck(deck)">
                    Törlés
                  </button>
                </div>
              </div>
            }
          </div>
        }

        @if (selectedDeckId !== null) {
          <section class="border rounded p-3">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 class="h5 mb-0">{{ selectedDeckName() }}</h2>
              <div class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  [disabled]="isExporting"
                  (click)="exportDeck()">
                  Export
                </button>
                <label class="btn btn-outline-secondary btn-sm mb-0" [class.disabled]="isImporting">
                  Import
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    class="d-none"
                    [disabled]="isImporting"
                    (change)="importDeck($event)">
                </label>
              </div>
            </div>

            @if (importMessage) {
              <div class="alert alert-success" role="status">{{ importMessage }}</div>
            }

            <form (ngSubmit)="saveCard()">
              <div class="mb-3">
                <label class="form-label" for="term">Szó</label>
                <input id="term" name="term" class="form-control" maxlength="100" [(ngModel)]="term" [disabled]="isSavingCard">
              </div>
              <div class="mb-3">
                <label class="form-label" for="definition">Jelentés</label>
                <textarea id="definition" name="definition" class="form-control" rows="2" maxlength="500" [(ngModel)]="definition" [disabled]="isSavingCard"></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label" for="example">Példa</label>
                <textarea id="example" name="example" class="form-control" rows="2" maxlength="500" [(ngModel)]="example" [disabled]="isSavingCard"></textarea>
              </div>
              <div class="d-flex gap-2 mb-4">
                <button type="submit" class="btn btn-primary" [disabled]="isSavingCard">
                  {{ editingCardId === null ? 'Kártya felvétele' : 'Mentés' }}
                </button>
                @if (editingCardId !== null) {
                  <button type="button" class="btn btn-outline-secondary" [disabled]="isSavingCard" (click)="cancelEdit()">Mégse</button>
                }
              </div>
            </form>

            @if (isLoadingCards) {
              <div class="text-center py-3" role="status">
                <div class="spinner-border text-primary"></div>
              </div>
            } @else if (cards.length === 0) {
              <div class="alert alert-info mb-0">Ebben a pakliban még nincs kártya.</div>
            } @else {
              <div class="list-group">
                @for (card of cards; track card.id) {
                  <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start gap-2">
                      <div>
                        <div class="fw-semibold">{{ card.term }}</div>
                        <div>{{ card.definition }}</div>
                        @if (card.example) {
                          <div class="text-body-secondary">{{ card.example }}</div>
                        }
                      </div>
                      <div class="d-flex gap-2">
                        <button type="button" class="btn btn-outline-primary btn-sm" (click)="editCard(card)">Szerkesztés</button>
                        <button
                          type="button"
                          class="btn btn-outline-danger btn-sm"
                          [disabled]="deletingCardId === card.id"
                          (click)="deleteCard(card)">
                          Törlés
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        }

        <section class="mt-5">
          <h2 class="h4 mb-3">Közös paklik</h2>
          <form class="row g-2 align-items-end mb-3" (ngSubmit)="searchPublicDecks()">
            <div class="col">
              <label class="form-label" for="publicQuery">Keresés</label>
              <input
                id="publicQuery"
                name="publicQuery"
                class="form-control"
                [(ngModel)]="publicQuery"
                [disabled]="isLoadingPublic">
            </div>
            <div class="col-auto">
              <button type="submit" class="btn btn-outline-primary" [disabled]="isLoadingPublic">Keresés</button>
            </div>
          </form>

          @if (isLoadingPublic) {
            <div class="text-center py-3" role="status">
              <div class="spinner-border text-primary"></div>
            </div>
          } @else if (publicDecks.length === 0) {
            <div class="alert alert-info mb-0">Nincs közös pakli.</div>
          } @else {
            <div class="list-group">
              @for (deck of publicDecks; track deck.id) {
                <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <div class="fw-semibold">{{ deck.name }}</div>
                    <div class="text-body-secondary">{{ deck.cardCount }} kártya · {{ deck.ownerEmail }}</div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    [disabled]="copyingDeckId === deck.id"
                    (click)="copyDeck(deck)">
                    Másolás
                  </button>
                </div>
              }
            </div>
          }
        </section>
      </div>
    </main>
  `,
})
export class DecksComponent implements OnInit {
  private readonly http = inject(HttpClient);

  decks: Deck[] = [];
  publicDecks: PublicDeck[] = [];
  cards: VocabCard[] = [];
  selectedDeckId: number | null = null;
  newDeckName = '';
  publicQuery = '';
  term = '';
  definition = '';
  example = '';
  editingCardId: number | null = null;
  errorMessage: string | null = null;
  isLoadingDecks = false;
  isLoadingCards = false;
  isSavingDeck = false;
  isSavingCard = false;
  deletingDeckId: number | null = null;
  deletingCardId: number | null = null;
  sharingDeckId: number | null = null;
  copyingDeckId: number | null = null;
  isLoadingPublic = false;
  isExporting = false;
  isImporting = false;
  importMessage: string | null = null;

  ngOnInit(): void {
    this.loadDecks();
    this.searchPublicDecks();
  }

  selectedDeckName(): string {
    return this.decks.find(deck => deck.id === this.selectedDeckId)?.name ?? 'Pakli';
  }

  selectDeck(deckId: number): void {
    if (this.selectedDeckId === deckId) {
      return;
    }

    this.selectedDeckId = deckId;
    this.importMessage = null;
    this.cancelEdit();
    this.loadCards();
  }

  exportDeck(): void {
    if (this.selectedDeckId === null) {
      return;
    }

    this.errorMessage = null;
    this.isExporting = true;
    this.http.get(`/api/decks/${this.selectedDeckId}/export`, {
      observe: 'response',
      responseType: 'blob',
    }).pipe(
      finalize(() => {
        this.isExporting = false;
      }),
    ).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.errorMessage = 'A pakli exportja sikertelen.';
          return;
        }

        const fileName = this.fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? 'pakli.csv';
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error: HttpErrorResponse) => {
        this.readBlobError(error, 'A pakli exportja sikertelen.').then(message => {
          this.errorMessage = message;
        });
      },
    });
  }

  importDeck(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.selectedDeckId === null) {
      return;
    }

    const deckId = this.selectedDeckId;
    const reader = new FileReader();
    reader.onload = () => {
      const csv = typeof reader.result === 'string' ? reader.result : '';
      this.sendImport(deckId, csv);
    };
    reader.onerror = () => {
      this.errorMessage = 'A CSV fájl beolvasása sikertelen.';
    };
    reader.readAsText(file);
  }

  createDeck(): void {
    const name = this.newDeckName.trim();
    if (!name || name.length > 100) {
      this.errorMessage = 'A pakli neve kötelező, és legfeljebb 100 karakter lehet.';
      return;
    }

    this.errorMessage = null;
    this.isSavingDeck = true;
    this.http.post<Deck>('/api/decks', { name }).pipe(
      finalize(() => {
        this.isSavingDeck = false;
      }),
    ).subscribe({
      next: (deck) => {
        this.newDeckName = '';
        this.decks = [...this.decks, deck].sort((left, right) => left.id - right.id);
        this.selectDeck(deck.id);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli létrehozása sikertelen.');
      },
    });
  }

  toggleShare(deck: Deck): void {
    this.errorMessage = null;
    this.sharingDeckId = deck.id;
    this.http.put<Deck>(`/api/decks/${deck.id}/share`, { isPublic: !deck.isPublic }).pipe(
      finalize(() => {
        this.sharingDeckId = null;
      }),
    ).subscribe({
      next: (updated) => {
        this.decks = this.decks.map(item => item.id === updated.id ? updated : item);
        this.searchPublicDecks();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A megosztás módosítása sikertelen.');
      },
    });
  }

  searchPublicDecks(): void {
    this.isLoadingPublic = true;
    const params = this.publicQuery.trim() ? { q: this.publicQuery.trim() } : undefined;
    this.http.get<PublicDeck[]>('/api/decks/public', { params }).pipe(
      finalize(() => {
        this.isLoadingPublic = false;
      }),
    ).subscribe({
      next: (decks) => {
        this.publicDecks = decks;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A közös paklik betöltése sikertelen.');
      },
    });
  }

  copyDeck(deck: PublicDeck): void {
    this.errorMessage = null;
    this.copyingDeckId = deck.id;
    this.http.post<Deck>(`/api/decks/${deck.id}/copy`, {}).pipe(
      finalize(() => {
        this.copyingDeckId = null;
      }),
    ).subscribe({
      next: (copied) => {
        this.decks = [...this.decks, copied].sort((left, right) => left.id - right.id);
        this.selectDeck(copied.id);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli másolása sikertelen.');
      },
    });
  }

  deleteDeck(deck: Deck): void {
    this.errorMessage = null;
    this.deletingDeckId = deck.id;
    this.http.delete(`/api/decks/${deck.id}`).pipe(
      finalize(() => {
        this.deletingDeckId = null;
      }),
    ).subscribe({
      next: () => {
        this.decks = this.decks.filter(item => item.id !== deck.id);
        if (this.selectedDeckId === deck.id) {
          this.selectedDeckId = null;
          this.cards = [];
          this.cancelEdit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A pakli törlése sikertelen.');
      },
    });
  }

  editCard(card: VocabCard): void {
    this.editingCardId = card.id;
    this.term = card.term;
    this.definition = card.definition;
    this.example = card.example ?? '';
    this.errorMessage = null;
  }

  cancelEdit(): void {
    this.editingCardId = null;
    this.term = '';
    this.definition = '';
    this.example = '';
  }

  saveCard(): void {
    const term = this.term.trim();
    const definition = this.definition.trim();
    const example = this.example.trim();
    if (!term || term.length > 100 || !definition || definition.length > 500 || example.length > 500) {
      this.errorMessage = 'A szó és a jelentés kötelező. A szó legfeljebb 100, a jelentés és a példa legfeljebb 500 karakter.';
      return;
    }

    if (this.selectedDeckId === null) {
      return;
    }

    this.errorMessage = null;
    this.isSavingCard = true;
    const body = { term, definition, example: example || null };
    const request = this.editingCardId === null
      ? this.http.post<VocabCard>('/api/cards', { deckId: this.selectedDeckId, ...body })
      : this.http.put<VocabCard>(`/api/cards/${this.editingCardId}`, body);

    request.pipe(
      finalize(() => {
        this.isSavingCard = false;
      }),
    ).subscribe({
      next: (card) => {
        if (this.editingCardId === null) {
          this.cards = [...this.cards, card];
        } else {
          this.cards = this.cards.map(item => item.id === card.id ? card : item);
        }
        this.cancelEdit();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártya mentése sikertelen.');
      },
    });
  }

  deleteCard(card: VocabCard): void {
    this.errorMessage = null;
    this.deletingCardId = card.id;
    this.http.delete(`/api/cards/${card.id}`).pipe(
      finalize(() => {
        this.deletingCardId = null;
      }),
    ).subscribe({
      next: () => {
        this.cards = this.cards.filter(item => item.id !== card.id);
        if (this.editingCardId === card.id) {
          this.cancelEdit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártya törlése sikertelen.');
      },
    });
  }

  private sendImport(deckId: number, csv: string): void {
    this.errorMessage = null;
    this.importMessage = null;
    this.isImporting = true;
    this.http.post<ImportResult>(`/api/decks/${deckId}/import`, csv, {
      headers: { 'Content-Type': 'text/csv' },
    }).pipe(
      finalize(() => {
        this.isImporting = false;
      }),
    ).subscribe({
      next: (result) => {
        this.importMessage = `${result.importedCount} kártya került be.`;
        if (this.selectedDeckId === deckId) {
          this.loadCards();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A CSV import sikertelen.');
      },
    });
  }

  private fileNameFromDisposition(header: string | null): string | null {
    if (!header) {
      return null;
    }

    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (encoded?.[1]) {
      try {
        return decodeURIComponent(encoded[1].trim().replace(/"/g, ''));
      } catch {
        return encoded[1];
      }
    }

    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain?.[1]?.trim() ?? null;
  }

  private async readBlobError(error: HttpErrorResponse, fallback: string): Promise<string> {
    if (error.error instanceof Blob) {
      try {
        const text = await error.error.text();
        const parsed = JSON.parse(text) as ProblemDetails;
        if (typeof parsed.title === 'string' && parsed.title.trim()) {
          return parsed.title;
        }
      } catch {
        return fallback;
      }
    }

    return this.readError(error, fallback);
  }

  private loadDecks(): void {
    this.isLoadingDecks = true;
    this.http.get<Deck[]>('/api/decks').pipe(
      finalize(() => {
        this.isLoadingDecks = false;
      }),
    ).subscribe({
      next: (decks) => {
        this.decks = decks;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A paklik betöltése sikertelen.');
      },
    });
  }

  private loadCards(): void {
    if (this.selectedDeckId === null) {
      this.cards = [];
      return;
    }

    this.isLoadingCards = true;
    this.cards = [];
    this.http.get<VocabCard[]>(`/api/cards/by-deck/${this.selectedDeckId}`).pipe(
      finalize(() => {
        this.isLoadingCards = false;
      }),
    ).subscribe({
      next: (cards) => {
        this.cards = cards;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.readError(error, 'A kártyák betöltése sikertelen.');
      },
    });
  }

  private readError(error: HttpErrorResponse, fallback: string): string {
    const title = (error.error as ProblemDetails | null)?.title;
    if (typeof title === 'string' && title.trim()) {
      return title;
    }

    return fallback;
  }
}
