import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

export interface ActivityTile { id: number; label: string; }
export interface Activity {
  mode: 'match' | 'sort';
  targets: ActivityTile[];
  cards: ActivityTile[];
  graded?: boolean;
}
export interface Placement { cardId: number; targetId: number; }
interface AttemptState { placements: Placement[]; revision: number; finished: boolean; alreadySubmitted?: boolean; }

@Component({
  selector: 'app-assignment-activity-player',
  standalone: true,
  template: `
    @if (!readonlyMode() && !closed() && !finished()) { <p>Drag a card, or select a card and then select a target.</p> }
    @if (loading()) { <p role="status">Loading saved placements…</p> }
    @if (alreadySubmitted() && !finished()) { <p>Your earlier graded submission is saved. You can still finish this round.</p> }
    <div class="panel bank" (dragover)="$event.preventDefault()" (drop)="drop($event, 0)">
      <div class="heading"><h2>Card bank</h2>
        @if (!locked()) { <button type="button" [disabled]="selected() == null" (click)="place(0)">Return selected card</button> }
      </div>
      <div class="cards">
        @for (card of bank(); track card.id) {
          <button type="button" class="card" [disabled]="locked()" [draggable]="!locked()" [attr.aria-pressed]="selected() === card.id"
                  (dragstart)="beginDrag($event, card.id)" (click)="select(card.id)">{{ card.label }}</button>
        } @empty { <span>All cards placed.</span> }
      </div>
    </div>
    <div class="targets">
      @for (target of activity().targets; track target.id) {
        <article class="panel target" (dragover)="$event.preventDefault()" (drop)="drop($event, target.id)">
          <button type="button" class="target-label" [attr.aria-label]="'Place in ' + target.label"
                  [disabled]="locked() || selected() == null" (click)="place(target.id)">{{ target.label }}</button>
          <div class="cards">
            @for (card of cardsAt(target.id); track card.id) {
              <button type="button" class="card" [disabled]="locked()" [draggable]="!locked()"
                      [class.incorrect]="incorrect().includes(card.id) || reviewIncorrect().includes(card.id)"
                      [attr.aria-label]="reviewIncorrect().includes(card.id) ? card.label + ', incorrect placement'
                        : incorrect().includes(card.id) ? card.label + ', try another target' : null"
                      [attr.aria-pressed]="selected() === card.id"
                      (dragstart)="beginDrag($event, card.id)" (click)="select(card.id)">{{ card.label }}</button>
            } @empty { <span>Drop a card here</span> }
          </div>
        </article>
      }
    </div>
    <div class="heading"><p role="status">{{ announcement() }}</p>
      @if (!locked()) {
        <button type="button" [disabled]="!placedCount()" (click)="reset()">Start over</button>
      }
      @if (resource() && !readonlyMode() && !closed() && !finished()) {
        @if (!activity().graded) {
          <button type="button" [disabled]="loading() || sending() || !placedCount()" (click)="submit(true, false)">Check answers</button>
        }
        <button type="button" [disabled]="loading() || sending() || placedCount() !== activity().cards.length"
                (click)="submit(false, true)">{{ activity().graded && !alreadySubmitted() ? 'Submit activity' : 'Finish activity' }}</button>
      }
    </div>
    @if (resource() && !loading()) { <p role="status">{{ finished() ? 'Activity finished' : saveStatus() }}</p> }
    @if (error()) {
      <p class="error-note" role="alert">{{ error() }}</p>
      @if (dirty && !locked()) { <button type="button" (click)="submit(false, false)">Retry save</button> }
    }
  `,
  styles: [`
    .bank, .target { padding: 12px; }
    .heading, .cards { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .heading { justify-content: space-between; margin: 6px 0; }
    h2, p { margin: 0 0 8px; }
    h2 { font-size: 1.05rem; }
    .targets { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 10px; margin-top: 10px; }
    .target { min-height: 115px; border-style: dashed; }
    button { border: 1px solid #aabdc7; border-radius: 7px; background: #fff; color: #162d40; min-height: 40px; padding: 6px 10px; }
    .target-label { font-weight: 700; text-align: left; width: 100%; margin-bottom: 8px; background: #ecf6f2; }
    .target-label:disabled { opacity: 1; }
    .card { font-weight: 650; cursor: grab; }
    .card[aria-pressed=true] { background: #dce8ff; border-color: #2854a0; outline: 2px solid #2854a0; }
    .card.incorrect { border-color: #a14b16; background: #fff1df; }
    .card:disabled { opacity: 1; cursor: default; }
    span { font-size: .85rem; color: #465861; }
  `],
})
export class AssignmentActivityPlayerComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly activity = input.required<Activity>();
  readonly resource = input('');
  readonly closed = input(false);
  readonly readonlyMode = input(false);
  readonly display = input<Placement[] | null>(null);
  readonly reviewIncorrect = input<number[]>([]);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly finished = signal(false);
  readonly alreadySubmitted = signal(false);
  readonly incorrect = signal<number[]>([]);
  readonly error = signal('');
  readonly saveStatus = signal('');
  readonly locked = computed(() => this.loading() || this.sending() || this.finished() || this.closed() || this.readonlyMode());
  private timer?: number;
  private saving?: Promise<boolean>;
  private revision = 0;
  private stopped = false;
  dirty = false;
  readonly selected = signal<number | null>(null);
  readonly announcement = signal('');
  private readonly placements = signal(new Map<number, number>());
  private readonly cardOrder = signal<ActivityTile[]>([]);
  readonly placedCount = computed(() => this.placements().size);
  readonly bank = computed(() => this.cardsAt(0));

  constructor() {
    effect(() => {
      const cards = [...this.activity().cards];
      for (let index = cards.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [cards[index], cards[other]] = [cards[other], cards[index]];
      }
      this.cardOrder.set(cards);
      const display = this.display();
      const path = this.resource();
      if (display) this.restore(display);
      else if (path) void this.load(path);
      else this.restore([]);
    });
  }

  cardsAt(targetId: number): ActivityTile[] {
    return this.cardOrder().filter(card => (this.placements().get(card.id) ?? 0) === targetId);
  }

  select(cardId: number): void {
    if (this.locked()) return;
    this.selected.set(this.selected() === cardId ? null : cardId);
    const card = this.cardOrder().find(item => item.id === cardId);
    this.announcement.set(this.selected() !== null ? `${card?.label} selected. Choose a target.` : 'Selection cleared.');
  }

  beginDrag(event: DragEvent, cardId: number): void {
    if (this.locked()) return;
    event.dataTransfer?.setData('text/plain', String(cardId));
    this.selected.set(cardId);
  }

  drop(event: DragEvent, targetId: number): void {
    event.preventDefault();
    const cardId = Number(event.dataTransfer?.getData('text/plain'));
    if (cardId === this.selected()) this.place(targetId);
  }

  place(targetId: number): void {
    if (this.locked()) return;
    const cardId = this.selected();
    const card = this.cardOrder().find(item => item.id === cardId);
    const target = this.activity().targets.find(item => item.id === targetId);
    if (!card || (targetId !== 0 && !target)) return;
    this.placements.update(current => {
      const next = new Map(current);
      if (targetId === 0) next.delete(card.id);
      else {
        if (this.activity().mode === 'match') {
          const existing = this.cardsAt(targetId)[0];
          if (existing) next.delete(existing.id);
        }
        next.set(card.id, targetId);
      }
      return next;
    });
    this.selected.set(null);
    this.announcement.set(target ? `${card.label} placed in ${target.label}.` : `${card.label} returned to the card bank.`);
    this.changed();
  }

  reset(): void {
    if (this.locked()) return;
    this.restore([]);
    this.changed();
  }

  private restore(placements: Placement[]): void {
    this.selected.set(null);
    this.placements.set(new Map(placements.map(item => [item.cardId, item.targetId])));
    this.announcement.set('');
  }

  private async load(path: string): Promise<void> {
    this.loading.set(true);
    try {
      const state = await this.api.request<AttemptState>('GET', path);
      if (this.stopped) return;
      this.revision = state.revision;
      this.restore(state.placements);
      this.finished.set(state.finished);
      this.alreadySubmitted.set(state.alreadySubmitted ?? false);
      if (state.revision) this.saveStatus.set('Progress saved');
    } catch (error) { this.showError(error); }
    finally { this.loading.set(false); }
  }

  private changed(): void {
    this.incorrect.set([]);
    if (!this.resource()) return;
    this.dirty = true;
    this.saveStatus.set('Saving progress…');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.submit(false, false), 300);
  }

  async submit(check: boolean, finish: boolean): Promise<void> {
    if (!this.resource() || this.readonlyMode() || this.finished() || this.closed() || this.sending()) return;
    const manual = check || finish;
    if (!manual && !this.dirty) return;
    if (finish && this.activity().graded && !this.alreadySubmitted() && !window.confirm('Submit this activity to your teacher?')) return;
    window.clearTimeout(this.timer);
    if (manual) this.sending.set(true);
    try {
      while (this.saving) if (!await this.saving) return;
      if (this.closed() || this.finished() || (!manual && (!this.dirty || this.sending()))) return;
      const request = this.persist(check, finish);
      this.saving = request;
      try { await request; }
      finally { if (this.saving === request) this.saving = undefined; }
    } finally {
      if (manual) this.sending.set(false);
    }
  }

  private async persist(check: boolean, finish: boolean): Promise<boolean> {
    this.error.set('');
    try {
      const snapshot = this.placements();
      const placements = Array.from(snapshot, ([cardId, targetId]) => ({ cardId, targetId }));
      const result = await this.api.request<{ revision: number; finished: boolean; incorrect: number[] }>('PUT', this.resource(), {
        revision: this.revision, placements, check, finish,
      });
      this.revision = result.revision;
      this.finished.set(result.finished);
      this.dirty = this.placements() !== snapshot;
      this.saveStatus.set(this.dirty ? 'Saving progress…' : 'Progress saved');
      if (check) {
        this.incorrect.set(result.incorrect);
        this.announcement.set(result.incorrect.length ? 'Try another target for the marked cards.' : 'All placed cards are correct.');
      }
      return true;
    } catch (error) { this.showError(error); return false; }
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Unable to save activity progress.');
  }

  ngOnDestroy(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    if (this.dirty && !this.sending() && !this.closed()) void this.submit(false, false);
  }
}
