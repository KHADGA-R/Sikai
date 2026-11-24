import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { isCurrentLiveSlot, latestCompletedSlotId, LIVE_CLASS_JOIN_LEAD_MS, safeMeetingUrl } from '../core/live-classes';
import { LiveClassesService } from '../core/live-classes.service';
import { FlowPreview, NoteKind, NotePatch, StickyNote, WhiteboardNoteComponent } from './whiteboard-note.component';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { ClassroomVideoComponent } from './classroom-video.component';
import type { ClassroomView } from './classroom-video.component';

type Shape = 'line' | 'rectangle' | 'ellipse' | 'circle' | 'arrow';
type Tool = 'pen' | 'highlighter' | 'text' | Shape;
type StrokeStyle = 'solid' | 'dashed' | 'dotted';
interface Point { x: number; y: number; }
interface Drawing { tool: Tool; color: string; points: Point[]; label: string; strokeStyle?: StrokeStyle; strokeWidth?: number; }
interface Mark extends Drawing { id: string; authorId: string; authorName: string; }
interface Slide { id: string; title: string; hasImage: boolean; }
interface Board {
  revision: number;
  subject: string;
  instructor: boolean;
  instructorId: string;
  meetingUrl: string;
  start: number;
  end: number;
  sikaiVideo: boolean;
  slides: Slide[];
  marks: (Omit<Mark, 'points'> & { points: string })[];
  erasures?: { markId: string; gestureId: string; points: string; radius?: number }[];
  notes?: StickyNote[];
  supportsFlowPreviews?: boolean;
  supportsActivityWidgets?: boolean;
  supportsHistogram?: boolean;
}

