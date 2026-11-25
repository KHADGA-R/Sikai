import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { downloadAssignmentFile } from './assignment-files';
import { DrawingPoint, StrokeStyle, drawingOutline } from './whiteboard-drawing';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

type Shape = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'circle';
type InkTool = Shape | 'pen' | 'highlighter' | 'text';
type Tool = InkTool | 'eraser' | 'scroll';
interface Mark {
  page: number;
  tool: InkTool;
  color: string;
  points: DrawingPoint[];
  text?: string;
  width?: number;
  style?: StrokeStyle;
}
interface Workspace {
  assignment: { title: string; instructions: string; fileName?: string };
  revision: number;
  marks: Mark[];
  submitted?: boolean;
}

@Component({
  standalone: true,
  imports: [RouterLink, ThemeIconComponent],
  template: `
    <section class="container section board-page">
      <a [routerLink]="backLink" [queryParams]="backQuery">{{ readOnly && studentId !== 'me' ? 'Back to submissions' : 'Back to assignments' }}</a>
      @if (assignment(); as info) {
        <h1>{{ info.title }}</h1>
        @if (readOnly) { <p>Submitted whiteboard</p> }
        @if (info.instructions) { <p class="instructions">{{ info.instructions }}</p> }
      }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (failedPage(); as failed) {
        <div class="toolbar">
          <button type="button" (click)="showPage(failed)">Retry page {{ failed }}</button>
          <button type="button" [disabled]="downloading()" (click)="downloadWorksheet()">Download worksheet</button>
        </div>
      } @else if (loadFailed()) {
        <div class="toolbar">
          <button type="button" (click)="retryWorksheet()">Retry worksheet</button>
          @if (assignment()) {
            <button type="button" [disabled]="downloading()" (click)="downloadWorksheet()">Download worksheet</button>
          }
        </div>
      }
      @if (downloadError()) { <p role="alert">{{ downloadError() }}</p> }
      @if (worksheet()) {
        <div class="panel workspace">
          @if (!readOnly) {
          <div class="toolbar" role="group" aria-label="Annotation tools">
            @for (option of tools; track option.id) {
              <button type="button" class="icon-button" [attr.aria-label]="option.label" [attr.title]="option.label"
                      [attr.aria-pressed]="tool() === option.id" (click)="tool.set(option.id)">
                <app-theme-icon [name]="option.id" />
              </button>
            }
            <label class="shape-control" title="Shape">
              <app-theme-icon [name]="activeShape() || 'shapes'" />
              <select aria-label="Shape" [value]="activeShape()" (change)="chooseShape($any($event.target).value)">
                <option value="">Shape</option>
                @for (shape of shapes; track shape.id) {
                  <option [value]="shape.id">{{ shape.label }}</option>
                }
              </select>
            </label>
            <button type="button" class="icon-button" aria-label="Undo" title="Undo" [disabled]="!canUndo()" (click)="undo()">
              <app-theme-icon name="undo" />
            </button>
            <button type="button" class="icon-button" aria-label="Redo" title="Redo" [disabled]="!redoHistory().length" (click)="redo()">
              <app-theme-icon name="redo" />
            </button>
          </div>
          @if (tool() !== 'eraser' && tool() !== 'scroll') {
            <div class="toolbar" role="group" aria-label="Ink settings">
              <label [attr.title]="tool() === 'highlighter' ? 'Highlight color' : 'Ink color'">
                <app-theme-icon name="palette" />
                <input type="color" [attr.aria-label]="tool() === 'highlighter' ? 'Highlight color' : 'Ink color'"
                       [value]="tool() === 'highlighter' ? highlightColor : color" (input)="setColor($any($event.target).value)" />
              </label>
              <label>{{ tool() === 'text' ? 'Text size' : 'Thickness' }}
                <select [value]="size()" (change)="size.set(+$any($event.target).value)">
                  <option value="2">Fine</option><option value="3">Medium</option><option value="6">Bold</option>
                </select>
              </label>
              @if (activeShape()) {
                <label>Stroke
                  <select [value]="style()" (change)="style.set($any($event.target).value)">
                    <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                  </select>
                </label>
              }
            </div>
          }
          @if (tool() === 'text') {
            <label class="caption">Text to place
              <input #caption type="text" maxlength="240" [value]="annotation" (input)="annotation = caption.value" />
              <small>Type your answer, then tap the worksheet where it belongs.</small>
            </label>
          }
          }
          <div class="page-controls">
            @if (pageCount() > 1) {
              <button type="button" [disabled]="rendering() || page() <= 1" (click)="showPage(page() - 1)">Previous page</button>
              <span>Page {{ page() }} of {{ pageCount() }}</span>
              <button type="button" [disabled]="rendering() || page() >= pageCount()" (click)="showPage(page() + 1)">Next page</button>
            }
            @if (!readOnly) {
            <span class="save-status" role="status">{{ saveStatus() }}</span>
            @if (saveFailed()) {
              <button type="button" (click)="save()">Retry save</button>
            }
            @if (submitted()) {
              <a [routerLink]="backLink" [queryParams]="submittedBackQuery">View assignment status</a>
            } @else {
              <button type="button" class="submit-button" [disabled]="!hasMarks() || submitting()" (click)="submit()">
                {{ submitting() ? 'Submitting…' : 'Submit from whiteboard' }}
              </button>
            }
            }
          </div>
          <div class="sheet">
            <img [src]="worksheet()" alt="Assignment worksheet, page {{ page() }}" draggable="false" />
            <svg aria-label="Worksheet annotations" [class.scroll]="readOnly || tool() === 'scroll'" [class.erase]="tool() === 'eraser'"
                 [attr.viewBox]="'0 0 1000 ' + height()"
                 (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="finish($event)"
                 (pointercancel)="cancel($event)" (lostpointercapture)="cancel($event)">
              @for (mark of pageMarks(); track mark; let index = $index) {
                @if (!erasing().has(mark)) {
                  @if (mark.tool === 'text') {
                    <text [attr.data-mark]="index" [attr.x]="mark.points[0].x * 1000" [attr.y]="mark.points[0].y * height()"
                          [style.font-size.px]="mark.width ? 16 + mark.width * 2 : 22"
                          [attr.fill]="mark.color" dominant-baseline="hanging">{{ mark.text }}</text>
                  } @else {
                    @if (tool() === 'eraser') {
                      <path class="eraser-target" [attr.data-mark]="index" [attr.d]="outline(mark)" />
                    }
                    <path [attr.data-mark]="index" [attr.d]="outline(mark)" [attr.stroke]="mark.color"
                          [attr.stroke-width]="mark.width ?? 3" [attr.stroke-dasharray]="dash(mark)"
                          [attr.opacity]="mark.tool === 'highlighter' ? .36 : 1" />
                  }
                }
              }
              @if (draft(); as mark) {
                <path [attr.d]="outline(mark)" [attr.stroke]="mark.color" [attr.stroke-width]="mark.width ?? 3"
                      [attr.stroke-dasharray]="dash(mark)" [attr.opacity]="mark.tool === 'highlighter' ? .36 : 1" />
              }
            </svg>
          </div>
          @if (rendering()) { <p role="status">Loading page…</p> }
        </div>
      } @else if (!error()) { <p role="status">Loading worksheet…</p> }
    </section>
  `,
  styles: [`
    .board-page { max-width: 1040px; }
    h1 { margin: 12px 0; overflow-wrap: anywhere; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .workspace { padding: 12px; }
    .toolbar, .page-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    button { background: white; color: #17212f; border: 1px solid #bcc7c5; border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button[aria-pressed=true] { background: #d7ece5; border-color: #467e71; font-weight: 650; }
    button.submit-button { background: #0754a8; border-color: #0754a8; color: white; }
    button:disabled { opacity: .55; cursor: default; }
    .toolbar label { display: flex; align-items: center; gap: 6px; margin: 0; }
    .toolbar app-theme-icon { width: 18px; height: 18px; }
    .icon-button { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; }
    .shape-control { color: #17212f; }
    .toolbar select { width: auto; min-height: 30px; padding: 3px 6px; color: #17212f; }
    input[type=color] { width: 35px; height: 32px; padding: 3px; }
    .caption { display: grid; max-width: 440px; gap: 4px; margin-bottom: 10px; }
    .save-status { margin-left: auto; color: #344840; font-size: .875rem; }
    .sheet { position: relative; background: white; border: 1px solid #d0d8d5; }
    img { display: block; width: 100%; height: auto; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; user-select: none; }
    svg.scroll { touch-action: auto; cursor: grab; }
    svg.erase { cursor: cell; }
    path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .eraser-target { stroke: transparent; stroke-width: 18; pointer-events: stroke; }
    text { font: 22px sans-serif; paint-order: stroke; stroke: white; stroke-width: 2px; stroke-linejoin: round; }
    [role=alert] { color: #9c1731; overflow-wrap: anywhere; }
  `],
})
export class AssignmentWhiteboardComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly courseId = this.route.snapshot.paramMap.get('id');
  readonly assignmentId = this.route.snapshot.paramMap.get('assignmentId');
  readonly studentId = this.route.snapshot.paramMap.get('studentId');
  readonly readOnly = this.studentId !== null;
  private readonly returnParams = this.route.snapshot.queryParamMap;
  readonly backLink = this.readOnly && this.studentId !== 'me'
    ? ['/courses', this.courseId, 'assignments', this.assignmentId, 'submissions']
    : this.returnParams.get('from') === 'dashboard' || this.readOnly && this.returnParams.get('from') !== 'course'
      ? ['/my-assignments'] : ['/courses', this.courseId, 'assignments'];
  readonly backQuery = {
    course: this.returnParams.get('course'),
    lesson: this.returnParams.get('lesson'),
    status: this.returnParams.get('status'),
    sort: this.returnParams.get('sort'),
    kind: this.returnParams.get('kind'),
  };
  readonly submittedBackQuery = { ...this.backQuery, status: null };
  private readonly path = '/courses/' + this.courseId + '/assignments/' +
    encodeURIComponent(this.assignmentId ?? '');
  readonly tools: { id: Tool; label: string }[] = [
    { id: 'pen', label: 'Pen' }, { id: 'highlighter', label: 'Highlighter' }, { id: 'text', label: 'Text' },
    { id: 'eraser', label: 'Eraser' }, { id: 'scroll', label: 'Scroll' },
  ];
  readonly shapes: { id: Shape; label: string }[] = [
    { id: 'line', label: 'Line' }, { id: 'arrow', label: 'Arrow' }, { id: 'rectangle', label: 'Rectangle' },
    { id: 'ellipse', label: 'Ellipse' }, { id: 'circle', label: 'Circle' },
  ];
  readonly tool = signal<Tool>('pen');
  readonly activeShape = computed(() => this.shapes.find(shape => shape.id === this.tool())?.id ?? '');
  readonly size = signal(3);
  readonly style = signal<StrokeStyle>('solid');
  readonly assignment = signal<Workspace['assignment'] | null>(null);
  readonly worksheet = signal('');
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly height = signal(1000);
  readonly rendering = signal(false);
  readonly error = signal('');
  readonly loadFailed = signal(false);
  readonly failedPage = signal<number | null>(null);
  readonly downloading = signal(false);
  readonly downloadError = signal('');
  readonly saveStatus = signal('Private draft');
  readonly saveFailed = signal(false);
  readonly draft = signal<Mark | null>(null);
  private readonly marks = signal<Mark[]>([]);
  readonly hasMarks = computed(() => this.marks().length > 0);
  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly pageMarks = computed(() => this.marks().filter(mark => mark.page === this.page()));
  private readonly history = signal(new Map<number, { undo: Mark[][]; redo: Mark[][] }>());
  readonly redoHistory = computed(() => this.history().get(this.page())?.redo ?? []);
  readonly canUndo = computed(() => !!this.history().get(this.page())?.undo.length || !!this.pageMarks().length);
  readonly erasing = signal(new Set<Mark>());
  color = '#153e81';
  highlightColor = '#e6a700';
  annotation = '';
  private revision = 0;
  private dirty = false;
  private timer?: number;
  private saving?: Promise<void>;
  private destroyed = false;
  private pointer?: number;
  private eraserStroke = false;
  private pdfTask?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private renderTask?: RenderTask;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.error.set('');
    this.loadFailed.set(false);
    this.downloadError.set('');
    let failure = 'Unable to load the assignment. Try again.';
    try {
      const resource = this.readOnly
        ? '/submissions/' + encodeURIComponent(this.studentId!) + '/whiteboard' : '/workspace';
      const state = await this.api.request<Workspace>('GET', this.path + resource);
      if (this.destroyed) return;
      this.assignment.set(state.assignment);
      this.revision = state.revision;
      this.marks.set(state.marks);
      this.submitted.set(state.submitted ?? false);
      failure = 'Unable to download the worksheet. Try again.';
      const file = await this.api.blob(this.path + '/worksheet');
      if (this.destroyed) return;
      const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (this.destroyed) return;
      if (file.type === 'application/pdf' || header.includes('%PDF-')) {
        failure = 'The PDF viewer could not start. Try again or download the worksheet.';
        const pdfjs = await import('pdfjs-dist');
        const data = await file.arrayBuffer();
        if (this.destroyed) return;
        const assets = new URL('assets/pdfjs/', document.baseURI);
        const worker = new URL('pdf.worker.min.mjs', assets);
        worker.searchParams.set('v', pdfjs.version);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.href;
        this.pdfTask = pdfjs.getDocument({
          data,
          cMapUrl: new URL('cmaps/', assets).href,
          standardFontDataUrl: new URL('standard_fonts/', assets).href,
          wasmUrl: new URL('wasm/', assets).href,
          iccUrl: new URL('iccs/', assets).href,
        });
        try {
          this.pdf = await this.pdfTask.promise;
        } catch (error) {
          if (error instanceof pdfjs.InvalidPDFException) {
            failure = 'This PDF is incomplete or damaged. Ask your teacher for a new copy.';
          } else if (error instanceof pdfjs.PasswordException) {
            failure = 'This PDF is password-protected. Ask your teacher for an unlocked copy to use in the whiteboard.';
          }
          throw error;
        }
        if (this.destroyed) return;
        this.pageCount.set(this.pdf.numPages);
        await this.showPage(1);
      } else {
        failure = 'This worksheet image could not be read. Ask your teacher for a new PNG or JPG copy.';
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (this.destroyed) return;
          this.setSheet(file, image.naturalWidth, image.naturalHeight, 1);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      if (!this.destroyed) {
        this.loadFailed.set(true);
        this.error.set(error instanceof ApiError ? error.message : failure);
      }
    }
  }

  async retryWorksheet(): Promise<void> {
    if (!this.loadFailed()) return;
    this.loadFailed.set(false);
    await this.pdfTask?.destroy().catch(() => undefined);
    this.pdfTask = undefined;
    this.pdf = undefined;
    if (!this.destroyed) await this.load();
  }

  async downloadWorksheet(): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');
    try {
      await downloadAssignmentFile(this.api, this.path + '/worksheet', this.assignment()?.fileName ?? '');
    } catch (error) {
      this.downloadError.set(error instanceof ApiError ? error.message : 'Unable to download the worksheet.');
    } finally {
      this.downloading.set(false);
    }
  }

  async showPage(number: number): Promise<void> {
    if (!this.pdf || this.rendering() || this.pointer !== undefined) return;
    this.rendering.set(true);
    this.failedPage.set(null);
    this.error.set('');
    try {
      const page = await this.pdf.getPage(number);
      if (this.destroyed) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      this.renderTask = page.render({ canvas, viewport });
      await this.renderTask.promise;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
      if (!blob) throw new Error('Canvas conversion failed');
      if (!this.destroyed) this.setSheet(blob, canvas.width, canvas.height, number);
    } catch {
      if (!this.destroyed) {
        this.failedPage.set(number);
        this.error.set('Unable to display this PDF page.');
      }
    } finally {
      this.renderTask = undefined;
      this.rendering.set(false);
    }
  }

  private setSheet(blob: Blob, width: number, height: number, page: number): void {
    const previous = this.worksheet();
    this.worksheet.set(URL.createObjectURL(blob));
    this.height.set(1000 * height / width);
    this.page.set(page);
    if (previous) URL.revokeObjectURL(previous);
  }

  outline(mark: Mark): string {
    return drawingOutline(mark.tool, mark.points, 1000, this.height());
  }

  dash(mark: Mark): string | null {
    const width = mark.width ?? 3;
    if (mark.style === 'dashed') return `${width * 4} ${width * 2}`;
    return mark.style === 'dotted' ? `1 ${width * 2.5}` : null;
  }

  chooseShape(shape: Shape | ''): void {
    this.tool.set(shape || 'pen');
  }

  setColor(color: string): void {
    if (this.tool() === 'highlighter') this.highlightColor = color;
    else this.color = color;
  }

  private point(event: PointerEvent): DrawingPoint {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const normalize = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
    return { x: normalize((event.clientX - rect.left) / rect.width), y: normalize((event.clientY - rect.top) / rect.height) };
  }

  start(event: PointerEvent): void {
    const tool = this.tool();
    if (this.readOnly || this.submitting() || this.rendering() || this.pointer !== undefined || event.button !== 0 || tool === 'scroll') return;
    const layer = event.currentTarget as SVGSVGElement;
    if (tool === 'eraser') {
      this.eraserStroke = true;
      this.pointer = event.pointerId;
      layer.setPointerCapture(event.pointerId);
      this.eraseAt(event);
      return;
    }
    if (this.marks().length >= 400) {
      this.error.set('This whiteboard holds up to 400 marks. Use Undo on a page to make room.');
      return;
    }
    this.error.set('');
    const mark: Mark = {
      page: this.page(), tool, color: tool === 'highlighter' ? this.highlightColor : this.color,
      width: tool === 'highlighter' ? this.size() * 4 : this.size(), points: [this.point(event)],
      style: this.activeShape() ? this.style() : 'solid',
    };
    if (mark.tool === 'text') {
      const text = this.annotation.trim();
      if (text) {
        this.changePageMarks([...this.pageMarks(), { ...mark, text }]);
        this.annotation = '';
      }
      return;
    }
    this.pointer = event.pointerId;
    layer.setPointerCapture(event.pointerId);
    this.draft.set(mark);
  }

  move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    if (this.eraserStroke) {
      this.eraseAt(event);
      return;
    }
    const mark = this.draft();
    if (!mark) return;
    const point = this.point(event);
    if (mark.tool !== 'pen' && mark.tool !== 'highlighter') {
      this.draft.set({ ...mark, points: [mark.points[0], point] });
      return;
    }
    const last = mark.points.at(-1)!;
    if (Math.hypot(last.x - point.x, last.y - point.y) < 0.0015) return;
    const points = mark.points.length >= 128 ? mark.points.filter((_, index) => index % 2 === 0) : mark.points;
    this.draft.set({ ...mark, points: [...points, point] });
  }

  finish(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.move(event);
    const mark = this.draft();
    if (this.erasing().size) this.changePageMarks(this.pageMarks().filter(item => !this.erasing().has(item)));
    if (mark) this.changePageMarks([...this.pageMarks(), mark]);
    this.cancel(event);
  }

  cancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.pointer = undefined;
    this.eraserStroke = false;
    this.erasing.set(new Set());
    this.draft.set(null);
  }

  private eraseAt(event: PointerEvent): void {
    const layer = event.currentTarget as SVGSVGElement;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-mark]');
    if (!hit || !layer.contains(hit)) return;
    const mark = this.pageMarks()[Number(hit.getAttribute('data-mark'))];
    if (mark) this.erasing.update(items => new Set([...items, mark]));
  }

  undo(): void {
    if (this.submitting() || this.pointer !== undefined || !this.canUndo()) return;
    const history = this.pageHistory();
    const current = this.pageMarks();
    const previous = history.undo.at(-1) ?? current.slice(0, -1);
    if (this.replacePageMarks(previous)) this.setHistory(history.undo.slice(0, -1), [...history.redo, current]);
  }

  redo(): void {
    if (this.submitting() || this.pointer !== undefined) return;
    const history = this.pageHistory();
    const next = history.redo.at(-1);
    const current = this.pageMarks();
    if (next && this.replacePageMarks(next)) this.setHistory([...history.undo, current], history.redo.slice(0, -1));
  }

  private pageHistory(): { undo: Mark[][]; redo: Mark[][] } {
    return this.history().get(this.page()) ?? { undo: [], redo: [] };
  }

  private setHistory(undo: Mark[][], redo: Mark[][]): void {
    this.history.update(history => new Map(history).set(this.page(), { undo: undo.slice(-30), redo: redo.slice(-30) }));
  }

  private changePageMarks(marks: Mark[]): void {
    const current = this.pageMarks();
    if (this.replacePageMarks(marks)) this.setHistory([...this.pageHistory().undo, current], []);
  }

  private replacePageMarks(marks: Mark[]): boolean {
    const otherPages = this.marks().filter(mark => mark.page !== this.page());
    if (otherPages.length + marks.length > 400) {
      this.error.set('This whiteboard holds up to 400 marks. Make room on another page first.');
      return false;
    }
    this.edit([...otherPages, ...marks]);
    return true;
  }

  private edit(marks: Mark[]): void {
    this.marks.set(marks);
    this.dirty = true;
    this.saveStatus.set('Unsaved changes');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), 400);
  }

  async save(): Promise<void> {
    window.clearTimeout(this.timer);
    if (this.saving) return this.saving;
    if (!this.dirty || this.destroyed) return;
    this.saveFailed.set(false);
    this.saving = this.persistChanges();
    try {
      await this.saving;
    } finally {
      this.saving = undefined;
    }
  }

  private async persistChanges(): Promise<void> {
    while (this.dirty && !this.destroyed && !this.saveFailed()) {
      this.saveStatus.set('Saving…');
      await this.persist(this.marks());
    }
  }

  private async persist(snapshot: Mark[]): Promise<void> {
    try {
      const response = await this.api.request<{ revision: number }>('PUT', this.path + '/workspace', {
        revision: this.revision, marks: snapshot,
      });
      this.revision = response.revision;
      this.dirty = this.marks() !== snapshot;
      this.saveStatus.set(this.dirty ? 'Unsaved changes' : 'Private draft saved');
    } catch (error) {
      this.saveFailed.set(true);
      this.saveStatus.set(error instanceof ApiError && error.status === 409
        ? 'Saved in another tab. Reload to open that version.' : 'Changes could not be saved.');
    }
  }

  async canLeave(): Promise<boolean> {
    if (this.submitting()) return false;
    if (this.dirty) await this.save();
    return !this.dirty || window.confirm('Leave with unsaved annotations?');
  }

  async submit(): Promise<void> {
    if (this.readOnly || this.submitted() || this.submitting() || !this.hasMarks() || this.pointer !== undefined) return;
    if (!window.confirm('Submit your current whiteboard work to your teacher?')) return;
    this.submitting.set(true);
    this.error.set('');
    try {
      await this.save();
      if (this.dirty) {
        this.error.set('Save your draft before submitting.');
        return;
      }
      await this.api.request('POST', this.path + '/submissions', { revision: this.revision });
      this.submitted.set(true);
      this.saveStatus.set('Assignment submitted');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to submit your whiteboard.');
    } finally {
      this.submitting.set(false);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) event.preventDefault();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.timer);
    this.renderTask?.cancel();
    void this.pdfTask?.destroy().catch(() => undefined);
    if (this.worksheet()) URL.revokeObjectURL(this.worksheet());
  }
}
