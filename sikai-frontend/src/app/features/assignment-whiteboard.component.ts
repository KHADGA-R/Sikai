import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { ThemeIconComponent } from '../shared/theme-icon.component';
import { downloadAssignmentFile } from './assignment-files';
import { AssignmentEquationComponent } from './assignment-equation.component';
import { WhiteboardCalculatorComponent } from './whiteboard-calculator.component';
import { DrawingPoint, StrokeStyle, drawingOutline } from './whiteboard-drawing';
import { InkPoint, pressureInk, smoothInk } from './assignment-ink';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

type Shape = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'circle';
type InkTool = Shape | 'pen' | 'highlighter' | 'text';
type Tool = InkTool | 'eraser' | 'scroll' | 'move' | 'equation';
interface Mark {
  page: number;
  tool: InkTool | 'erase';
  color: string;
  points: InkPoint[];
  text?: string;
  boxWidth?: number;
  equation?: boolean;
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
  imports: [RouterLink, ThemeIconComponent, NgTemplateOutlet, AssignmentEquationComponent, WhiteboardCalculatorComponent],
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
            <div class="tool-group" role="group" aria-label="Draw and write">
            @for (option of tools; track option.id) {
              <button type="button" class="icon-button" [attr.aria-label]="option.label" [attr.title]="option.label"
                      [attr.aria-pressed]="tool() === option.id" (click)="selectTool(option.id)">
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
            </div>
            <div class="tool-group history-tools" role="group" aria-label="Edit history">
            <button type="button" class="icon-button" aria-label="Undo" title="Undo" [disabled]="!canUndo()" (click)="undo()">
              <app-theme-icon name="undo" />
            </button>
            <button type="button" class="icon-button" aria-label="Redo" title="Redo" [disabled]="!redoHistory().length" (click)="redo()">
              <app-theme-icon name="redo" />
            </button>
            </div>
          </div>
          @if (tool() !== 'eraser' && tool() !== 'scroll' && tool() !== 'move') {
            <div class="toolbar" role="group" aria-label="Ink settings">
              <label [attr.title]="tool() === 'highlighter' ? 'Highlight color' : 'Ink color'">
                <app-theme-icon name="palette" />
                <input type="color" [attr.aria-label]="tool() === 'highlighter' ? 'Highlight color' : 'Ink color'"
                       [value]="tool() === 'highlighter' ? highlightColor : editor()?.mark?.color ?? color" (input)="setColor($any($event.target).value)" />
              </label>
              <label>{{ tool() === 'text' || tool() === 'equation' ? 'Text size' : 'Thickness' }}
                <select [value]="editor()?.mark?.width ?? size()" (change)="setSize(+$any($event.target).value)">
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
            <p class="tool-help">Tap the worksheet to type an answer. Tap an existing answer to edit it.</p>
          } @else if (tool() === 'equation') {
            <p class="tool-help">Tap the worksheet to place an equation. Use the keypad to insert math and fill in the blanks.</p>
          } @else if (tool() === 'move') {
            <p class="tool-help">Drag a typed answer to move it.</p>
          } @else if (tool() === 'eraser') {
            <div class="toolbar">
              <label>Eraser size
                <select [value]="eraserWidth()" (change)="eraserWidth.set(+$any($event.target).value)">
                  <option value="8">Small</option><option value="16">Medium</option><option value="24">Large</option>
                </select>
              </label>
              <span class="tool-help">Drag to erase ink where the brush passes.</span>
            </div>
          }
          }
          <div class="page-controls">
            <div class="tool-group" role="group" aria-label="Worksheet navigation">
            @if (!readOnly) {
              <button type="button" class="icon-button" aria-label="Move" title="Move answers"
                      [attr.aria-pressed]="tool() === 'move'" (click)="selectTool('move')"><app-theme-icon name="move" /></button>
              <button type="button" class="icon-button" aria-label="Pan" title="Pan worksheet"
                      [attr.aria-pressed]="tool() === 'scroll'" (click)="selectTool('scroll')"><app-theme-icon name="scroll" /></button>
            }
            <div class="zoom-controls" role="group" aria-label="Worksheet zoom">
              <button type="button" aria-label="Zoom out" title="Zoom out" [disabled]="zoom() === 100"
                      (click)="setZoom(zoom() - 25)">−</button>
              <output aria-label="Zoom level">{{ zoom() }}%</output>
              <button type="button" aria-label="Zoom in" title="Zoom in" [disabled]="zoom() === 300"
                      (click)="setZoom(zoom() + 25)">+</button>
              <button type="button" [disabled]="zoom() === 100" (click)="setZoom(100)">Fit width</button>
            </div>
            </div>
            <button type="button" class="calculator-toggle" [attr.aria-expanded]="calculatorOpen()"
                    aria-controls="assignment-calculator" (click)="calculatorOpen.set(!calculatorOpen())">
              <app-theme-icon name="calculator" /> Calculator
            </button>
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
              <button type="button" class="submit-button" [disabled]="!hasMarks() || !!editor() || submitting()" (click)="submit()">
                {{ submitting() ? 'Submitting…' : 'Submit from whiteboard' }}
              </button>
            }
            }
          </div>
          <div class="worksheet-layout">
          <div id="assignment-calculator" class="calculator-dock">
            @if (calculatorOpen()) {
              <app-whiteboard-calculator label="Assignment calculator" (closed)="calculatorOpen.set(false)" />
            }
          </div>
          <div #worksheetViewport class="worksheet-viewport" role="region" aria-label="Worksheet viewing area" tabindex="0"
               [class.zoomed]="zoom() > 100" [class.can-pan]="zoom() > 100 && (readOnly || tool() === 'scroll')"
               [class.panning]="panning()" (wheel)="zoomAtPointer($event)"
               (pointerdown)="startPan($event)" (pointermove)="movePan($event)"
               (pointerup)="movePan($event); endPan($event)"
               (pointercancel)="endPan($event)" (lostpointercapture)="endPan($event)">
          <div #worksheetSheet class="sheet" [class.editing-answer]="!!editor()" [style.width.%]="zoom()">
            <img [src]="worksheet()" alt="Assignment worksheet, page {{ page() }}" draggable="false" />
            <svg aria-label="Worksheet annotations" [class.scroll]="readOnly || tool() === 'scroll'" [class.erase]="tool() === 'eraser'"
                 [class.move-text]="tool() === 'move'" [attr.viewBox]="'0 0 1000 ' + height()"
                 (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="finish($event)"
                 (pointercancel)="cancel($event)" (lostpointercapture)="cancel($event)"
                 (pointerleave)="eraserCursor.set(null)">
              @if (inkLayers().masks.length) {
                <defs>
                  @for (mask of inkLayers().masks; track mask.id) {
                    @if (mask.strokes.length || eraserDraft()) {
                      <mask class="ink-mask" [attr.id]="'assignment-erase-' + mask.id" maskUnits="userSpaceOnUse"
                            x="0" y="0" width="1000" [attr.height]="height()">
                        <rect width="1000" [attr.height]="height()" fill="white" />
                        @for (stroke of mask.strokes; track stroke) {
                          <path [attr.d]="outline(stroke)" stroke="black" [attr.stroke-width]="stroke.width ?? 16" />
                        }
                        @if (eraserDraft(); as stroke) {
                          <path [attr.d]="outline(stroke)" stroke="black" [attr.stroke-width]="stroke.width ?? 16" />
                        }
                      </mask>
                    }
                  }
                </defs>
              }
              @for (mark of pageMarks(); track mark; let index = $index) {
                @if (mark.tool !== 'erase' && !erasing().has(mark) && editor()?.original !== mark && moving()?.original !== mark) {
                  @if (mark.tool === 'text') {
                    <ng-container *ngTemplateOutlet="answer; context: {$implicit: mark, index: index}" />
                  } @else {
                    <ng-container *ngTemplateOutlet="ink; context: {$implicit: mark, index: index, mask: inkMask(mark)}" />
                  }
                }
              }
              @if (moving(); as move) {
                <ng-container *ngTemplateOutlet="answer; context: {$implicit: move.mark, index: null}" />
              }
              @if (draft(); as mark) {
                <ng-container *ngTemplateOutlet="ink; context: {$implicit: mark, index: null, mask: null}" />
              }
              @if (tool() === 'eraser' && eraserCursor(); as cursor) {
                <circle class="eraser-cursor" [attr.cx]="cursor.x * 1000" [attr.cy]="cursor.y * height()"
                        [attr.r]="(eraserDraft()?.width ?? eraserWidth()) / 2" aria-hidden="true" />
              }
            </svg>
            @if (editor(); as entry) {
              <form class="answer-editor" aria-label="Typed answer editor"
                    [style.left.%]="entry.mark.points[0].x * 100"
                    [style.top.%]="entry.mark.points[0].y * 100" [style.width.%]="entry.mark.boxWidth! * 100"
                    (submit)="applyAnswer($event)" (keydown.escape)="cancelAnswer($event)">
                <textarea #answerInput [attr.aria-label]="entry.mark.equation ? 'Type your equation' : 'Type your answer'"
                          rows="3" maxlength="1000" [value]="entry.mark.text ?? ''"
                          [style.color]="entry.mark.color" [style.font-size]="((16 + (entry.mark.width ?? 3) * 2) / 10) + 'cqw'"
                          (input)="editAnswerText(answerInput.value)"
                          (keydown.control.enter)="applyAnswer($event)" (keydown.meta.enter)="applyAnswer($event)"></textarea>
                @if (entry.mark.equation) {
                  @if (entry.mark.text) {
                    <div class="equation-preview" aria-label="Equation preview">
                      <app-assignment-equation [expression]="entry.mark.text" />
                    </div>
                  }
                  <div class="equation-keypad" role="group" aria-label="Equation keypad">
                    @for (key of equationKeys; track key.value) {
                      <button type="button" [attr.aria-label]="key.label" [attr.title]="key.label"
                              (click)="insertEquation(key.value)">{{ key.display }}</button>
                    }
                    @if (entry.mark.text?.includes('□')) {
                      <button type="button" (click)="nextEquationBlank()">Next blank</button>
                    }
                  </div>
                }
                <div class="answer-actions">
                  <button type="button" class="icon-button answer-handle drag-answer" aria-label="Move answer" title="Drag to move"
                          (pointerdown)="startAnswerGesture($event, 'move')" (pointermove)="updateAnswerGesture($event)"
                          (lostpointercapture)="endAnswerGesture()" (keydown)="nudgeAnswer($event, 'move')">
                    <app-theme-icon name="move" />
                  </button>
                  <button type="submit" class="icon-button submit-button" aria-label="Apply" title="Apply"
                          [disabled]="!entry.mark.text?.trim() || !!(entry.mark.equation && entry.mark.text?.includes('□'))">
                    <app-theme-icon name="check" />
                  </button>
                  <button type="button" class="icon-button" aria-label="Cancel" title="Cancel" (click)="cancelAnswer()">
                    <app-theme-icon name="close" />
                  </button>
                  <button type="button" class="icon-button answer-handle resize-answer" aria-label="Resize answer" title="Drag to resize"
                          (pointerdown)="startAnswerGesture($event, 'resize')" (pointermove)="updateAnswerGesture($event)"
                          (lostpointercapture)="endAnswerGesture()" (keydown)="nudgeAnswer($event, 'resize')">
                    <app-theme-icon name="resize" />
                  </button>
                </div>
              </form>
            }
          </div>
          </div>
          </div>
          @if (rendering()) { <p role="status">Loading page…</p> }
        </div>
      } @else if (!error()) { <p role="status">Loading worksheet…</p> }
      <ng-template #answer let-mark let-index="index">
        @if (mark.boxWidth) {
          <svg:foreignObject [attr.data-mark]="index" [attr.x]="mark.points[0].x * 1000"
            [attr.y]="mark.points[0].y * height()" [attr.width]="mark.boxWidth * 1000"
            [attr.height]="(1 - mark.points[0].y) * height()">
            <div xmlns="http://www.w3.org/1999/xhtml" class="answer-text" [style.color]="mark.color"
                 [style.font-size.px]="mark.width ? 16 + mark.width * 2 : 22">
              @if (mark.equation) { <app-assignment-equation [expression]="mark.text ?? ''" /> }
              @else { {{ mark.text }} }
            </div>
          </svg:foreignObject>
        } @else {
          <svg:text [attr.data-mark]="index" [attr.x]="mark.points[0].x * 1000" [attr.y]="mark.points[0].y * height()"
                    [style.font-size.px]="mark.width ? 16 + mark.width * 2 : 22"
                    [attr.fill]="mark.color" dominant-baseline="hanging">{{ mark.text }}</svg:text>
        }
      </ng-template>
      <ng-template #ink let-mark let-index="index" let-mask="mask">
        @if (pressureOutline(mark); as path) {
          <svg:path [attr.data-mark]="index" [attr.d]="path" [style.fill]="mark.color" [attr.mask]="mask" />
        } @else {
          <svg:path [attr.data-mark]="index" [attr.d]="outline(mark)" [attr.stroke]="mark.color"
                    [attr.stroke-width]="mark.width ?? 3" [attr.stroke-dasharray]="dash(mark)" [attr.mask]="mask"
                    [attr.opacity]="mark.tool === 'highlighter' ? .36 : 1" />
        }
      </ng-template>
    </section>
  `,
  styles: [`
    .board-page { max-width: 1040px; }
    h1 { margin: 12px 0; overflow-wrap: anywhere; }
    .instructions { white-space: pre-wrap; overflow-wrap: anywhere; }
    .workspace { padding: 12px; }
    .toolbar, .page-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    .tool-group, .zoom-controls { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 5px; }
    .history-tools { border-inline-start: 1px solid #d0d8d5; padding-inline-start: 8px; }
    .zoom-controls output { min-width: 4ch; text-align: center; font-variant-numeric: tabular-nums; }
    .calculator-toggle { display: inline-flex; align-items: center; gap: 5px; }
    .calculator-toggle app-theme-icon { width: 16px; height: 16px; }
    .worksheet-layout { position: relative; }
    .calculator-dock { position: absolute; left: 0; top: 0; width: min(270px, 72%); }
    .calculator-dock:has(app-whiteboard-calculator:not(.floating)) { z-index: 2; }
    @media (min-width: 720px) {
      .worksheet-layout:has(.calculator-dock app-whiteboard-calculator:not(.floating)) {
        display: grid; grid-template-columns: minmax(185px, 240px) minmax(0, 1fr); align-items: start; gap: 12px;
      }
      .calculator-dock:has(app-whiteboard-calculator:not(.floating)) { position: static; width: 100%; }
    }
    button { background: white; color: #17212f; border: 1px solid #bcc7c5; border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button[aria-pressed=true] { background: #d7ece5; border-color: #467e71; font-weight: 650; }
    button.submit-button { background: #0754a8; border-color: #0754a8; color: white; }
    button:disabled { opacity: .55; cursor: default; }
    .toolbar label { display: flex; align-items: center; gap: 6px; margin: 0; }
    .toolbar app-theme-icon, .tool-group app-theme-icon { width: 18px; height: 18px; }
    .icon-button { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; }
    .shape-control { color: #17212f; }
    .toolbar select { width: auto; min-height: 30px; padding: 3px 6px; color: #17212f; }
    input[type=color] { width: 35px; height: 32px; padding: 3px; }
    .tool-help { margin: 0 0 10px; font-size: .875rem; }
    .save-status { margin-left: auto; color: #344840; font-size: .875rem; }
    .sheet { position: relative; container-type: inline-size; background: white; border: 1px solid #d0d8d5; }
    .worksheet-viewport.zoomed { max-height: min(72vh, 720px); overflow: auto; overscroll-behavior: contain; }
    .worksheet-viewport.can-pan, .worksheet-viewport.can-pan svg { cursor: grab; }
    .worksheet-viewport.panning, .worksheet-viewport.panning svg { cursor: grabbing; user-select: none; }
    .worksheet-viewport:focus-visible { outline: 2px solid #467e71; outline-offset: 3px; }
    img { display: block; width: 100%; height: auto; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; user-select: none; }
    svg.scroll { touch-action: auto; cursor: grab; }
    svg.erase { cursor: crosshair; }
    svg.move-text { cursor: move; }
    foreignObject { pointer-events: none; }
    .answer-text { font-family: sans-serif; line-height: 1.25; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: auto; }
    .editing-answer { margin-bottom: 175px; }
    .answer-editor { position: absolute; z-index: 1; margin: 0; }
    .workspace .answer-editor { display: grid; gap: 4px; }
    .workspace .answer-editor textarea { width: 100%; min-height: 64px; max-height: 180px; padding: 0; border: 0; border-radius: 0; background: transparent; outline: 1px solid #467e71; outline-offset: 2px; resize: none; font-family: sans-serif; line-height: 1.25; field-sizing: content; }
    .workspace .answer-editor textarea:focus { outline: 2px solid #467e71; }
    .answer-actions { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .answer-actions .icon-button { width: 32px; height: 32px; flex-shrink: 0; }
    .answer-actions app-theme-icon { width: 16px; height: 16px; }
    .equation-keypad { display: flex; flex-wrap: wrap; gap: 4px; width: max-content; max-width: min(360px, 72vw); background: white; padding: 5px; border: 1px solid #bcc7c5; border-radius: 7px; }
    .equation-keypad button { min-width: 33px; min-height: 33px; padding: 4px 6px; }
    .equation-preview { color: #17212f; font-size: 1rem; background: #fff; padding: 4px 6px; border-radius: 5px; overflow-x: auto; }
    .answer-handle { touch-action: none; }
    .drag-answer { cursor: move; margin-right: auto; }
    .resize-answer { cursor: ew-resize; }
    path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .eraser-cursor { fill: none; stroke: #344840; stroke-width: 1; pointer-events: none; }
    .ink-mask { mask-type: luminance; }
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
    { id: 'equation', label: 'Equation' },
    { id: 'eraser', label: 'Eraser' },
  ];
  readonly shapes: { id: Shape; label: string }[] = [
    { id: 'line', label: 'Line' }, { id: 'arrow', label: 'Arrow' }, { id: 'rectangle', label: 'Rectangle' },
    { id: 'ellipse', label: 'Ellipse' }, { id: 'circle', label: 'Circle' },
  ];
  readonly equationKeys = [
    { label: 'Fraction', display: '½', value: 'frac(□,□)' },
    { label: 'Exponent', display: 'xⁿ', value: 'pow(□,□)' },
    { label: 'Square root', display: '√', value: 'sqrt(□)' },
    { label: 'Subscript', display: 'xₙ', value: 'sub(□,□)' },
    ...[
      ['+', 'Plus'], ['−', 'Minus'], ['×', 'Multiply'], ['÷', 'Divide'], ['=', 'Equals'],
      ['≠', 'Not equal'], ['≤', 'Less than or equal'], ['≥', 'Greater than or equal'],
      ['π', 'Pi'], ['°', 'Degrees'], ['%', 'Percent'], ['(', 'Open parenthesis'], [')', 'Close parenthesis'],
    ].map(([value, label]) => ({ label, display: value, value })),
  ];
  readonly tool = signal<Tool>('pen');
  readonly zoom = signal(100);
  readonly calculatorOpen = signal(false);
  readonly panning = signal(false);
  private readonly viewport = viewChild<ElementRef<HTMLDivElement>>('worksheetViewport');
  private readonly worksheetSheet = viewChild<ElementRef<HTMLDivElement>>('worksheetSheet');
  private zoomFrame?: number;
  private pan?: { pointer: number; x: number; y: number; left: number; top: number };
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
  readonly eraserDraft = signal<Mark | null>(null);
  readonly eraserCursor = signal<DrawingPoint | null>(null);
  readonly eraserWidth = signal(16);
  readonly editor = signal<{ original?: Mark; mark: Mark } | null>(null);
  readonly moving = signal<{ original: Mark; mark: Mark; start: DrawingPoint } | null>(null);
  private readonly answerInput = viewChild<ElementRef<HTMLTextAreaElement>>('answerInput');
  private answerGesture?: { mode: 'move' | 'resize'; pointer: number; startX: number; startY: number; bounds: DOMRect; mark: Mark };
  private readonly marks = signal<Mark[]>([]);
  readonly hasMarks = computed(() => this.marks().length > 0);
  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly pageMarks = computed(() => this.marks().filter(mark => mark.page === this.page()));
  readonly inkLayers = computed(() => {
    const masks: { id: number; strokes: Mark[] }[] = [];
    const byMark = new Map<Mark, typeof masks[number]>();
    const strokes: Mark[] = [];
    let current: typeof masks[number] | undefined;
    for (const mark of [...this.pageMarks()].reverse()) {
      if (mark.tool === 'erase') {
        strokes.push(mark);
        current = undefined;
      } else if (mark.tool !== 'text') {
        if (!current) {
          current = { id: masks.length, strokes: [...strokes] };
          masks.push(current);
        }
        byMark.set(mark, current);
      }
    }
    return { masks, byMark };
  });
  private readonly history = signal(new Map<number, { undo: Mark[][]; redo: Mark[][] }>());
  readonly redoHistory = computed(() => this.history().get(this.page())?.redo ?? []);
  readonly canUndo = computed(() => !!this.history().get(this.page())?.undo.length || !!this.pageMarks().length);
  readonly erasing = signal(new Set<Mark>());
  color = '#153e81';
  highlightColor = '#e6a700';
  private revision = 0;
  private dirty = false;
  private timer?: number;
  private saving?: Promise<void>;
  private destroyed = false;
  private pointer?: number;
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
    if (!this.pdf || this.rendering() || this.pointer !== undefined || !this.finishAnswer()) return;
    this.rendering.set(true);
    this.failedPage.set(null);
    this.error.set('');
    try {
      const page = await this.pdf.getPage(number);
      if (this.destroyed) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 2200 / Math.max(base.width, base.height) });
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
    this.viewport()?.nativeElement.scrollTo(0, 0);
    if (previous) URL.revokeObjectURL(previous);
  }

  setZoom(value: number, anchor?: { clientX: number; clientY: number }): void {
    const viewport = this.viewport()?.nativeElement;
    const sheet = this.worksheetSheet()?.nativeElement;
    const zoom = Math.max(100, Math.min(300, value));
    if (!viewport || !sheet || zoom === this.zoom() || this.pointer !== undefined || this.pan || this.answerGesture) return;
    const viewRect = viewport.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const x = anchor ? anchor.clientX - viewRect.left : viewport.clientWidth / 2;
    const y = anchor ? anchor.clientY - viewRect.top
      : (Math.max(0, -viewRect.top) + Math.max(0, Math.min(viewport.clientHeight, window.innerHeight - viewRect.top))) / 2;
    const relX = (viewRect.left + x - sheetRect.left) / sheetRect.width;
    const relY = (viewRect.top + y - sheetRect.top) / sheetRect.height;
    if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
    this.zoom.set(zoom);
    this.zoomFrame = requestAnimationFrame(() => {
      this.zoomFrame = undefined;
      if (zoom === 100) {
        viewport.scrollTo(0, 0);
        return;
      }
      viewport.scrollTo(
        relX * sheet.offsetWidth - Math.min(x, viewport.clientWidth / (anchor ? 1 : 2)),
        relY * sheet.offsetHeight - Math.min(y, viewport.clientHeight / (anchor ? 1 : 2)),
      );
    });
  }

  zoomAtPointer(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    event.preventDefault();
    this.setZoom(this.zoom() + (event.deltaY < 0 ? 25 : -25), event);
  }

  startPan(event: PointerEvent): void {
    if (this.zoom() === 100 || (!this.readOnly && this.tool() !== 'scroll') || event.pointerType === 'touch'
      || event.button !== 0 || this.pan || (event.target as Element).closest('.answer-editor')) return;
    const view = event.currentTarget as HTMLElement;
    event.preventDefault();
    view.setPointerCapture(event.pointerId);
    this.pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
    this.panning.set(true);
  }

  movePan(event: PointerEvent): void {
    const pan = this.pan;
    if (!pan || event.pointerId !== pan.pointer) return;
    const view = event.currentTarget as HTMLElement;
    view.scrollTo(pan.left - (event.clientX - pan.x), pan.top - (event.clientY - pan.y));
  }

  endPan(event: PointerEvent): void {
    if (event.pointerId !== this.pan?.pointer) return;
    this.pan = undefined;
    this.panning.set(false);
  }

  outline(mark: Mark): string {
    if (mark.tool === 'pen' || mark.tool === 'highlighter' || mark.tool === 'erase') {
      return smoothInk(mark.points, this.height());
    }
    return drawingOutline(mark.tool, mark.points, 1000, this.height());
  }

  pressureOutline(mark: Mark): string {
    return mark.tool === 'pen' ? pressureInk(mark.points, mark.width ?? 3, this.height()) : '';
  }

  inkMask(mark: Mark): string | null {
    const mask = this.inkLayers().byMark.get(mark);
    return mask && (mask.strokes.length || this.eraserDraft()) ? `url(#assignment-erase-${mask.id})` : null;
  }

  dash(mark: Mark): string | null {
    const width = mark.width ?? 3;
    if (mark.style === 'dashed') return `${width * 4} ${width * 2}`;
    return mark.style === 'dotted' ? `1 ${width * 2.5}` : null;
  }

  chooseShape(shape: Shape | ''): void {
    this.selectTool(shape || 'pen');
  }

  selectTool(tool: Tool): void {
    if (tool !== this.tool() && this.finishAnswer()) this.tool.set(tool);
  }

  setColor(color: string): void {
    if (this.tool() === 'highlighter') this.highlightColor = color;
    else {
      this.color = color;
      this.updateAnswer(mark => ({ ...mark, color }));
    }
  }

  setSize(width: number): void {
    this.size.set(width);
    this.updateAnswer(mark => ({ ...mark, width }));
  }

  editAnswerText(text: string): void {
    this.updateAnswer(mark => ({ ...mark, text }));
  }

  insertEquation(value: string): void {
    const field = this.answerInput()?.nativeElement;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = field.value.slice(start, end);
    const insertion = selected && selected !== '□' ? value.replace('□', selected) : value;
    if (field.value.length - (end - start) + insertion.length > field.maxLength) return;
    field.setRangeText(insertion, start, end, 'end');
    this.editAnswerText(field.value);
    field.focus();
    const blank = insertion.indexOf('□');
    if (blank >= 0) field.setSelectionRange(start + blank, start + blank + 1);
  }

  nextEquationBlank(): void {
    const field = this.answerInput()?.nativeElement;
    if (!field) return;
    const next = field.value.indexOf('□', field.selectionEnd);
    const blank = next >= 0 ? next : field.value.indexOf('□');
    if (blank >= 0) {
      field.focus();
      field.setSelectionRange(blank, blank + 1);
    }
  }

  startAnswerGesture(event: PointerEvent, mode: 'move' | 'resize'): void {
    const mark = this.editor()?.mark;
    const button = event.currentTarget as HTMLButtonElement;
    const bounds = button.closest('.sheet')?.getBoundingClientRect();
    if (!mark || !bounds || this.answerGesture || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    this.answerGesture = { mode, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, bounds, mark };
  }

  updateAnswerGesture(event: PointerEvent): void {
    const gesture = this.answerGesture;
    if (!gesture || event.pointerId !== gesture.pointer) return;
    this.adjustAnswer(gesture.mode, gesture.mark,
      (event.clientX - gesture.startX) / gesture.bounds.width,
      (event.clientY - gesture.startY) / gesture.bounds.height);
  }

  endAnswerGesture(): void {
    this.answerGesture = undefined;
  }

  nudgeAnswer(event: KeyboardEvent, mode: 'move' | 'resize'): void {
    const mark = this.editor()?.mark;
    const x = event.key === 'ArrowLeft' ? -.01 : event.key === 'ArrowRight' ? .01 : 0;
    const y = event.key === 'ArrowUp' ? -.01 : event.key === 'ArrowDown' ? .01 : 0;
    if (!mark || (!x && (!y || mode === 'resize'))) return;
    event.preventDefault();
    this.adjustAnswer(mode, mark, x, y);
  }

  private adjustAnswer(mode: 'move' | 'resize', original: Mark, x: number, y: number): void {
    const width = original.boxWidth ?? .35;
    const position = original.points[0];
    if (mode === 'resize') {
      const boxWidth = Math.max(.15, Math.min(.85, 1 - position.x, Math.round((width + x) * 10000) / 10000));
      this.updateAnswer(mark => ({ ...mark, boxWidth }));
    } else {
      const point = this.answerPosition({ x: position.x + x, y: position.y + y }, width);
      this.updateAnswer(mark => ({ ...mark, points: [point] }));
    }
  }

  private updateAnswer(update: (mark: Mark) => Mark): void {
    this.editor.update(entry => entry && { ...entry, mark: update(entry.mark) });
  }

  private openAnswer(event: PointerEvent, mark: Mark, original?: Mark): void {
    event.preventDefault();
    this.editor.set({ original, mark });
    requestAnimationFrame(() => this.answerInput()?.nativeElement.focus());
  }

  applyAnswer(event?: Event): void {
    event?.preventDefault();
    this.finishAnswer();
  }

  cancelAnswer(event?: Event): void {
    event?.preventDefault();
    this.editor.set(null);
  }

  private finishAnswer(): boolean {
    const entry = this.editor();
    if (!entry) return true;
    const text = entry.mark.text?.trim();
    if (entry.mark.equation && text?.includes('□')) {
      this.nextEquationBlank();
      return false;
    }
    if (text) {
      const mark = { ...entry.mark, text };
      this.changePageMarks(entry.original
        ? this.pageMarks().map(item => item === entry.original ? mark : item)
        : [...this.pageMarks(), mark]);
    } else if (entry.original) {
      this.answerInput()?.nativeElement.focus();
      return false;
    }
    this.editor.set(null);
    return true;
  }

  private answerPosition(point: DrawingPoint, width: number): DrawingPoint {
    return {
      x: Math.max(0, Math.min(1 - width, point.x)),
      y: Math.max(0, Math.min(1 - 26 / this.height(), point.y)),
    };
  }

  private point(event: PointerEvent, rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()): DrawingPoint {
    const normalize = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
    return { x: normalize((event.clientX - rect.left) / rect.width), y: normalize((event.clientY - rect.top) / rect.height) };
  }

  start(event: PointerEvent): void {
    const tool = this.tool();
    if (this.readOnly || this.submitting() || this.rendering() || this.pointer !== undefined || event.button !== 0 || tool === 'scroll') return;
    const layer = event.currentTarget as SVGSVGElement;
    const hit = (event.target as Element).closest('[data-mark]');
    const target = hit && layer.contains(hit) ? this.pageMarks()[Number(hit.getAttribute('data-mark'))] : undefined;
    if (tool === 'move') {
      if (target?.tool !== 'text') return;
      this.pointer = event.pointerId;
      layer.setPointerCapture(event.pointerId);
      this.moving.set({ original: target, mark: target, start: this.point(event) });
      return;
    }
    if ((tool === 'text' || tool === 'equation') && target?.tool === 'text') {
      if (!this.finishAnswer()) return;
      const boxWidth = target.boxWidth ?? .35;
      this.openAnswer(event, { ...target, boxWidth, points: [this.answerPosition(target.points[0], boxWidth)] }, target);
      return;
    }
    if (tool === 'eraser') {
      this.pointer = event.pointerId;
      layer.setPointerCapture(event.pointerId);
      const point = this.point(event);
      this.eraserCursor.set(point);
      this.eraserDraft.set({ page: this.page(), tool: 'erase', color: '#000000', width: this.eraserWidth(), points: [point] });
      this.eraseTextAt(event);
      return;
    }
    if (!this.finishAnswer()) return;
    if (this.marks().length >= 400) {
      this.error.set('This whiteboard holds up to 400 marks. Use Undo on a page to make room.');
      return;
    }
    this.error.set('');
    const mark: Mark = {
      page: this.page(), tool: tool === 'equation' ? 'text' : tool, color: tool === 'highlighter' ? this.highlightColor : this.color,
      width: tool === 'highlighter' ? this.size() * 4 : this.size(), points: [this.point(event)],
      style: this.activeShape() ? this.style() : 'solid',
    };
    if (tool === 'pen' && event.pointerType === 'pen' && event.pressure > 0) {
      mark.points[0].pressure = Math.round(event.pressure * 1000) / 1000;
    }
    if (mark.tool === 'text') {
      const boxWidth = .35;
      this.openAnswer(event, { ...mark, equation: tool === 'equation' || undefined, boxWidth,
        points: [this.answerPosition(mark.points[0], boxWidth)] });
      return;
    }
    this.pointer = event.pointerId;
    layer.setPointerCapture(event.pointerId);
    this.draft.set(mark);
  }

  move(event: PointerEvent): void {
    if (this.tool() === 'eraser') this.eraserCursor.set(this.point(event));
    if (event.pointerId !== this.pointer) return;
    const moving = this.moving();
    if (moving) {
      const point = this.point(event);
      const origin = moving.original.points[0];
      const delta = { x: point.x - moving.start.x, y: point.y - moving.start.y };
      const position = delta.x || delta.y
        ? this.answerPosition({ x: origin.x + delta.x, y: origin.y + delta.y }, moving.mark.boxWidth ?? .15)
        : origin;
      this.moving.set({ ...moving, mark: position === origin ? moving.original : { ...moving.mark, points: [position] } });
      return;
    }
    const eraser = this.eraserDraft();
    if (eraser) {
      this.eraserDraft.set(this.extendInk(eraser, event));
      this.eraseTextAt(event);
      return;
    }
    const mark = this.draft();
    if (!mark) return;
    const point = this.point(event);
    if (mark.tool !== 'pen' && mark.tool !== 'highlighter') {
      this.draft.set({ ...mark, points: [mark.points[0], point] });
      return;
    }
    this.draft.set(this.extendInk(mark, event));
  }

  private extendInk(mark: Mark, event: PointerEvent): Mark {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length ? coalesced : [event];
    let points = [...mark.points];
    for (const sample of samples) {
      const point: InkPoint = this.point(sample, rect);
      const previous = points.at(-1)!;
      if (Math.hypot(previous.x - point.x, (previous.y - point.y) * rect.height / rect.width) < .0015) continue;
      if (mark.tool === 'pen' && sample.pointerType === 'pen') {
        point.pressure = sample.pressure > 0 ? Math.round(sample.pressure * 1000) / 1000 : previous.pressure;
      }
      if (points.length >= 128) points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
      points.push(point);
    }
    return points.length === mark.points.length && points.at(-1) === mark.points.at(-1) ? mark : { ...mark, points };
  }

  finish(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.move(event);
    const mark = this.draft();
    const moving = this.moving();
    if (moving && moving.mark !== moving.original) {
      this.changePageMarks(this.pageMarks().map(item => item === moving.original ? moving.mark : item));
    }
    const eraser = this.eraserDraft();
    if (eraser) {
      const remaining = this.pageMarks().filter(item => !this.erasing().has(item));
      if (this.inkLayers().byMark.size) this.changePageMarks([...remaining, eraser]);
      else if (this.erasing().size) this.changePageMarks(remaining);
    }
    if (mark) this.changePageMarks([...this.pageMarks(), mark]);
    this.cancel(event);
  }

  cancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.pointer = undefined;
    this.eraserDraft.set(null);
    this.erasing.set(new Set());
    this.moving.set(null);
    this.draft.set(null);
  }

  private eraseTextAt(event: PointerEvent): void {
    const layer = event.currentTarget as SVGSVGElement;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-mark]');
    if (!hit || !layer.contains(hit)) return;
    const mark = this.pageMarks()[Number(hit.getAttribute('data-mark'))];
    if (mark?.tool === 'text') this.erasing.update(items => new Set([...items, mark]));
  }

  undo(): void {
    if (this.submitting() || this.editor() || this.pointer !== undefined || !this.canUndo()) return;
    const history = this.pageHistory();
    const current = this.pageMarks();
    const previous = history.undo.at(-1) ?? current.slice(0, -1);
    if (this.replacePageMarks(previous)) this.setHistory(history.undo.slice(0, -1), [...history.redo, current]);
  }

  redo(): void {
    if (this.submitting() || this.editor() || this.pointer !== undefined) return;
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
    if (!this.finishAnswer() && !window.confirm('Discard the unfinished edit to this answer?')) return false;
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
    if (this.dirty || this.editor()) event.preventDefault();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.timer);
    if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
    this.renderTask?.cancel();
    void this.pdfTask?.destroy().catch(() => undefined);
    if (this.worksheet()) URL.revokeObjectURL(this.worksheet());
  }
}
