import type { Flow, NodeId, Topology } from '../types';
import { VIEW_W, type NodeView } from './scene';
import { svg, text, textWidth, type Pt } from './svg';

/** Packet speed in SVG units per millisecond. */
const SPEED = 0.26;
/** Delay between the start of consecutive flows. */
const STAGGER_MS = 600;
/** Pause after the last flow finishes before the loop restarts. */
const LOOP_PAUSE_MS = 1400;
/** How long the end-of-path effect lasts before the flow is considered finished. */
const END_MS: Record<Flow['verdict'], number> = { allow: 900, nat: 900, block: 2600 };

interface Prepared {
  flow: Flow;
  pts: Pt[];
  /** Cumulative distance at each path node. */
  cum: number[];
  total: number;
  offset: number;
  dur: number;
  /** Indexes into path where NAT happens. */
  natIdx: number[];
}

interface Live {
  p: Prepared;
  g: SVGGElement;
  shown: boolean;
  fired: Set<number>;
  ended: boolean;
}

const warned = new Set<string>();
/** console.warn once per distinct message (replays would otherwise repeat it). */
function warnOnce(msg: string, flow: Flow): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg, flow);
}

export class FlowPlayer {
  private raf = 0;
  private prepared: Prepared[] = [];
  private live: Live[] = [];
  private loopStart = 0;
  private loopTotal = 0;
  private calloutCount = new Map<NodeId, number>();
  private linkPairs = new Set<string>();

  constructor(
    private layer: SVGGElement,
    private nodes: Map<NodeId, NodeView>,
    topo: Topology,
    private reducedMotion: () => boolean,
  ) {
    for (const l of topo.links) {
      this.linkPairs.add(`${l.a}|${l.b}`);
      this.linkPairs.add(`${l.b}|${l.a}`);
    }
  }

