import type { LinkId, NodeId, TopoLink, TopoNode, Topology } from '../types';
import { CLOUD_PATH, iconPath } from './icons';
import { exitFraction, svg, text, textWidth, type Box, type Pt } from './svg';

export const VIEW_W = 1040;
export const VIEW_H = 640;

const LINK_FS = 14;

export interface NodeView {
  node: TopoNode;
  box: Box;
  g: SVGGElement;
}

export interface FrameView {
  id: NodeId;
  box: Box;
  g: SVGGElement;
}

export interface LinkView {
  link: TopoLink;
  g: SVGGElement;
  /** Visible segment (between node edges). */
  p1: Pt;
  p2: Pt;
  labelG: SVGGElement;
  labelBg: SVGRectElement;
  labelText: SVGTextElement;
  cross: SVGGElement;
}

export interface Scene {
  svg: SVGSVGElement;
  frameLayer: SVGGElement;
  linkLayer: SVGGElement;
  nodeLayer: SVGGElement;
  fxLayer: SVGGElement;
  nodes: Map<NodeId, NodeView>;
  frames: Map<NodeId, FrameView>;
  links: Map<LinkId, LinkView>;
}

export function nodeSize(n: TopoNode): { w: number; h: number } {
  switch (n.kind) {
    case 'cloud':
      return { w: 150, h: 86 };
    case 'iot':
      return n.id === 'tent-hub' ? { w: 170, h: 66 } : { w: 98, h: 80 };
    default:
      return { w: 170, h: 66 };
  }
}

function makeFocusable(g: SVGGElement, label: string, id: NodeId): void {
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-label', label);
  g.dataset.id = id;
}

function drawNode(n: TopoNode, parent: SVGGElement): NodeView {
  const { w, h } = nodeSize(n);
  const box: Box = { x: n.x, y: n.y, w, h };
  const g = svg('g', { class: `stage-node kind-${n.kind}`, 'data-state': 'normal' }, parent);
  makeFocusable(g, n.sublabel ? `${n.label}, ${n.sublabel}` : n.label, n.id);
  const inner = svg('g', { transform: `translate(${n.x} ${n.y})` }, g);

  // Selection / focus ring (hidden unless selected or focused).
  if (n.kind === 'cloud') {
    svg('path', { class: 'stage-ring', d: CLOUD_PATH, transform: 'scale(1.12)' }, inner);
    svg('path', { class: 'stage-node-shape', d: CLOUD_PATH }, inner);
    text(n.label, { class: 'stage-label', x: 0, y: n.sublabel ? 2 : 8, 'text-anchor': 'middle' }, inner);
    if (n.sublabel) text(n.sublabel, { class: 'stage-sublabel', x: 0, y: 22, 'text-anchor': 'middle' }, inner);
  } else {
    const r = 12;
    svg('rect', { class: 'stage-ring', x: -w / 2 - 6, y: -h / 2 - 6, width: w + 12, height: h + 12, rx: r + 5 }, inner);
    svg('rect', { class: 'stage-node-shape', x: -w / 2, y: -h / 2, width: w, height: h, rx: r }, inner);
    const d = iconPath(n.id, n.kind);
    const stacked = n.kind === 'iot' && n.id !== 'tent-hub';
    if (stacked) {
      svg('path', { class: 'stage-icon', d, transform: `translate(-12 ${-h / 2 + 7})` }, inner);
      text(n.label, { class: 'stage-label', x: 0, y: 14, 'text-anchor': 'middle' }, inner);
      if (n.sublabel) text(n.sublabel, { class: 'stage-sublabel', x: 0, y: 31, 'text-anchor': 'middle' }, inner);
    } else {
      const left = -w / 2;
      svg('path', { class: 'stage-icon', d, transform: `translate(${left + 12} -12)` }, inner);
      const tx = left + 46;
      text(n.label, { class: 'stage-label', x: tx, y: n.sublabel ? -3 : 7 }, inner);
      if (n.sublabel) text(n.sublabel, { class: 'stage-sublabel', x: tx, y: 17 }, inner);
    }
  }
  return { node: n, box, g };
}

