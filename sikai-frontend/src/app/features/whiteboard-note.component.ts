import { Component, DestroyRef, ElementRef, afterEveryRender, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

export interface NoteBounds { x: number; y: number; width: number; height: number; }
export type NoteKind = 'sticky' | 'table' | 'graph' | 'flowchart';
export interface StickyNote extends NoteBounds {
  id: string;
  authorId: string;
  authorName: string;
  color: 'yellow' | 'pink';
  kind?: NoteKind;
  text: string;
}
export interface NotePatch { text?: string; bounds?: NoteBounds; }
interface FlowSize { width: number; height: number; }
type FlowFormat = [fill: string, textColor: string, fontSize: number, flags: number];
type FlowLink = [from: number, to: number];
type FlowSide = 'left' | 'right' | 'bottom';
type FlowPoint = [x: number, y: number];
type FlowBend = [from: number, to: number, x: number, y: number];
interface RoutedFlowLink { from: number; to: number; path: string; bend: FlowPoint; }
const DEFAULT_FLOW_FORMAT: FlowFormat = ['#f1f6fc', '#162846', 12, 0];
const FLOW_SHAPES = {
  terminal: { label: 'Start / end', path: 'M15 2H85a14 23 0 0 1 0 46H15a14 23 0 0 1 0-46Z' },
  process: { label: 'Process', path: 'M2 2H98V48H2Z' },
  decision: { label: 'Decision', path: 'M50 1 99 25 50 49 1 25Z' },
  inputOutput: { label: 'Input / output', path: 'M17 2H98L83 48H2Z' },
  predefined: { label: 'Subprocess', path: 'M2 2H98V48H2Z M11 2V48 M89 2V48' },
  document: { label: 'Document', path: 'M2 2H98V41C72 57 29 31 2 47Z' },
  manual: { label: 'Manual operation', path: 'M2 2H98L83 48H17Z' },
  delay: { label: 'Delay / waiting', path: 'M2 2H72a26 23 0 0 1 0 46H2Z' },
  preparation: { label: 'Preparation', path: 'M14 2H86L98 25 86 48H14L2 25Z' },
} as const;
type FlowShape = keyof typeof FLOW_SHAPES;
const MAX_FLOW_NODES = 20;
const FLOW_SHAPE_DRAG = 'application/x-sikai-flow-shape';
interface LearningObjectContent {
  fields: (string | undefined)[];
  rows: number;
  columns: number;
  barCount: number;
  rotation: number;
  histogram: boolean;
  binStart: number;
  binWidth: number;
  flowSizes: FlowSize[];
  flowParents: number[];
  flowShapes: FlowShape[];
  flowFormats: (FlowFormat | null)[];
  flowLinks: FlowLink[];
  flowSides: FlowSide[];
  flowPositions: FlowPoint[];
  flowBends: FlowBend[];
}

@Component({
  selector: 'app-whiteboard-note',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="note-titlebar">
      @if (editable()) {
        <button type="button" class="move" [attr.aria-label]="'Move ' + label()"
          (pointerdown)="start($event, 'move')" (pointermove)="move($event)" (pointerup)="finish($event)"
          (pointercancel)="cancel()" (lostpointercapture)="cancel()"
          (keydown)="adjust($event, 'move')"><span aria-hidden="true">⠿</span> {{ title() }}</button>
        <button type="button" class="remove" [attr.aria-label]="'Delete ' + label()" (click)="removed.emit()">×</button>
      } @else {
        <span class="author">{{ title() }}</span>
      }
    </div>
    @if (editable() && (kind() === 'table' || kind() === 'flowchart')) {
      <div class="object-controls">
        <button type="button" aria-label="Rotate clockwise" (click)="rotate()">↻ Rotate</button>
        @if (kind() === 'flowchart') {
          <button type="button" class="shape-toggle" [attr.aria-expanded]="showFlowShapes()"
            (click)="toggleFlowShapes()">Shapes ▾</button>
          <button type="button" [attr.aria-pressed]="connectMode()" (click)="toggleConnect()">Connect</button>
          <button type="button" aria-label="Select flowchart for zoom" title="Select chart, then scroll to zoom" (click)="selectFlowCanvas()">Zoom</button>
          <label title="Box background color"><span aria-hidden="true">Fill</span>
            <input type="color" aria-label="Box background color" [value]="selectedFormat()[0]" (change)="setFlowColor(0, $event)" />
          </label>
          <label title="Font color"><span aria-hidden="true">Text</span>
            <input type="color" aria-label="Font color" [value]="selectedFormat()[1]" (change)="setFlowColor(1, $event)" />
          </label>
          <button type="button" aria-label="Bold" title="Bold" [attr.aria-pressed]="selectedFormat()[3] % 2 === 1"
            (click)="toggleFlowStyle(1)"><strong>B</strong></button>
          <button type="button" aria-label="Italic" title="Italic" [attr.aria-pressed]="selectedFormat()[3] >= 2"
            (click)="toggleFlowStyle(2)"><em>I</em></button>
          <button type="button" aria-label="Decrease font size" title="Decrease font size" (click)="changeFlowFontSize(-1)">A−</button>
          <button type="button" aria-label="Increase font size" title="Increase font size" (click)="changeFlowFontSize(1)">A+</button>
        }
        @if (kind() === 'table') {
          <button type="button" [disabled]="content().rows === 8" (click)="resizeTable('rows', 1)">+ Row</button>
          <button type="button" [disabled]="content().rows === 1" (click)="resizeTable('rows', -1)" aria-label="Remove last row">− Row</button>
          <button type="button" [disabled]="content().columns === 8" (click)="resizeTable('columns', 1)">+ Column</button>
          <button type="button" [disabled]="content().columns === 1" (click)="resizeTable('columns', -1)" aria-label="Remove last column">− Column</button>
        }
      </div>
    }
    @if (kind() === 'flowchart' && editable() && showFlowShapes()) {
      <div class="flow-palette-anchor">
      <div class="flow-palette" role="group" aria-label="Flowchart shapes">
        @for (shape of flowShapeOptions; track shape.kind) {
          <button type="button" draggable="true" [attr.aria-pressed]="pickedShape() === shape.kind"
            [title]="shape.label" (click)="pickShape(shape.kind)"
            (dragstart)="dragShape($event, shape.kind)" (dragend)="endShapeDrag()">
            <svg viewBox="0 0 100 50" aria-hidden="true"><path [attr.d]="shape.path" vector-effect="non-scaling-stroke" /></svg>
            <span>{{ shape.label }}</span>
          </button>
        }
      </div>
      </div>
    }
    @if (kind() === 'flowchart' && connectMode()) {
      <div class="connect-hint" role="status">{{ linkSource() === null ? 'Choose a source box.' : 'Choose the destination box.' }}</div>
    }
    @switch (kind()) {
    @case ('sticky') {
      <textarea [attr.aria-label]="'Sticky note by ' + note().authorName" [readOnly]="!editable()"
      [placeholder]="editable() ? 'Type a note…' : ''" [value]="note().text" maxlength="1500"
      (input)="queueText($any($event.target).value)" (blur)="flushText()"></textarea>
    }
    @case ('table') {
      <div class="rotation-stage">
      <div class="object-body rotatable" [class.quarter-turn]="content().rotation % 180 !== 0"
        [style.rotate]="content().rotation + 'deg'">
        <table aria-label="Whiteboard table"><tbody>
          @for (row of rows(); track row) {
            <tr>
              @for (column of columns(); track column) {
                <td><input [attr.aria-label]="'Row ' + (row + 1) + ', column ' + (column + 1)"
                  [readOnly]="!editable()" [value]="fields()[row * content().columns + column] ?? ''" maxlength="24"
                  (change)="setField(row * content().columns + column, $event)" /></td>
              }
            </tr>
          }
        </tbody></table>
      </div>
      </div>
    }
    @case ('graph') {
      <div class="object-controls">
        @if (content().histogram) {
          <label>Start <input type="number" aria-label="First bin start" [readOnly]="!editable()"
            [value]="content().binStart" (change)="setBin('binStart', $event)" /></label>
          <label>Bin width <input type="number" aria-label="Bin width" min="1" [readOnly]="!editable()"
            [value]="content().binWidth" (change)="setBin('binWidth', $event)" /></label>
        }
        @if (editable()) {
          <button type="button" [disabled]="content().barCount === 10" (click)="resizeGraph(1)">{{ content().histogram ? '+ Bin' : '+ Bar' }}</button>
          <button type="button" [disabled]="content().barCount === 1" (click)="resizeGraph(-1)"
            [attr.aria-label]="content().histogram ? 'Remove last bin' : 'Remove last bar'">{{ content().histogram ? '− Bin' : '− Bar' }}</button>
        }
      </div>
      <div class="object-body">
        <div class="graph" [class.histogram]="content().histogram" [style.--bar-count]="content().barCount">
          <div class="plot" role="img"
            [attr.aria-label]="(content().histogram ? 'Frequency' : 'Value') + ' axis from 0 to ' + graphMax()">
            <div class="plot-guides" aria-hidden="true">
              @for (tick of graphTicks(); track tick) {
                <div class="plot-tick" [style.bottom.%]="tick / graphMax() * 100"><span>{{ tick }}</span></div>
              }
            </div>
            <div class="plot-bars" aria-hidden="true">
              @for (bar of bars(); track $index) {
                <div class="bar-track"><div class="bar" [style.height.%]="bar / graphMax() * 100"></div></div>
              }
            </div>
          </div>
          <div class="graph-labels">
          @for (bar of bars(); track $index; let index = $index) {
            <div class="graph-column">
              <input type="number" min="0" max="9999" step="1"
                [attr.aria-label]="content().histogram ? 'Bin ' + (index + 1) + ' frequency' : 'Bar ' + (index + 1) + ' value'"
                [readOnly]="!editable()" [value]="bar" (change)="setField(index * 2 + 1, $event, true)" />
              @if (content().histogram) {
                <span class="bin-label">{{ binLabel(index) }}</span>
              } @else {
                <input [attr.aria-label]="'Bar ' + (index + 1) + ' label'" [readOnly]="!editable()"
                [value]="fields()[index * 2] ?? graphLabels[index]" maxlength="24"
                (change)="setField(index * 2, $event)" />
              }
            </div>
          }
          </div>
        </div>
      </div>
    }
    @case ('flowchart') {
      <div class="rotation-stage">
      <div class="object-body flow rotatable" [class.quarter-turn]="content().rotation % 180 !== 0"
        tabindex="0" role="region" aria-label="Flowchart canvas. Scroll to zoom. Press Delete to remove the selected box."
        (keydown.delete)="deleteSelectedWithKey($event)"
        [style.rotate]="content().rotation + 'deg'" (wheel)="zoomFlow($event)" (dragover)="allowShapeDrop($event)"
        (drop)="dropShape($event, 0, true)">
        <div class="flow-tree" [class.pinned-flow]="flowLayout() !== null" [style.zoom]="flowZoom()"
          [style.width.px]="flowLayout()?.width" [style.height.px]="flowLayout()?.height"
          [style.--flow-origin]="(flowLayout()?.origin ?? 0) + 'px'">
          @if (linkPaths().length) {
            <svg class="flow-links" aria-hidden="true">
              @for (link of linkPaths(); track link.from + ':' + link.to) {
                <g [attr.data-from]="link.from" [attr.data-to]="link.to"
                  (pointerdown)="editable() && startBend($event, link)" (pointermove)="moveBend($event)"
                  (pointerup)="finishBend($event)" (pointercancel)="bendDraft.set(null)"
                  (lostpointercapture)="bendDraft.set(null)">
                  <path [attr.d]="link.path" />
                  @if (editable()) {
                    <path class="flow-link-hit" [attr.d]="link.path" />
                    <circle class="flow-link-grip" [attr.cx]="link.bend[0]" [attr.cy]="link.bend[1]" r="5" />
                  }
                </g>
              }
            </svg>
          }
          <ng-container *ngTemplateOutlet="flowNode; context: { $implicit: 0 }" />
        </div>
        <ng-template #flowNode let-index>
          <div class="flow-node">
          @if (flowBranches()[index].left !== null) {
            <div class="flow-left"><ng-container *ngTemplateOutlet="flowNode; context: { $implicit: flowBranches()[index].left }" /></div>
          }
          <div class="flow-center">
          <div class="flow-box" [style.width.px]="flowSizes()[index].width" [style.height.px]="flowSizes()[index].height"
            [style.left.px]="flowLayout()?.positions?.[index]?.[0]" [style.top.px]="flowLayout()?.positions?.[index]?.[1]"
            [class.editable]="editable()" [attr.data-shape]="content().flowShapes[index]"
            [attr.data-flow-index]="index" [class.selected]="editable() && selectedFlowBox() === index"
            [class.link-source]="linkSource() === index"
            [attr.tabindex]="editable() ? 0 : null"
            (focusin)="selectedFlowBox.set(index)"
            (pointerdown)="startFlowMove($event, index)" (pointermove)="moveFlowBox($event)"
            (pointerup)="finishFlowMove($event)" (pointercancel)="cancelFlowMove()" (lostpointercapture)="cancelFlowMove()"
            (keydown)="nudgeFlowBox($event, index)"
            (dragover)="allowShapeDrop($event)" (drop)="dropShape($event, index)">
            <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
              <path [attr.d]="shapePath(index)" [style.fill]="flowFormat(index)[0]" vector-effect="non-scaling-stroke" />
            </svg>
            <textarea [attr.aria-label]="'Flowchart step ' + (index + 1)" [placeholder]="flowPlaceholders[index] || 'New step'"
              [style.color]="flowFormat(index)[1]" [style.font-size.px]="flowFormat(index)[2]"
              [style.font-weight]="flowFormat(index)[3] % 2 === 1 ? '700' : '400'"
              [style.font-style]="flowFormat(index)[3] >= 2 ? 'italic' : 'normal'"
              [readOnly]="!editable()" [value]="fields()[index] ?? ''" [maxLength]="fieldLimit(index)"
              (keydown.escape)="selectFlowBox($event)" (change)="setField(index, $event)"></textarea>
            @if (editable()) {
              <div class="flow-move-edge" title="Drag to move box"></div>
              @if (connectMode()) {
                <button type="button" class="apply-flow-shape" [attr.aria-label]="'Connect flowchart step ' + (index + 1)"
                  (click)="connectBox(index)"></button>
              } @else if (pickedShape(); as shape) {
                <button type="button" class="apply-flow-shape" [attr.aria-label]="'Apply shape to flowchart step ' + (index + 1)"
                  (click)="applyPickedShape(index, shape)"></button>
              }
              <button type="button" class="resize" [attr.aria-label]="'Resize flowchart step ' + (index + 1)"
                (pointerdown)="startFlowResize($event, index)" (pointermove)="moveFlowResize($event)"
                (pointerup)="finishFlowResize($event)" (pointercancel)="cancelFlowResize()"
                (lostpointercapture)="cancelFlowResize()" (keydown)="adjustFlowSize($event, index)"></button>
              @if (!connectMode() && content().flowParents.length < maxFlowNodes) {
                @for (side of flowAddSides; track side) {
                  @if (side === 'bottom' || flowBranches()[index][side] === null) {
                    <button type="button" class="add-flow-child" [attr.data-side]="side"
                      [title]="side === 'bottom' ? 'Add box below' : 'Add box on the ' + side"
                      [attr.aria-label]="side === 'bottom' ? 'Add child to flowchart step ' + (index + 1) : 'Add box on the ' + side + ' of flowchart step ' + (index + 1)"
                      (click)="addPickedChild(index, side)" (dragover)="allowShapeDrop($event)" (drop)="dropShape($event, index, true, side)">
                      <span aria-hidden="true">+</span>
                    </button>
                  }
                }
              }
            }
          </div>
          @if (flowBranches()[index].bottom.length) {
            <ul class="flow-children" [attr.aria-label]="'Branches from step ' + (index + 1)">
              @for (child of flowBranches()[index].bottom; track child) {
                <li><ng-container *ngTemplateOutlet="flowNode; context: { $implicit: child }" /></li>
              }
            </ul>
          }
          </div>
          @if (flowBranches()[index].right !== null) {
            <div class="flow-right"><ng-container *ngTemplateOutlet="flowNode; context: { $implicit: flowBranches()[index].right }" /></div>
          }
          </div>
        </ng-template>
      </div>
      </div>
    }
    }
    @if (editable()) {
      <button type="button" class="resize" [attr.aria-label]="'Resize ' + label()"
        (pointerdown)="start($event, 'resize')" (pointermove)="move($event)" (pointerup)="finish($event)"
        (pointercancel)="cancel()" (lostpointercapture)="cancel()"
        (keydown)="adjust($event, 'resize')">
        @if (kind() !== 'flowchart') { <span aria-hidden="true">◢</span> }
      </button>
    }
  `,
  host: {
    '[class.pink]': "note().color === 'pink'",
    '[class.learning-object]': "kind() !== 'sticky'",
    '[style.left.%]': 'bounds().x / 10',
    '[style.top.%]': 'bounds().y / 10',
    '[style.width.%]': 'bounds().width / 10',
    '[style.height.%]': 'bounds().height / 10',
  },
  styles: [`
    :host { position: absolute; z-index: 1; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d5b66b; border-radius: 5px; color: #302819; background: #fff0a3; box-shadow: 0 3px 8px #36281729; }
    :host(.pink) { border-color: #d98da9; color: #462336; background: #ffcee0; }
    :host(.learning-object) { border-color: #aebfdb; color: #162846; background: #fff; }
    :host(.learning-object) .note-titlebar { background: #e9f0fa; }
    :host(:focus-within) { z-index: 2; }
    .note-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 2px; min-height: 24px; padding-inline: 3px; background: #51350212; }
    .note-titlebar button, .resize { border: 0; background: transparent; color: inherit; font: inherit; line-height: 1; }
    .move, .author { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .68rem; font-weight: 700; }
    .move { flex: 1; min-height: 24px; padding: 2px; text-align: start; cursor: grab; touch-action: none; }
    .move:active { cursor: grabbing; }
    .remove { width: 22px; height: 22px; padding: 0; cursor: pointer; }
    textarea { flex: 1; min-width: 0; min-height: 0; width: 100%; border: 0; border-radius: 0; padding: 5px 7px 14px; resize: none; color: inherit; background: transparent; font: inherit; font-size: clamp(10px, 1.4vw, 14px); }
    textarea:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    .object-body { flex: 1; min-height: 0; overflow: auto; padding: 6px 8px 16px; }
    .object-controls { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px 5px; max-height: 40%; overflow: auto; }
    .object-controls button, .object-controls label { margin: 0; color: #000; font: inherit; font-size: .75rem; }
    .object-controls button { min-height: 24px; border: 1px solid #aebfdb; border-radius: 4px; padding: 2px 6px; background: #f1f6fc; }
    .object-controls button:disabled { opacity: .45; }
    .object-controls label { display: inline-flex; align-items: center; gap: 3px; }
    .object-controls input { width: 54px; border: 1px solid #aebfdb; }
    .rotation-stage { position: relative; container-type: size; flex: 1; min-height: 0; overflow: hidden; }
    .rotatable { position: absolute; top: 50%; left: 50%; translate: -50% -50%; box-sizing: border-box; width: 100cqw; height: 100cqh; }
    .rotatable.quarter-turn { width: 100cqh; height: 100cqw; }
    table { width: 100%; height: 100%; min-width: 130px; border-collapse: collapse; table-layout: fixed; }
    td { min-width: 30px; }
    td { border: 1px solid #bdcbe0; padding: 0; }
    tr:first-child { background: #e9f0fa; }
    input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 22px; padding: 2px 4px; border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; font-size: .75rem; }
    input:focus-visible { outline: 2px solid #355c9c; outline-offset: -2px; }
    .graph { display: grid; grid-template-rows: minmax(56px, 1fr) auto; gap: 3px; height: 100%; min-width: calc(39px + 44px * var(--bar-count)); padding: 7px 2px 0 37px; box-sizing: border-box; }
    .plot { position: relative; border: solid #344a69; border-width: 0 0 1px 1px; }
    .plot-guides, .plot-bars { position: absolute; inset: 0; }
    .plot-tick { position: absolute; inset-inline: 0; border-top: 1px solid #dce4ef; }
    .plot-tick:first-child { border-color: transparent; }
    .plot-tick span { position: absolute; inset-inline-end: calc(100% + 4px); transform: translateY(-50%); font-size: .65rem; font-variant-numeric: tabular-nums; }
    .plot-bars, .graph-labels { display: grid; grid-template-columns: repeat(var(--bar-count), minmax(0, 1fr)); }
    .graph-labels { padding-inline-start: 1px; }
    .graph-column { display: flex; flex-direction: column; min-width: 0; }
    .graph-column input { text-align: center; }
    .bar-track { display: flex; align-items: flex-end; justify-content: center; }
    .bar { width: 65%; border-radius: 3px 3px 0 0; background: #426caa; }
    .histogram .bar { width: 100%; border-radius: 0; box-shadow: inset -1px 0 #fff; }
    .bin-label { padding: 2px; text-align: center; font-size: .65rem; overflow-wrap: anywhere; }
    .flow-tree { position: relative; width: max-content; min-width: 100%; box-sizing: border-box; padding: 8px 14px 0; }
    .pinned-flow { min-width: calc(100% + var(--flow-origin)); }
    .pinned-flow :is(.flow-node, .flow-center, .flow-left, .flow-right, .flow-children, .flow-children > li) { display: contents; }
    .pinned-flow .flow-box { position: absolute; }
    .flow-links { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    .flow-links path { fill: none; stroke: #3767a3; stroke-width: 1.5; }
    .flow-links .flow-link-hit { stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: move; touch-action: none; }
    .flow-link-grip { fill: #fff; stroke: #3767a3; opacity: 0; pointer-events: all; cursor: move; touch-action: none; }
    .flow-links g:hover .flow-link-grip { opacity: 1; }
    .flow-node { display: grid; grid-template-columns: auto auto auto; align-items: start; }
    .flow-left { grid-column: 1; grid-row: 1; margin-inline-end: 28px; }
    .flow-center { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; align-items: center; }
    .flow-right { grid-column: 3; grid-row: 1; margin-inline-start: 28px; }
    .flow:focus { outline: 2px solid #6389be; outline-offset: -2px; }
    .flow-box { position: relative; z-index: 2; display: flex; flex: none; box-sizing: border-box; }
    .flow-box.editable, .flow-move-edge { cursor: grab; touch-action: none; }
    .flow-box.editable:active, .flow-move-edge:active { cursor: grabbing; }
    .flow-move-edge { position: absolute; z-index: 1; inset: 0 10px auto; height: 6px; }
    .flow-box svg { position: absolute; inset: 0; width: 100%; height: 100%; fill: #f1f6fc; stroke: #7089b0; stroke-width: 1; pointer-events: none; }
    .flow-box.selected svg { stroke: #315c9c; stroke-width: 1.6; }
    .flow-box.link-source svg { stroke: #006e5c; stroke-width: 2.5; }
    .flow-box textarea { position: relative; box-sizing: border-box; margin: 2px 4px; padding: 3px 14%; text-align: center; font-size: .75rem; line-height: 1.25; }
    .flow-box.editable textarea { cursor: text; }
    .flow-box[data-shape="decision"] textarea { padding: 12px 24%; }
    .flow-box.editable textarea { padding-bottom: max(10px, 4%); }
    .flow-palette-anchor { position: relative; z-index: 3; height: 0; }
    .flow-palette { position: absolute; inset-block-start: 2px; inset-inline-start: 4px; width: min(178px, calc(100% - 8px)); box-sizing: border-box; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; padding: 3px; border: 1px solid #c6d5ea; border-radius: 5px; background: #f7faff; box-shadow: 0 3px 10px #16284624; }
    .flow-palette button { display: flex; align-items: center; gap: 4px; min-height: 23px; padding: 2px 4px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: #000; font: inherit; font-size: .75rem; text-align: start; cursor: grab; }
    .flow-palette button:hover, .flow-palette button[aria-pressed="true"] { border-color: #aebfdb; background: #e9f0fa; }
    .flow-palette svg { flex: none; width: 20px; height: 14px; fill: #fff; stroke: #526d94; stroke-width: 1; pointer-events: none; }
    .object-controls button[aria-pressed="true"] { background: #cfdef3; border-color: #6389be; }
    .object-controls input[type="color"] { width: 24px; height: 20px; min-height: 0; padding: 1px; cursor: pointer; }
    .connect-hint { padding: 2px 6px; color: #344a69; font-size: .65rem; }
    .add-flow-child { opacity: 0; position: absolute; z-index: 2; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 1px solid #aebfdb; border-radius: 50%; background: #fff; color: #344a69; font: 15px/1 sans-serif; cursor: pointer; }
    .add-flow-child[data-side="left"] { top: 50%; left: 0; translate: 0 -50%; }
    .add-flow-child[data-side="right"] { top: 50%; right: 8px; translate: 0 -50%; }
    .add-flow-child[data-side="bottom"] { bottom: 0; left: 50%; translate: -50% 50%; }
    .add-flow-child:hover, .add-flow-child:focus-visible { opacity: 1; background: #e9f0fa; }
    @media (hover: none) { .flow-box:focus-within .add-flow-child { opacity: 1; } }
    .apply-flow-shape { position: absolute; inset: 0; padding: 0; background: transparent; border: 0; cursor: copy; }
    .apply-flow-shape:hover { outline: 1px dashed #526d94; }
    .flow-children { position: relative; display: flex; justify-content: center; list-style: none; margin: 0; padding: 10px 0 0; }
    .flow-children > li { position: relative; padding: 13px 6px 0; }
    .resize { position: absolute; right: 0; bottom: 0; width: 22px; height: 17px; padding: 0; cursor: nwse-resize; touch-action: none; }
    .flow-box .resize { z-index: 3; width: 12px; height: 12px; }
    .quarter-turn .flow-box .resize { cursor: nesw-resize; }
    @media (max-width: 640px) {
      .note-titlebar, .move { min-height: 16px; }
      .remove, .resize { width: 16px; height: 16px; }
      textarea { padding: 2px 3px 4px; }
    }
  `],
})
export class WhiteboardNoteComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly note = input.required<StickyNote>();
  readonly editable = input(false);
  readonly changed = output<NotePatch>();
  readonly removed = output<void>();
  readonly flowPlaceholders = ['Start', 'Next step', 'Finish'];
  readonly maxFlowNodes = MAX_FLOW_NODES;
  readonly flowAddSides = ['left', 'right', 'bottom'] as const;
  readonly flowZoom = signal(1);
  readonly showFlowShapes = signal(false);
  readonly pickedShape = signal<FlowShape | null>(null);
  readonly selectedFlowBox = signal(0);
  readonly connectMode = signal(false);
  readonly linkSource = signal<number | null>(null);
  readonly linkPaths = signal<RoutedFlowLink[]>([]);
  readonly bendDraft = signal<FlowBend | null>(null);
  private readonly flowMoveDraft = signal<FlowPoint[] | null>(null);
  private flowMoveGesture?: { pointerId: number; index: number; x: number; y: number; positions: FlowPoint[] };
  private flowOrigin = 0;
  readonly selectedFormat = computed(() => this.flowFormat(this.selectedFlowBox()));
  readonly flowShapeOptions = (Object.keys(FLOW_SHAPES) as FlowShape[])
    .map(kind => ({ kind, ...FLOW_SHAPES[kind] }));
  private readonly draft = signal<NoteBounds | null>(null);
  readonly bounds = computed(() => this.draft() ?? this.note());
  readonly kind = computed(() => this.note().kind ?? 'sticky');
  readonly label = computed(() => this.content().histogram ? 'histogram'
    : ({ sticky: 'sticky note', table: 'table', graph: 'bar graph', flowchart: 'flowchart' })[this.kind()]);
  readonly title = computed(() => this.kind() === 'sticky'
    ? this.note().authorName
    : this.label().replace(/^./, char => char.toUpperCase()) + ' · ' + this.note().authorName);
  readonly content = computed<LearningObjectContent>(() => {
    let saved: Partial<LearningObjectContent> = {};
    if (this.kind() !== 'sticky' && this.note().text) {
      try {
        const value: unknown = JSON.parse(this.note().text);
        if (Array.isArray(value)) saved = { fields: value };
        else if (value && typeof value === 'object') saved = value;
      } catch {
        // An empty object is usable even if saved content cannot be read.
      }
    }
    const parents = Array.isArray(saved.flowParents) ? saved.flowParents.slice(0, MAX_FLOW_NODES) : [-1, 0, 1];
    const flowParents = Array.from({ length: Math.max(1, parents.length) }, (_, index) =>
      index === 0 ? -1 : this.integer(parents[index], index - 1, 0, index - 1));
    const flowShapes = Array.isArray(saved.flowShapes) ? saved.flowShapes : [];
    return {
      fields: Array.isArray(saved.fields)
        ? saved.fields.slice(0, this.kind() === 'flowchart' ? flowParents.length : 64)
          .map((field, index) => typeof field === 'string' ? field.slice(0, this.fieldLimit(index)) : undefined)
        : [],
      rows: this.integer(saved.rows, 3, 1, 8),
      columns: this.integer(saved.columns, 3, 1, 8),
      barCount: this.integer(saved.barCount, 4, 1, 10),
      rotation: [0, 90, 180, 270].find(angle => angle === saved.rotation) ?? 0,
      histogram: this.kind() === 'graph' && saved.histogram === true,
      binStart: this.integer(saved.binStart, 0, -9999, 9999),
      binWidth: this.integer(saved.binWidth, 10, 1, 9999),
      flowParents,
      flowSides: flowParents.map((_, index) => {
        const side = Array.isArray(saved.flowSides) ? saved.flowSides[index] : undefined;
        return side === 'left' || side === 'right' ? side : 'bottom';
      }),
      flowPositions: Array.isArray(saved.flowPositions) && saved.flowPositions.length === flowParents.length &&
        saved.flowPositions.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
        ? saved.flowPositions : [],
      flowBends: Array.isArray(saved.flowBends) ? saved.flowBends.slice(0, 60).filter(bend =>
        Array.isArray(bend) && bend.length === 4 && bend.every(Number.isFinite) &&
        Number.isInteger(bend[0]) && Number.isInteger(bend[1]) &&
        bend[0] >= 0 && bend[0] < flowParents.length && bend[1] >= 0 && bend[1] < flowParents.length) : [],
      flowFormats: Array.isArray(saved.flowFormats) ? saved.flowFormats.slice(0, flowParents.length).map(format =>
        Array.isArray(format) ? [
          this.flowColor(format[0], DEFAULT_FLOW_FORMAT[0]), this.flowColor(format[1], DEFAULT_FLOW_FORMAT[1]),
          this.integer(format[2], DEFAULT_FLOW_FORMAT[2], 10, 32), this.integer(format[3], 0, 0, 3),
        ] : null) : [],
      flowLinks: Array.isArray(saved.flowLinks) ? saved.flowLinks.slice(0, 40).filter(link =>
        Array.isArray(link) && link.length === 2 && link[0] !== link[1] &&
        link.every(index => Number.isInteger(index) && index >= 0 && index < flowParents.length)) : [],
      flowShapes: flowParents.map((_, index) => {
        const shape = flowShapes[index];
        return Object.hasOwn(FLOW_SHAPES, shape) ? shape : index === 0 || index === 2 ? 'terminal' : 'process';
      }),
      flowSizes: flowParents.map((_, index) => {
        const size = Array.isArray(saved.flowSizes) ? saved.flowSizes[index] : undefined;
        return {
          width: this.integer(size?.width, 160, 64, 600),
          height: this.integer(size?.height, 32, 28, 260),
        };
      }),
    };
  });
  readonly fields = computed(() => this.content().fields);
  readonly rows = computed(() => Array.from({ length: this.content().rows }, (_, index) => index));
  readonly columns = computed(() => Array.from({ length: this.content().columns }, (_, index) => index));
  readonly graphLabels = 'ABCDEFGHIJ';
  readonly bars = computed(() => Array.from({ length: this.content().barCount }, (_, index) => {
    const value = Number(this.fields()[index * 2 + 1] ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.round(value))) : 0;
  }));
  readonly graphTicks = computed(() => {
    const target = Math.max(1, ...this.bars()) / 4;
    const magnitude = Math.max(1, 10 ** Math.floor(Math.log10(target)));
    const step = ([1, 2, 5, 10].find(value => value * magnitude >= target) ?? 10) * magnitude;
    return [0, step, step * 2, step * 3, step * 4];
  });
  readonly graphMax = computed(() => this.graphTicks()[4]);
  private readonly flowDraft = signal<{ index: number; size: FlowSize } | null>(null);
  readonly flowSizes = computed(() => this.content().flowSizes.map((size, index) => {
    const draft = this.flowDraft();
    return draft?.index === index ? draft.size : size;
  }));
  readonly flowBranches = computed(() => {
    const { flowParents, flowSides } = this.content();
    const branches = flowParents.map(() => ({ left: null as number | null, right: null as number | null, bottom: [] as number[] }));
    flowParents.forEach((parent, index) => {
      if (parent < 0) return;
      const side = flowSides[index];
      const group = branches[parent];
      if (side !== 'bottom' && group[side] === null) group[side] = index;
      else group.bottom.push(index);
    });
    return branches;
  });
  readonly flowLayout = computed(() => {
    const positions = this.flowMoveDraft() ?? this.content().flowPositions;
    if (!positions.length) return null;
    const origin = Math.max(0, 14 - Math.min(...positions.map(([x]) => x)));
    const sizes = this.flowSizes();
    return {
      origin,
      positions: positions.map(([x, y]): FlowPoint => [x + origin, y]),
      width: Math.max(...positions.map(([x], index) => x + sizes[index].width)) + origin + 28,
      height: Math.max(...positions.map(([, y], index) => y + sizes[index].height)) + 20,
    };
  });
  private gesture?: { pointerId: number; mode: 'move' | 'resize'; startX: number; startY: number; board: DOMRect; original: NoteBounds };
  private flowGesture?: { pointerId: number; index: number; x: number; y: number; rotation: number; size: FlowSize };
  private textTimer?: number;
  private pendingText?: string;

  constructor() {
    const render = afterEveryRender({ mixedReadWrite: () => {
      const origin = this.flowLayout()?.origin ?? 0;
      if (origin !== this.flowOrigin) {
        const canvas = this.host.nativeElement.querySelector<HTMLElement>('.flow.rotatable');
        if (canvas) canvas.scrollLeft += (origin - this.flowOrigin) * this.flowZoom();
        this.flowOrigin = origin;
      }
      this.updateFlowLinks();
    } });
    const observer = new ResizeObserver(() => this.updateFlowLinks());
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      render.destroy();
      observer.disconnect();
      this.flushText();
    });
  }

  flowFormat(index: number): FlowFormat {
    return this.content().flowFormats[index] ?? DEFAULT_FLOW_FORMAT;
  }

  selectFlowCanvas(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.flow.rotatable')?.focus();
  }

  selectFlowBox(event: Event): void {
    if (!this.editable()) return;
    (event.currentTarget as HTMLElement).parentElement?.focus();
  }

  deleteSelectedWithKey(event: Event): void {
    const target = event.target as HTMLElement;
    if (!this.editable() || (event as KeyboardEvent).repeat || (target instanceof HTMLTextAreaElement && target.value)) return;
    event.preventDefault();
    this.deleteFlowBox();
  }

  zoomFlow(event: WheelEvent): void {
    const canvas = event.currentTarget as HTMLElement;
    if (canvas.ownerDocument.activeElement !== canvas || !event.deltaY || event.ctrlKey) return;
    event.preventDefault();
    this.flowZoom.update(zoom => this.integer(zoom * 100 - Math.sign(event.deltaY) * 10, 100, 40, 220) / 100);
  }

  deleteFlowBox(): void {
    if (!this.editable()) return;
    const removed = this.selectedFlowBox();
    const { flowParents, flowSides, flowSizes, flowShapes, flowFormats, flowLinks, flowPositions, flowBends, fields } = this.content();
    if (flowParents.length === 1) {
      this.removed.emit();
      return;
    }
    const remap = (index: number) => index > removed ? index - 1 : index;
    const withoutRemoved = <T,>(values: T[]): T[] => values.filter((_, index) => index !== removed);
    const parent = flowParents[removed];
    this.selectedFlowBox.set(parent < 0 ? 0 : parent);
    if (this.connectMode()) this.toggleConnect();
    this.saveContent({
      fields: withoutRemoved(fields),
      flowParents: withoutRemoved(flowParents.map((ancestor, index) => {
        if (removed === 0 && index === 1) return -1;
        return ancestor === removed ? Math.max(0, parent) : remap(ancestor);
      })),
      flowSides: withoutRemoved(flowSides.map((side, index) => flowParents[index] === removed ? 'bottom' : side)),
      flowSizes: withoutRemoved(flowSizes),
      flowShapes: withoutRemoved(flowShapes),
      flowFormats: withoutRemoved(flowFormats),
      flowPositions: withoutRemoved(flowPositions),
      flowBends: flowBends.filter(([from, to]) => from !== removed && to !== removed)
        .map(([from, to, x, y]) => [remap(from), remap(to), x, y]),
      flowLinks: flowLinks.filter(link => !link.includes(removed)).map(([from, to]) => [remap(from), remap(to)]),
    });
  }

  setFlowColor(channel: 0 | 1, event: Event): void {
    const format = [...this.selectedFormat()] as FlowFormat;
    format[channel] = this.flowColor((event.target as HTMLInputElement).value, format[channel]);
    this.saveFlowFormat(format);
  }

  toggleFlowStyle(flag: number): void {
    const [fill, textColor, size, flags] = this.selectedFormat();
    this.saveFlowFormat([fill, textColor, size, flags ^ flag]);
  }

  changeFlowFontSize(delta: number): void {
    const [fill, textColor, size, flags] = this.selectedFormat();
    this.saveFlowFormat([fill, textColor, this.integer(size + delta, size, 10, 32), flags]);
  }

  private flowColor(value: unknown, fallback: string): string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  private saveFlowFormat(format: FlowFormat): void {
    const flowFormats = [...this.content().flowFormats];
    flowFormats[this.selectedFlowBox()] = format;
    this.saveContent({ flowFormats });
  }

  toggleConnect(): void {
    this.connectMode.update(active => !active);
    this.linkSource.set(null);
    this.pickedShape.set(null);
    if (this.connectMode()) this.showFlowShapes.set(false);
  }

  connectBox(index: number): void {
    const from = this.linkSource();
    if (from === null || from === index) {
      this.linkSource.set(from === index ? null : index);
      return;
    }
    const links = this.content().flowLinks;
    const existing = links.findIndex(([source, target]) => source === from && target === index);
    if (existing >= 0) this.saveContent({ flowLinks: links.filter((_, position) => position !== existing) });
    else if (links.length < 40) this.saveContent({ flowLinks: [...links, [from, index]] });
    this.toggleConnect();
  }

  private updateFlowLinks(): void {
    if (this.kind() !== 'flowchart') return;
    const bounds = this.readFlowBounds();
    const { flowParents, flowLinks, flowBends } = this.content();
    const origin = this.flowLayout()?.origin ?? 0;
    const links = new Map<string, FlowLink>();
    flowParents.forEach((parent, index) => {
      if (parent >= 0) links.set(parent + ':' + index, [parent, index]);
    });
    flowLinks.forEach(([from, to]) => links.set(from + ':' + to, [from, to]));
    const draft = this.bendDraft();
    const paths: RoutedFlowLink[] = [];
    for (const [from, to] of links.values()) {
      const source = bounds.get(from);
      const target = bounds.get(to);
      if (!source?.width || !target?.width) continue;
      const adjusted = draft?.[0] === from && draft[1] === to
        ? draft : flowBends.find(bend => bend[0] === from && bend[1] === to);
      const bend: FlowPoint = adjusted
        ? [adjusted[2] + origin, adjusted[3]]
        : [(source.x + source.width / 2 + target.x + target.width / 2) / 2,
           (source.y + source.height / 2 + target.y + target.height / 2) / 2];
      const start = this.flowPort(source, bend);
      const end = this.flowPort(target, bend);
      const length = Math.hypot(end[0] - bend[0], end[1] - bend[1]) || 1;
      const dx = (end[0] - bend[0]) / length;
      const dy = (end[1] - bend[1]) / length;
      const backX = end[0] - dx * 7;
      const backY = end[1] - dy * 7;
      paths.push({
        from, to, bend,
        path: `M${start.join(' ')} L${bend.join(' ')} L${end.join(' ')} M${backX - dy * 3} ${backY + dx * 3} L${end.join(' ')} ${backX + dy * 3} ${backY - dx * 3}`,
      });
    }
    const previous = this.linkPaths();
    if (paths.length !== previous.length || paths.some((link, index) =>
      link.path !== previous[index].path || link.from !== previous[index].from || link.to !== previous[index].to)) this.linkPaths.set(paths);
  }

  private readFlowBounds(): Map<number, NoteBounds> {
    const tree = this.host.nativeElement.querySelector<HTMLElement>('.flow-tree');
    const boxes = new Map<number, NoteBounds>();
    if (!tree) return boxes;
    for (const box of Array.from(tree.querySelectorAll<HTMLElement>('.flow-box'))) {
      let x = 0;
      let y = 0;
      for (let element: HTMLElement | null = box; element && element !== tree; element = element.offsetParent as HTMLElement | null) {
        x += element.offsetLeft;
        y += element.offsetTop;
      }
      boxes.set(Number(box.dataset['flowIndex']), { x, y, width: box.offsetWidth, height: box.offsetHeight });
    }
    return boxes;
  }

  private currentFlowPositions(): FlowPoint[] {
    const { flowPositions, flowParents } = this.content();
    if (flowPositions.length) return flowPositions;
    const bounds = this.readFlowBounds();
    return flowParents.map((_, index) => {
      const box = bounds.get(index);
      return [box?.x ?? 14, box?.y ?? 8];
    });
  }

  startFlowMove(event: PointerEvent, index: number): void {
    const box = event.currentTarget as HTMLElement;
    const target = event.target as HTMLElement;
    if (!this.editable() || this.connectMode() || this.pickedShape() || event.button !== 0 || this.flowMoveGesture ||
      (target !== box && !target.classList.contains('flow-move-edge'))) return;
    event.preventDefault();
    box.focus({ preventScroll: true });
    box.setPointerCapture(event.pointerId);
    this.flowMoveGesture = {
      pointerId: event.pointerId, index, x: event.clientX, y: event.clientY, positions: this.currentFlowPositions(),
    };
  }

  moveFlowBox(event: PointerEvent): void {
    const gesture = this.flowMoveGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!this.flowMoveDraft() && Math.hypot(dx, dy) < 3) return;
    this.flowMoveDraft.set(this.moveFlowPosition(gesture.positions, gesture.index, dx, dy));
  }

  finishFlowMove(event: PointerEvent): void {
    if (this.flowMoveGesture?.pointerId !== event.pointerId) return;
    this.moveFlowBox(event);
    const positions = this.flowMoveDraft();
    if (positions) this.saveContent({ flowPositions: positions });
    this.cancelFlowMove();
  }

  cancelFlowMove(): void {
    this.flowMoveGesture = undefined;
    this.flowMoveDraft.set(null);
  }

  nudgeFlowBox(event: KeyboardEvent, index: number): void {
    if (!this.editable() || event.target !== event.currentTarget) return;
    const steps: Record<string, FlowPoint> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    this.saveContent({ flowPositions: this.moveFlowPosition(this.currentFlowPositions(), index, ...step) });
  }

  private moveFlowPosition(positions: FlowPoint[], index: number, dx: number, dy: number): FlowPoint[] {
    const angle = this.content().rotation * Math.PI / 180;
    const zoom = this.flowZoom();
    const localX = (dx * Math.cos(angle) + dy * Math.sin(angle)) / zoom;
    const localY = (dy * Math.cos(angle) - dx * Math.sin(angle)) / zoom;
    return positions.map(([x, y], position) =>
      position === index ? [Math.round(x + localX), Math.max(8, Math.round(y + localY))] : [x, y]);
  }

  private flowPort(box: NoteBounds, toward: FlowPoint): FlowPoint {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const dx = toward[0] - x;
    const dy = toward[1] - y;
    const scale = Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2)) || 1;
    return [x + dx / scale, y + dy / scale];
  }

  startBend(event: PointerEvent, link: RoutedFlowLink): void {
    if (event.button !== 0 || this.bendDraft()) return;
    event.preventDefault();
    (event.currentTarget as SVGGElement).setPointerCapture(event.pointerId);
    this.bendDraft.set([link.from, link.to, link.bend[0] - (this.flowLayout()?.origin ?? 0), link.bend[1]]);
  }

  moveBend(event: PointerEvent): void {
    const draft = this.bendDraft();
    const control = event.currentTarget as SVGGElement;
    const svg = control.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!draft || !matrix || !control.hasPointerCapture(event.pointerId)) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    this.bendDraft.set([draft[0], draft[1],
      Math.round(point.x) - (this.flowLayout()?.origin ?? 0), Math.round(point.y)]);
  }

  finishBend(event: PointerEvent): void {
    this.moveBend(event);
    const draft = this.bendDraft();
    if (!draft) return;
    const saved = this.content().flowBends.filter(([from, to]) => from !== draft[0] || to !== draft[1]);
    this.saveContent({ flowBends: [...saved, draft] });
    this.bendDraft.set(null);
  }

  setField(index: number, event: Event, numeric = false): void {
    if (!this.editable()) return;
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    const fields = [...this.fields()];
    fields[index] = numeric
      ? String(this.integer((input as HTMLInputElement).valueAsNumber, 0, 0, 9999))
      : input.value.slice(0, this.fieldLimit(index));
    input.value = fields[index];
    this.saveContent({ fields });
  }

  fieldLimit(index: number): number {
    return this.kind() === 'flowchart' ? (index < 3 ? 240 : 60) : 24;
  }

  shapePath(index: number): string {
    return FLOW_SHAPES[this.content().flowShapes[index]].path;
  }

  toggleFlowShapes(): void {
    this.showFlowShapes.update(visible => !visible);
    this.pickedShape.set(null);
    if (this.connectMode()) this.toggleConnect();
  }

  pickShape(shape: FlowShape): void {
    this.pickedShape.update(current => current === shape ? null : shape);
  }

  applyPickedShape(index: number, shape: FlowShape): void {
    this.setFlowShape(index, shape);
    this.pickedShape.set(null);
  }

  addPickedChild(parent: number, side: FlowSide): void {
    this.addFlowChild(parent, this.pickedShape() ?? 'process', side);
    this.pickedShape.set(null);
  }

  dragShape(event: DragEvent, shape: FlowShape): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(FLOW_SHAPE_DRAG, shape);
    event.dataTransfer.effectAllowed = 'copy';
  }

  endShapeDrag(): void {
    this.pickedShape.set(null);
  }

  allowShapeDrop(event: DragEvent): void {
    if (!this.editable() || !event.dataTransfer?.types.includes(FLOW_SHAPE_DRAG)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  dropShape(event: DragEvent, index: number, child = false, side: FlowSide = 'bottom'): void {
    const shape = event.dataTransfer?.getData(FLOW_SHAPE_DRAG) as FlowShape | undefined;
    if (!this.editable() || !shape || !Object.hasOwn(FLOW_SHAPES, shape)) return;
    event.preventDefault();
    event.stopPropagation();
    if (child) this.addFlowChild(index, shape, side);
    else this.setFlowShape(index, shape);
    this.pickedShape.set(null);
  }

  private addFlowChild(parent: number, shape: FlowShape, side: FlowSide): void {
    const { flowParents, flowSides, flowShapes, flowSizes, flowPositions } = this.content();
    if (flowParents.length >= MAX_FLOW_NODES || (side !== 'bottom' && this.flowBranches()[parent][side] !== null)) return;
    const newSize = { width: 140, height: shape === 'decision' ? 56 : 40 };
    let positions = side === 'bottom' ? flowPositions : this.currentFlowPositions();
    if (positions.length) {
      const [parentX, parentY] = positions[parent];
      const parentSize = flowSizes[parent];
      const sideX = side === 'left' ? parentX - newSize.width - 38 : parentX + parentSize.width + 38;
      let x = side === 'bottom' ? parentX + Math.round((parentSize.width - newSize.width) / 2) : sideX;
      let y = side === 'bottom' ? parentY + parentSize.height + 30 : Math.max(8, parentY + Math.round((parentSize.height - newSize.height) / 2));
      while (positions.some(([left, top], index) =>
        x < left + flowSizes[index].width + 16 && x + newSize.width + 16 > left &&
        y < top + flowSizes[index].height + 16 && y + newSize.height + 16 > top)) {
        if (side === 'bottom') x += newSize.width + 24;
        else y += newSize.height + 24;
      }
      positions = [...positions, [x, y]];
    }
    this.saveContent({
      flowParents: [...flowParents, parent],
      flowSides: [...flowSides, side],
      flowShapes: [...flowShapes, shape],
      flowSizes: [...flowSizes, newSize],
      flowPositions: positions,
    });
  }

  private setFlowShape(index: number, shape: FlowShape): void {
    const { flowShapes, flowSizes } = this.content();
    const shapes = [...flowShapes];
    shapes[index] = shape;
    const sizes = flowSizes.map((size, position) =>
      position === index && shape === 'decision' ? { ...size, height: Math.max(size.height, 56) } : size);
    this.saveContent({ flowShapes: shapes, flowSizes: sizes });
  }

  startFlowResize(event: PointerEvent, index: number): void {
    if (!this.editable() || event.button !== 0 || this.flowGesture) return;
    const control = event.currentTarget as HTMLButtonElement;
    const box = control.parentElement;
    if (!box) return;
    event.preventDefault();
    control.focus();
    control.setPointerCapture(event.pointerId);
    this.flowGesture = {
      pointerId: event.pointerId, index, x: event.clientX, y: event.clientY,
      rotation: this.content().rotation * Math.PI / 180,
      size: { width: box.offsetWidth, height: box.offsetHeight },
    };
  }

  moveFlowResize(event: PointerEvent): void {
    const gesture = this.flowGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = (event.clientX - gesture.x) / this.flowZoom();
    const dy = (event.clientY - gesture.y) / this.flowZoom();
    const cos = Math.cos(gesture.rotation);
    const sin = Math.sin(gesture.rotation);
    const size = this.shiftFlowSize(gesture.size, dx * cos + dy * sin, dy * cos - dx * sin);
    this.flowDraft.set({ index: gesture.index, size });
  }

  finishFlowResize(event: PointerEvent): void {
    if (this.flowGesture?.pointerId !== event.pointerId) return;
    this.moveFlowResize(event);
    const draft = this.flowDraft();
    this.cancelFlowResize();
    if (draft) this.saveFlowSize(draft.index, draft.size);
  }

  cancelFlowResize(): void {
    this.flowGesture = undefined;
    this.flowDraft.set(null);
  }

  adjustFlowSize(event: KeyboardEvent, index: number): void {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).parentElement;
    if (box) this.saveFlowSize(index, this.shiftFlowSize({ width: box.offsetWidth, height: box.offsetHeight }, ...step));
  }

  private shiftFlowSize(size: FlowSize, dx: number, dy: number): FlowSize {
    return {
      width: this.integer(size.width + dx, size.width, 64, 600),
      height: this.integer(size.height + dy, size.height, 28, 260),
    };
  }

  private saveFlowSize(index: number, size: FlowSize): void {
    const flowSizes = [...this.content().flowSizes];
    flowSizes[index] = size;
    this.saveContent({ flowSizes });
  }

  rotate(): void {
    this.saveContent({ rotation: (this.content().rotation + 90) % 360 });
  }

  resizeTable(axis: 'rows' | 'columns', step: number): void {
    const { rows, columns, fields } = this.content();
    const nextRows = axis === 'rows' ? rows + step : rows;
    const nextColumns = axis === 'columns' ? columns + step : columns;
    const cells = Array.from({ length: nextRows * nextColumns }, (_, index) => {
      const row = Math.floor(index / nextColumns);
      const column = index % nextColumns;
      return row < rows && column < columns ? fields[row * columns + column] : undefined;
    });
    this.saveContent({ fields: cells, rows: nextRows, columns: nextColumns });
  }

  resizeGraph(step: number): void {
    const barCount = this.content().barCount + step;
    this.saveContent({ barCount, fields: this.fields().slice(0, barCount * 2) });
  }

  setBin(key: 'binStart' | 'binWidth', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.integer(input.valueAsNumber, this.content()[key], key === 'binWidth' ? 1 : -9999, 9999);
    input.value = String(value);
    this.saveContent({ [key]: value });
  }

  binLabel(index: number): string {
    const { binStart, binWidth } = this.content();
    const start = binStart + index * binWidth;
    return start + ' to <' + (start + binWidth);
  }

  private saveContent(patch: Partial<LearningObjectContent>): void {
    if (this.editable()) this.changed.emit({ text: JSON.stringify({ ...this.content(), ...patch }) });
  }

  private integer(value: number | undefined, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  }

  queueText(value: string): void {
    if (!this.editable()) return;
    this.pendingText = value;
    window.clearTimeout(this.textTimer);
    this.textTimer = window.setTimeout(() => this.flushText(), 350);
  }

  flushText(): void {
    window.clearTimeout(this.textTimer);
    const value = this.pendingText;
    this.pendingText = undefined;
    if (value !== undefined && value !== this.note().text) this.changed.emit({ text: value });
  }

  start(event: PointerEvent, mode: 'move' | 'resize'): void {
    if (event.button !== 0 || this.gesture) return;
    const board = this.host.nativeElement.parentElement?.getBoundingClientRect();
    if (!board?.width || !board.height) return;
    event.preventDefault();
    const control = event.currentTarget as HTMLElement;
    control.focus();
    control.setPointerCapture(event.pointerId);
    this.gesture = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, board, original: this.bounds() };
  }

  move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = Math.round((event.clientX - gesture.startX) / gesture.board.width * 1000);
    const dy = Math.round((event.clientY - gesture.startY) / gesture.board.height * 1000);
    this.draft.set(this.shift(gesture.original, gesture.mode, dx, dy));
  }

  finish(event: PointerEvent): void {
    if (this.gesture?.pointerId !== event.pointerId) return;
    this.move(event);
    const bounds = this.draft();
    this.cancel();
    if (bounds) this.changed.emit({ bounds });
  }

  cancel(): void {
    this.gesture = undefined;
    this.draft.set(null);
  }

  adjust(event: KeyboardEvent, mode: 'move' | 'resize'): void {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    this.changed.emit({ bounds: this.shift(this.bounds(), mode, ...step) });
  }

  private shift(bounds: NoteBounds, mode: 'move' | 'resize', dx: number, dy: number): NoteBounds {
    const { x, y, width, height } = bounds;
    const limit = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    return mode === 'move'
      ? { x: limit(x + dx, 0, 1000 - width), y: limit(y + dy, 0, 1000 - height), width, height }
      : { x, y, width: limit(width + dx, 120, 1000 - x), height: limit(height + dy, 140, 1000 - y) };
  }
}