@Component({
  standalone: true,
  imports: [RouterLink, WhiteboardNoteComponent, ThemeIconComponent, ClassroomVideoComponent],
  templateUrl: './whiteboard.component.html',
  styleUrl: './whiteboard.component.css',
})
export class WhiteboardComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(LiveClassesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly slotId = this.route.snapshot.paramMap.get('slotId')!;
  readonly autoJoinVideo = this.route.snapshot.queryParamMap.get('video') === 'join';
  private readonly resource = '/live-classes/slots/' + encodeURIComponent(this.slotId) + '/whiteboard';
  readonly blank: Slide = { id: 'blank', title: 'Whiteboard', hasImage: false };
  readonly selected = signal<Slide>(this.blank);
  readonly board = signal<Board | null>(null);
  readonly image = signal('');
  readonly now = signal(Date.now());
  readonly tool = signal<Tool | 'eraser'>('pen');
  readonly drawingTools = [
    { tool: 'pen', label: 'Pen' },
    { tool: 'highlighter', label: 'Highlighter' },
    { tool: 'text', label: 'Text' },
    { tool: 'eraser', label: 'Eraser' },
  ] as const;
  readonly shapes: readonly { tool: Shape; label: string; glyph: string }[] = [
    { tool: 'line', label: 'Line', glyph: '╱' },
    { tool: 'rectangle', label: 'Rectangle', glyph: '▭' },
    { tool: 'ellipse', label: 'Ellipse', glyph: '⬭' },
    { tool: 'circle', label: 'Circle', glyph: '○' },
    { tool: 'arrow', label: 'Arrow', glyph: '↗' },
  ];
  readonly activeShape = computed(() => this.shapes.find(shape => shape.tool === this.tool())?.tool ?? '');
  readonly insertTools = [
    { kind: 'table', label: 'Table', icon: 'table' },
    { kind: 'graph', label: 'Bar graph', icon: 'bar-graph' },
    { kind: 'histogram', label: 'Histogram', icon: 'histogram' },
    { kind: 'pie', label: 'Pie chart', icon: 'pie' },
    { kind: 'flowchart', label: 'Flowchart', icon: 'flowchart' },
    { kind: 'timer', label: 'Countdown timer', icon: 'timer' },
  ] as const;
  readonly strokeStyles = [
    { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' },
  ] as const;
  readonly penTips = [
    { width: 2, label: 'Fine' }, { width: 4, label: 'Medium' }, { width: 8, label: 'Bold' },
  ] as const;
  readonly strokeStyle = signal<StrokeStyle>('solid');
  readonly penWidth = signal<number>(4);
  readonly color = signal('#004c45');
  readonly text = signal('');
  readonly draft = signal<Drawing | null>(null);
  readonly eraserRadius = signal(15);
  readonly eraserStrokeRadius = signal(15);
  readonly eraserCursor = signal<Point | null>(null);
  readonly eraserStroke = signal<Point[]>([]);
  readonly layer = signal('all');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly syncError = signal('');
  readonly title = signal('');
  private revision = -1;
  private requestId = 0;
  private pendingRead = false;
  private pendingNoteWrites = 0;
  private noteWrites = Promise.resolve();
  private pointer: number | undefined;
  readonly userId = computed(() => this.auth.user()?.id);
  readonly slides = computed(() => [this.blank, ...(this.board()?.slides ?? [])]);
  readonly notes = computed(() => this.board()?.notes ?? []);
  readonly flowPreviews = signal<Partial<Record<string, FlowPreview>>>({});
  private localFlowPreview: FlowPreview | null = null;
  private previewRequestPending = false;
  readonly marks = computed<Mark[]>(() => this.board()?.marks.map(mark => ({
    ...mark, points: JSON.parse(mark.points) as Point[],
  })) ?? []);
  readonly participants = computed(() => Array.from(new Map(this.marks().map(mark => [mark.authorId, mark.authorName]))));
  readonly visibleMarks = computed(() => this.marks().filter(mark =>
    this.layer() === 'all' || mark.authorId === this.layer()));
  readonly drawings = computed(() => {
    const draft = this.draft();
    return draft ? [...this.visibleMarks(), { ...draft, id: 'draft', authorId: '', authorName: 'You' }] : this.visibleMarks();
  });
  readonly lastOwnMark = computed(() => this.marks().filter(mark => mark.authorId === this.userId()).at(-1));
  readonly masks = computed(() => {
    const masks = new Map<string, { path: string; radius: number }[]>();
    for (const erasure of this.board()?.erasures ?? []) {
      const paths = masks.get(erasure.markId) ?? [];
      paths.push({ path: this.strokePath(JSON.parse(erasure.points) as Point[]), radius: erasure.radius ?? 15 });
      masks.set(erasure.markId, paths);
    }
    return masks;
  });
  readonly eraserPreview = computed(() => {
    const points = this.eraserStroke();
    return points.length ? this.strokePath(points) : null;
  });
  readonly meetingLink = computed(() => {
    const board = this.board();
    const now = this.now();
    return board && now < board.end && (board.instructor || now >= board.start - LIVE_CLASS_JOIN_LEAD_MS) &&
      safeMeetingUrl(board.meetingUrl) ? board.meetingUrl : '';
  });
  readonly videoOpen = computed(() => {
    const board = this.board(), now = this.now();
    return !!board?.sikaiVideo && now >= board.start - LIVE_CLASS_JOIN_LEAD_MS && now < board.end;
  });
  readonly whiteboardOpen = computed(() => {
    const room = this.board();
    const now = this.now();
    return !!room && (isCurrentLiveSlot(room, now) || latestCompletedSlotId(this.live.state(), now) === this.slotId);
  });
  readonly slidesOpen = signal(true);
  readonly wideClassroom = signal(window.matchMedia('(min-width: 920px)').matches);
  private readonly requestedView = signal<ClassroomView>('whiteboard');
  private selectedViewManually = false;
  readonly boardShare = signal(52);
  readonly classroomView = computed<ClassroomView>(() => {
    if (!this.whiteboardOpen()) return 'presentation';
    const view = this.requestedView();
    return view === 'split' && !this.wideClassroom() ? 'whiteboard' : view;
  });
  private splitPointer?: number;

  constructor() {
    void this.refresh(true);
    const timer = window.setInterval(() => {
      this.now.set(Date.now());
      if (!document.hidden && !this.busy()) void this.refresh();
    }, 2000);
    const previewTimer = window.setInterval(() => void this.syncFlowPreviews(), 450);
    const viewport = window.matchMedia('(min-width: 920px)');
    const onResize = (event: MediaQueryListEvent) => this.wideClassroom.set(event.matches);
    viewport.addEventListener('change', onResize);
    inject(DestroyRef).onDestroy(() => {
      window.clearInterval(timer);
      window.clearInterval(previewTimer);
      viewport.removeEventListener('change', onResize);
      this.requestId++;
    });
  }

  setFlowPreview(noteId: string, preview: FlowPreview | null): void {
    if (preview || this.localFlowPreview?.noteId === noteId) this.localFlowPreview = preview;
  }

  private async syncFlowPreviews(): Promise<void> {
    const notes = this.notes();
    const room = this.board();
    if (!room?.supportsFlowPreviews || this.now() < room.start || this.now() >= room.end ||
      !this.whiteboardOpen() || !notes.some(note => note.kind === 'flowchart')) {
      if (Object.keys(this.flowPreviews()).length) this.flowPreviews.set({});
      return;
    }
    if (this.previewRequestPending || document.hidden) return;
    const slideId = this.selected().id;
    const local = this.localFlowPreview;
    this.previewRequestPending = true;
    try {
      const previews = await this.api.request<FlowPreview[]>('POST', this.resource + '/flow-previews', {
        slideId,
        preview: local && notes.some(note => note.id === local.noteId) ? local : null,
      });
      if (this.selected().id === slideId) {
        this.flowPreviews.set(Object.fromEntries(previews.map(preview => [preview.noteId, preview])));
      }
    } catch {
      this.flowPreviews.set({});
    } finally {
      this.previewRequestPending = false;
    }
  }

  selectView(view: ClassroomView): void {
    this.selectedViewManually = true;
    this.requestedView.set(view);
    if (view === 'split') this.slidesOpen.set(false);
  }

  onShareChanged(sharing: boolean): void {
    if (!this.selectedViewManually) this.requestedView.set(sharing ? 'presentation' : 'whiteboard');
  }

  leaveClassroom(): void {
    void this.router.navigate(['/live-classes'], { queryParams: { view: 'bookings' } });
  }

  startSplit(event: PointerEvent, divider: HTMLElement): void {
    if (event.button !== 0 || this.splitPointer !== undefined) return;
    event.preventDefault();
    divider.focus();
    divider.setPointerCapture(event.pointerId);
    this.splitPointer = event.pointerId;
  }

  resizeSplit(event: PointerEvent, layout: HTMLElement): void {
    if (event.pointerId !== this.splitPointer) return;
    const bounds = layout.getBoundingClientRect();
    if (bounds.width) this.setBoardShare((event.clientX - bounds.left) / bounds.width * 100);
  }

  finishSplit(event: PointerEvent): void {
    if (event.pointerId === this.splitPointer) this.splitPointer = undefined;
  }

  keyboardSplit(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.setBoardShare(this.boardShare() + (event.key === 'ArrowRight' ? 3 : -3));
  }

  private setBoardShare(value: number): void {
    this.boardShare.set(Math.max(30, Math.min(70, Math.round(value))));
  }

  private async refresh(force = false): Promise<void> {
    if (this.pendingRead && !force) return;
    const id = ++this.requestId;
    const slide = this.selected().id;
    this.pendingRead = true;
    try {
      const result = await this.api.request<Board | { unchanged: true }>('GET',
        this.resource + '?slideId=' + encodeURIComponent(slide) + '&revision=' + (force ? -1 : this.revision));
      if (id !== this.requestId || (!force && this.pendingNoteWrites)) return;
      this.syncError.set('');
      if ('unchanged' in result) return;
      this.revision = result.revision;
      this.board.set(result);
      if (this.layer() !== 'all' && !result.marks.some(mark => mark.authorId === this.layer())) this.layer.set('all');
    } catch (error) {
      if (id !== this.requestId) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.revision = -1;
        this.board.set(null);
        this.image.set('');
      }
      const missingEndpoint = error instanceof ApiError && error.status === 404 && error.message === 'Endpoint not found';
      this.syncError.set(missingEndpoint
        ? 'The running Sikai backend does not include the whiteboard. Restart it with the current code, then refresh this page.'
        : this.message(error));
    } finally {
      if (id === this.requestId) this.pendingRead = false;
    }
  }

  async select(slide: Slide): Promise<void> {
    this.localFlowPreview = null;
    this.flowPreviews.set({});
    this.cancelStroke();
    this.selected.set(slide);
    this.layer.set('all');
    this.image.set('');
    this.board.update(board => board && { ...board, marks: [], erasures: [], notes: [] });
    await Promise.all([this.refresh(true), this.loadImage(slide)]);
  }

  private async loadImage(slide: Slide): Promise<void> {
    if (!slide.hasImage) return;
    try {
      const { image } = await this.api.request<{ image: string }>('GET', this.resource + '/slides/' + encodeURIComponent(slide.id));
      if (this.selected().id === slide.id) this.image.set(image);
    } catch (error) {
      if (this.selected().id === slide.id) this.error.set(this.message(error));
    }
  }

  setTool(tool: Tool | 'eraser'): void {
    this.cancelStroke();
    this.tool.set(tool);
    if (tool !== 'eraser') this.color.set(tool === 'highlighter' ? '#ffd34e' : '#004c45');
  }

  selectShape(value: string): void {
    const shape = this.shapes.find(option => option.tool === value);
    if (shape) this.setTool(shape.tool);
  }

  startStroke(event: PointerEvent, surface: Element): void {
    const tool = this.tool();
    if (event.button !== 0 || this.busy() || this.pointer !== undefined) return;
    const point = this.point(event, surface);
    if (tool === 'eraser') {
      this.pointer = event.pointerId;
      surface.setPointerCapture(event.pointerId);
      this.eraserCursor.set(point);
      this.eraserStrokeRadius.set(this.eraserRadius());
      this.eraserStroke.set([point]);
      return;
    }
    if (tool === 'text') {
      if (!this.text().trim()) {
        this.error.set('Enter the text you want to place on the board.');
        return;
      }
      void this.save({ tool: 'text', color: this.color(), points: [point], label: this.text() });
      return;
    }
    this.pointer = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    this.draft.set({
      tool, color: this.color(), points: [point], label: '',
      strokeStyle: this.isShape(tool) ? this.strokeStyle() : 'solid',
      strokeWidth: tool === 'pen' ? this.penWidth() : tool === 'highlighter' ? 20 : 4,
    });
  }

  moveStroke(event: PointerEvent, surface: Element): void {
    if (this.tool() === 'eraser') {
      const point = this.point(event, surface);
      this.eraserCursor.set(point);
      if (this.pointer === event.pointerId) this.eraserStroke.update(points => this.extendStroke(points, point));
      return;
    }
    const draft = this.draft();
    if (this.pointer !== event.pointerId || !draft) return;
    const point = this.point(event, surface);
    if (this.isShape(draft.tool)) {
      this.draft.set({ ...draft, points: [draft.points[0], point] });
      return;
    }
    this.draft.set({ ...draft, points: this.extendStroke(draft.points, point) });
  }

  finishStroke(event: PointerEvent, surface: Element): void {
    if (this.pointer !== event.pointerId) return;
    if (this.tool() === 'eraser') {
      const points = this.extendStroke(this.eraserStroke(), this.point(event, surface));
      const radius = this.eraserStrokeRadius();
      this.pointer = undefined;
      this.eraserStroke.set(points);
      void this.saveErasure(surface, points, radius).finally(() => this.eraserStroke.set([]));
      return;
    }
    const draft = this.draft();
    this.cancelStroke();
    if (!draft) return;
    const point = this.point(event, surface);
    if (this.isShape(draft.tool)) {
      const start = draft.points[0];
      if (Math.hypot(point.x - start.x, point.y - start.y) >= 0.002) {
        void this.save({ ...draft, points: [start, point] });
      }
      return;
    }
    const last = draft.points.at(-1)!;
    const points = point.x === last.x && point.y === last.y ? draft.points : [...draft.points, point];
    void this.save({ ...draft, points });
  }

  cancelStroke(): void {
    this.pointer = undefined;
    this.draft.set(null);
    this.eraserStroke.set([]);
  }

  cancelPointer(event: PointerEvent): void {
    if (this.pointer === event.pointerId) this.cancelStroke();
  }

  private extendStroke(points: Point[], point: Point): Point[] {
    const last = points.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.002) return points;
    const retained = points.length >= 179 ? points.filter((_, index) => index % 2 === 0) : points;
    return [...retained, point];
  }

  resizeEraser(event: WheelEvent, surface: Element): void {
    if (this.tool() !== 'eraser' || !event.deltaY || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (this.pointer !== undefined) return;
    this.eraserRadius.update(radius => Math.min(30, Math.max(6, radius - Math.sign(event.deltaY) * 3)));
    this.eraserCursor.set(this.point(event, surface));
  }

  private point(event: MouseEvent, surface: Element): Point {
    const rect = surface.getBoundingClientRect();
    const normalize = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(4));
    return { x: normalize((event.clientX - rect.x) / rect.width), y: normalize((event.clientY - rect.y) / rect.height) };
  }

  private isShape(tool: Tool): tool is Shape {
    return this.shapes.some(shape => shape.tool === tool);
  }

  outline(mark: Drawing): string {
    const first = mark.points[0];
    const last = mark.points.at(-1)!;
    const x = first.x * 1000, y = first.y * 562;
    const endX = last.x * 1000, endY = last.y * 562;
    switch (mark.tool) {
      case 'line':
        return `M ${x} ${y} L ${endX} ${endY}`;
      case 'rectangle':
        return `M ${x} ${y} H ${endX} V ${endY} H ${x} Z`;
      case 'ellipse': {
        const rx = Math.abs(endX - x) / 2, ry = Math.abs(endY - y) / 2;
        const left = Math.min(x, endX), right = Math.max(x, endX), centerY = (y + endY) / 2;
        return `M ${left} ${centerY} A ${rx} ${ry} 0 1 0 ${right} ${centerY} A ${rx} ${ry} 0 1 0 ${left} ${centerY}`;
      }
      case 'circle': {
        const radius = Math.hypot(endX - x, endY - y);
        return `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y}`;
      }
      case 'arrow': {
        const angle = Math.atan2(endY - y, endX - x);
        const size = Math.min(20, Math.hypot(endX - x, endY - y) * 0.4);
        const wing = (offset: number) => `${endX - size * Math.cos(angle + offset)} ${endY - size * Math.sin(angle + offset)}`;
        return `M ${x} ${y} L ${endX} ${endY} M ${wing(-0.55)} L ${endX} ${endY} L ${wing(0.55)}`;
      }
      default:
        return this.strokePath(mark.points);
    }
  }

  private strokePath(points: Point[]): string {
    const path = 'M ' + points.map(point => (point.x * 1000) + ' ' + (point.y * 562)).join(' L ');
    return points.length === 1 ? path + ' h 0.1' : path;
  }

  width(mark: Drawing): number {
    return mark.strokeWidth ?? (mark.tool === 'highlighter' ? 20 : 4);
  }

  dashArray(mark: Drawing): string | null {
    const width = this.width(mark);
    if (mark.strokeStyle === 'dashed') return `${width * 3} ${width * 2}`;
    if (mark.strokeStyle === 'dotted') return `0.1 ${width * 2.25}`;
    return null;
  }

  private async save(drawing: Drawing): Promise<void> {
    const slideId = this.selected().id;
    await this.write(async () => {
      await this.api.request('POST', this.resource + '/marks', { slideId, ...drawing });
    });
  }

  async undo(): Promise<void> {
    const mark = this.lastOwnMark();
    if (mark) await this.removeMark(mark.id);
  }

  private async saveErasure(surface: Element, points: Point[], radius: number): Promise<void> {
    const marks = Array.from(surface.querySelectorAll<SVGGraphicsElement>('[data-erase-id]'));
    const ids = marks.filter(mark => {
      const box = mark.getBBox();
      const padding = radius + 10;
      return points.some((point, index) => {
        const previous = points[Math.max(0, index - 1)];
        return Math.min(point.x, previous.x) * 1000 <= box.x + box.width + padding
          && Math.max(point.x, previous.x) * 1000 >= box.x - padding
          && Math.min(point.y, previous.y) * 562 <= box.y + box.height + padding
          && Math.max(point.y, previous.y) * 562 >= box.y - padding;
      });
    }).map(mark => mark.getAttribute('data-erase-id'));
    if (!ids.length) return;
    const slideId = this.selected().id;
    await this.write(async () => {
      await this.api.request('POST', this.resource + '/erasures', { slideId, markIds: ids, points, radius });
    });
  }

  private async removeMark(id: string): Promise<void> {
    await this.write(async () => { await this.api.request('DELETE', this.resource + '/marks/' + id); });
  }

  addNote(color: StickyNote['color'], kind: NoteKind = 'sticky', histogram = false, widget?: 'pie' | 'timer'): void {
    const slideId = this.selected().id;
    this.queueNoteWrite(async () => {
      await this.api.request('POST', this.resource + '/notes', { slideId, color, kind, histogram, widget });
    });
  }

  changeNote(id: string, patch: NotePatch): void {
    this.board.update(board => board && {
      ...board,
      notes: board.notes?.map(note => note.id === id
        ? { ...note, ...patch.bounds, text: patch.text ?? note.text }
        : note),
    });
    this.queueNoteWrite(async () => {
      await this.api.request('PATCH', this.resource + '/notes/' + id, patch);
    });
  }

  addSelectedNote(select: HTMLSelectElement): void {
    const color = select.value;
    if (color === 'yellow' || color === 'pink') this.addNote(color);
    select.value = '';
  }

  closeInsertMenu(menu: HTMLDetailsElement, trigger: HTMLElement): void {
    trigger.focus();
    menu.open = false;
  }

  insertLearningTool(kind: typeof this.insertTools[number]['kind']): void {
    const widget = kind === 'pie' || kind === 'timer' ? kind : undefined;
    if (!this.board()?.supportsHistogram || (widget && !this.board()?.supportsActivityWidgets)) {
      this.error.set('Restart the Sikai backend with the current code, then reload this page to use the Insert tools.');
      return;
    }
    if (kind === 'pie' || kind === 'timer' || kind === 'histogram') {
      this.addNote('yellow', 'graph', kind === 'histogram', widget);
    } else {
      this.addNote('yellow', kind);
    }
  }

  deleteNote(id: string): void {
    this.queueNoteWrite(async () => {
      await this.api.request('DELETE', this.resource + '/notes/' + id);
    });
  }

  private queueNoteWrite(action: () => Promise<void>): void {
    this.pendingNoteWrites++;
    this.error.set('');
    this.noteWrites = this.noteWrites.then(action).catch(error => {
      this.error.set(this.message(error));
    }).finally(async () => {
      this.pendingNoteWrites--;
      if (!this.pendingNoteWrites) await this.refresh(true);
    });
  }

  async addSlide(file?: File): Promise<void> {
    const title = this.title().trim() || file?.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'Blank slide';
    await this.write(async () => {
      if (file && (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
        throw new Error('Choose a PNG, JPEG or WebP image under 2 MB.');
      }
      const image = file ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read the slide image.'));
        reader.readAsDataURL(file);
      }) : '';
      const data = await this.api.request<{ id: string }>('POST', this.resource + '/slides', { title, image });
      this.title.set('');
      await this.select({ id: data.id, title, hasImage: !!image });
    }, false);
  }

  private async write(action: () => Promise<void>, refresh = true): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      if (refresh) await this.refresh(true);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  private message(error: unknown): string {
    if (error instanceof ApiError && error.status === 400 && error.message.includes('"pen|highlighter|text"')) {
      return 'The running Sikai backend is using the original whiteboard tools. Restart it with the current code to draw shapes.';
    }
    return error instanceof Error ? error.message : 'Unable to update the whiteboard.';
  }
}