function drawLink(l: TopoLink, a: Box, b: Box, parent: SVGGElement): LinkView {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ta = exitFraction(dx, dy, a.w, a.h);
  const tb = exitFraction(-dx, -dy, b.w, b.h);
  const p1 = { x: a.x + dx * ta, y: a.y + dy * ta };
  const p2 = { x: b.x - dx * tb, y: b.y - dy * tb };
  const style = l.style ?? 'copper';
  const g = svg('g', { class: `stage-link style-${style}`, 'data-id': l.id, 'data-state': 'up' }, parent);
  if (l.color) g.style.setProperty('--link-color', l.color);
  const d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
  if (style === 'coax') svg('path', { class: 'stage-link-outer', d }, g);
  svg('path', { class: 'stage-link-line', d }, g);

  const labelG = svg('g', { class: 'stage-link-label' }, g);
  const labelBg = svg('rect', { rx: 9, height: 22, y: -11 }, labelG);
  const labelText = text('', { 'text-anchor': 'middle', y: 5 }, labelG);

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const cross = svg('g', { class: 'stage-link-cross', transform: `translate(${mx} ${my})` }, g);
  svg('circle', { r: 12 }, cross);
  text('✕', { 'text-anchor': 'middle', y: 6 }, cross);

  return { link: l, g, p1, p2, labelG, labelBg, labelText, cross };
}

/** Position/size a link label; nudge it off the line when the visible segment is too short or the link is down. */
export function setLinkLabel(lv: LinkView, label: string | undefined, down: boolean): void {
  if (!label) {
    lv.labelG.style.display = 'none';
    return;
  }
  lv.labelG.style.display = '';
  lv.labelText.textContent = label;
  const w = textWidth(label, LINK_FS, true) + 16;
  lv.labelBg.setAttribute('width', String(w));
  lv.labelBg.setAttribute('x', String(-w / 2));

  const { p1, p2 } = lv;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = lv.link.labelAt ?? 0.5;
  let x = p1.x + dx * t;
  let y = p1.y + dy * t;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const along = horizontal ? w : 22;
  if (down && len >= along + 70) {
    // Long link: slide the label toward p1 so the midpoint ✕ stays clear.
    const shift = along / 2 + 24;
    x -= (dx / len) * shift;
    y -= (dy / len) * shift;
  } else if (down || len < along + 8) {
    // Move perpendicular to the line: above horizontal links, right of vertical-ish ones.
    if (horizontal) y -= 24;
    else x += w / 2 + 16;
  }
  lv.labelG.setAttribute('transform', `translate(${x} ${y})`);
}

export function buildScene(container: HTMLElement, topo: Topology): Scene {
  const root = svg('svg', {
    class: 'stage-svg',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': 'Home lab network diagram',
  });
  const frameLayer = svg('g', { class: 'stage-frames' }, root);
  const linkLayer = svg('g', { class: 'stage-links' }, root);
  const nodeLayer = svg('g', { class: 'stage-nodes' }, root);
  const fxLayer = svg('g', { class: 'stage-fx', 'aria-hidden': 'true' }, root);

  const nodes = new Map<NodeId, NodeView>();
  for (const n of topo.nodes) nodes.set(n.id, drawNode(n, nodeLayer));

  const frames = new Map<NodeId, FrameView>();
  for (const f of topo.frames) {
    const boxes = f.around.map((id) => nodes.get(id)?.box).filter((b): b is Box => !!b);
    if (!boxes.length) {
      console.warn(`[stage] frame ${f.id} has no known nodes`);
      continue;
    }
    // The frame is a dashed outline with a solid, clickable header strip; the
    // nodes inside keep their own click targets (the outline ignores pointers).
    const pad = 18;
    const header = 30;
    const gap = 10;
    const x0 = Math.min(...boxes.map((b) => b.x - b.w / 2)) - pad;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w / 2)) + pad;
    const y0 = Math.min(...boxes.map((b) => b.y - b.h / 2)) - header - gap;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h / 2)) + 14;
    const g = svg('g', { class: 'stage-frame', 'data-state': 'normal' }, frameLayer);
    makeFocusable(g, f.label, f.id);
    svg('rect', { class: 'stage-ring', x: x0 - 6, y: y0 - 6, width: x1 - x0 + 12, height: y1 - y0 + 12, rx: 22 }, g);
    svg('rect', { class: 'stage-frame-shape', x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 14 }, g);
    svg('path', {
      class: 'stage-frame-header',
      d: `M${x0} ${y0 + header}V${y0 + 14}a14 14 0 0 1 14 -14H${x1 - 14}a14 14 0 0 1 14 14V${y0 + header}Z`,
    }, g);
    text(f.label, { class: 'stage-frame-label', x: x0 + 14, y: y0 + 20 }, g);
    frames.set(f.id, { id: f.id, box: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }, g });
  }

  const links = new Map<LinkId, LinkView>();
  for (const l of topo.links) {
    const a = nodes.get(l.a);
    const b = nodes.get(l.b);
    if (!a || !b) {
      console.warn(`[stage] link ${l.id} references unknown node`);
      continue;
    }
    const lv = drawLink(l, a.box, b.box, linkLayer);
    setLinkLabel(lv, l.label, false);
    links.set(l.id, lv);
  }

  container.appendChild(root);
  return { svg: root, frameLayer, linkLayer, nodeLayer, fxLayer, nodes, frames, links };
}