  /** Stop everything and clear all packet/fx elements. */
  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.live = [];
    this.layer.replaceChildren();
    this.calloutCount.clear();
  }

  play(flows: Flow[]): void {
    this.stop();
    this.prepared = [];
    let i = 0;
    for (const flow of flows) {
      const p = this.prepare(flow, i);
      if (p) {
        this.prepared.push(p);
        i++;
      }
    }
    if (!this.prepared.length) return;
    if (this.reducedMotion()) {
      this.drawStatic();
      return;
    }
    this.loopTotal =
      Math.max(...this.prepared.map((p) => p.offset + p.dur + END_MS[p.flow.verdict])) + LOOP_PAUSE_MS;
    this.startLoop(performance.now());
    this.raf = requestAnimationFrame(this.tick);
  }

  private prepare(flow: Flow, index: number): Prepared | null {
    const path = flow.path;
    if (!path.length) {
      warnOnce('[stage] flow with empty path skipped', flow);
      return null;
    }
    const pts: Pt[] = [];
    for (let k = 0; k < path.length; k++) {
      const nv = this.nodes.get(path[k]);
      if (!nv) {
        warnOnce(`[stage] flow skipped: unknown node "${path[k]}"`, flow);
        return null;
      }
      if (k > 0 && !this.linkPairs.has(`${path[k - 1]}|${path[k]}`)) {
        warnOnce(`[stage] flow skipped: no link between "${path[k - 1]}" and "${path[k]}"`, flow);
        return null;
      }
      pts.push({ x: nv.box.x, y: nv.box.y });
    }
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    }
    const total = cum[cum.length - 1];
    const natIdx = (flow.natAt ?? [])
      .map((id) => path.indexOf(id))
      .filter((k) => k >= 0)
      .sort((a, b) => a - b);
    return { flow, pts, cum, total, offset: index * STAGGER_MS, dur: total / SPEED, natIdx };
  }

  private pointAt(p: Prepared, dist: number): Pt {
    const { pts, cum } = p;
    if (dist <= 0 || pts.length === 1) return pts[0];
    for (let k = 1; k < pts.length; k++) {
      if (dist <= cum[k]) {
        const seg = cum[k] - cum[k - 1] || 1;
        const t = (dist - cum[k - 1]) / seg;
        return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t };
      }
    }
    return pts[pts.length - 1];
  }

  private makePacket(flow: Flow): SVGGElement {
    const g = svg('g', { class: `stage-packet verdict-${flow.verdict}` }, this.layer);
    const body = svg('g', { class: 'stage-packet-body' }, g);
    svg('circle', { class: 'stage-packet-halo', r: 15 }, body);
    svg('circle', { class: 'stage-packet-dot', r: 9 }, body);
    if (flow.label) {
      const w = textWidth(flow.label, 12, true) + 12;
      const lg = svg('g', { class: 'stage-packet-label', transform: 'translate(0 -25)' }, body);
      svg('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }, lg);
      text(flow.label, { 'text-anchor': 'middle', y: 4 }, lg);
    }
    return g;
  }

  private place(g: SVGGElement, pt: Pt): void {
    g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
  }

  private startLoop(now: number): void {
    this.layer.replaceChildren();
    this.calloutCount.clear();
    this.loopStart = now;
    this.live = this.prepared.map((p) => {
      const g = this.makePacket(p.flow);
      g.style.display = 'none';
      return { p, g, shown: false, fired: new Set<number>(), ended: false };
    });
  }

  private tick = (now: number): void => {
    let t = now - this.loopStart;
    if (t > this.loopTotal) {
      this.startLoop(now);
      t = 0;
    }
    for (const lv of this.live) {
      const { p } = lv;
      const local = t - p.offset;
      if (local < 0 || lv.ended) continue;
      if (!lv.shown) {
        lv.g.style.display = '';
        lv.shown = true;
      }
      const dist = Math.min(local * SPEED, p.total);
      this.place(lv.g, this.pointAt(p, dist));
      for (const k of p.natIdx) {
        if (!lv.fired.has(k) && dist >= p.cum[k]) {
          lv.fired.add(k);
          this.natBadge(p.flow.path[k], false);
          lv.g.classList.add('natted');
        }
      }
      if (local >= p.dur) {
        lv.ended = true;
        this.endEffect(lv.g, p, false);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private endEffect(g: SVGGElement, p: Prepared, isStatic: boolean): void {
    const last = p.flow.path[p.flow.path.length - 1];
    if (p.flow.verdict === 'block') {
      g.classList.add('blocked');
      if (p.flow.reason) this.callout(last, p.flow.reason, isStatic);
    } else {
      g.classList.add('arrived');
      this.check(last, isStatic);
    }
  }

  private natBadge(id: NodeId, isStatic: boolean): void {
    const nv = this.nodes.get(id);
    if (!nv) return;
    const { x, y, w, h } = nv.box;
    const g = svg('g', { class: 'stage-badge-pos', transform: `translate(${x + w / 2 - 14} ${y - h / 2 - 2})` }, this.layer);
    const b = svg('g', { class: `stage-nat-badge${isStatic ? ' static' : ''}` }, g);
    svg('rect', { x: -22, y: -12, width: 44, height: 24, rx: 12 }, b);
    text('NAT', { 'text-anchor': 'middle', y: 5 }, b);
  }

  private check(id: NodeId, isStatic: boolean): void {
    const nv = this.nodes.get(id);
    if (!nv) return;
    const { x, y, w, h } = nv.box;
    // Animated: pulse over the node center. Static: a small badge on the top-left corner.
    const pos = isStatic ? `translate(${x - w / 2 + 6} ${y - h / 2 + 2}) scale(0.7)` : `translate(${x} ${y})`;
    const g = svg('g', { class: 'stage-badge-pos', transform: pos }, this.layer);
    const c = svg('g', { class: `stage-check${isStatic ? ' static' : ''}` }, g);
    svg('circle', { class: 'stage-check-ring', r: 22 }, c);
    svg('path', { class: 'stage-check-mark', d: 'M-9 0l6 6l12-12' }, c);
  }

  private callout(id: NodeId, reason: string, isStatic: boolean): void {
    const nv = this.nodes.get(id);
    if (!nv) return;
    const n = this.calloutCount.get(id) ?? 0;
    this.calloutCount.set(id, n + 1);
    const { x, y, h } = nv.box;
    const w = textWidth(reason, 13, true) + 22;
    const below = y < 200;
    // Sit clear of the node edge, where the blocked packet marker and its label rest.
    const cy = below ? y + h / 2 + 42 + n * 30 : y - h / 2 - 46 - n * 30;
    const cx = Math.min(Math.max(x, w / 2 + 6), VIEW_W - w / 2 - 6);
    const g = svg('g', { class: 'stage-badge-pos', transform: `translate(${cx} ${cy})` }, this.layer);
    const c = svg('g', { class: `stage-callout${isStatic ? ' static' : ''}` }, g);
    svg('rect', { x: -w / 2, y: -13, width: w, height: 26, rx: 8 }, c);
    text(reason, { 'text-anchor': 'middle', y: 5 }, c);
  }

  /** Reduced motion: show each packet at its end point with its final state. */
  private drawStatic(): void {
    const natDone = new Set<NodeId>();
    const atNode = new Map<NodeId, number>();
    for (const p of this.prepared) {
      for (const k of p.natIdx) {
        const id = p.flow.path[k];
        if (!natDone.has(id)) {
          natDone.add(id);
          this.natBadge(id, true);
        }
      }
      const g = this.makePacket(p.flow);
      g.classList.add('static');
      if (p.natIdx.length) g.classList.add('natted');
      const last = p.flow.path[p.flow.path.length - 1];
      const box = this.nodes.get(last)!.box;
      const n = atNode.get(last) ?? 0;
      atNode.set(last, n + 1);
      // Sit on the node's top edge; spread multiple packets that end on the same node.
      this.place(g, { x: box.x - 40 + ((n * 44) % 132), y: box.y - box.h / 2 });
      this.endEffect(g, p, true);
    }
  }
}
