import type { LinkId, NodeId, NodeState, SolveResult, Stage, Topology } from '../types';
import { FlowPlayer } from './flows';
import { buildScene, setLinkLabel, VIEW_H, VIEW_W, type Scene } from './scene';
import './stage.css';

const STATE_SUFFIX: Partial<Record<NodeState, string>> = {
  hidden: ' (not present)',
  dim: ' (inactive)',
  highlight: ' (highlighted)',
  warn: ' (warning)',
};

/** Margin (SVG units) kept around the visible devices; leaves room for packet labels and callouts. */
const FIT_MARGIN = 26;

/** Crop the viewBox to the devices this lesson shows, so the diagram fills the stage. */
function fitViewBox(scene: Scene, isHidden: (id: NodeId) => boolean): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (b: { x: number; y: number; w: number; h: number }) => {
    x0 = Math.min(x0, b.x - b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  };
  for (const [id, nv] of scene.nodes) if (!isHidden(id)) add(nv.box);
  for (const [id, fv] of scene.frames) if (!isHidden(id)) add(fv.box);
  if (!Number.isFinite(x0)) {
    scene.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    return;
  }
  x0 = Math.max(0, x0 - FIT_MARGIN);
  y0 = Math.max(0, y0 - FIT_MARGIN);
  x1 = Math.min(VIEW_W, x1 + FIT_MARGIN);
  y1 = Math.min(VIEW_H, y1 + FIT_MARGIN);
  scene.svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
}

export function createStage(container: HTMLElement, topology: Topology): Stage {
  const root = document.createElement('div');
  root.className = 'stage';
  container.appendChild(root);
  const scene = buildScene(root, topology);

  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const player = new FlowPlayer(scene.fxLayer, scene.nodes, topology, () => !!mq?.matches);

  const listeners: ((id: NodeId) => void)[] = [];
  let current: SolveResult | null = null;

  const emit = (id: NodeId) => listeners.forEach((cb) => cb(id));
  const targetOf = (ev: Event): NodeId | null => {
    const el = (ev.target as Element | null)?.closest?.('[data-id][role="button"]');
    return el ? ((el as SVGElement).dataset.id as NodeId) : null;
  };
  scene.svg.addEventListener('click', (ev) => {
    const id = targetOf(ev);
    if (id) emit(id);
  });
  scene.svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    const id = targetOf(ev);
    if (!id) return;
    ev.preventDefault();
    emit(id);
  });

  mq?.addEventListener?.('change', () => {
    if (current) player.play(current.flows);
  });

  function render(result: SolveResult): void {
    current = result;
    const nodeStates = result.nodes ?? {};
    const stateOf = (id: NodeId): NodeState => nodeStates[id] ?? 'normal';

    for (const [id, nv] of scene.nodes) {
      const st = stateOf(id);
      nv.g.dataset.state = st;
      const base = nv.node.sublabel ? `${nv.node.label}, ${nv.node.sublabel}` : nv.node.label;
      nv.g.setAttribute('aria-label', base + (STATE_SUFFIX[st] ?? ''));
    }
    for (const [id, fv] of scene.frames) fv.g.dataset.state = stateOf(id);
    fitViewBox(scene, (id) => stateOf(id) === 'hidden');

    for (const [id, lv] of scene.links) {
      const { a, b } = lv.link;
      const hidden = stateOf(a) === 'hidden' || stateOf(b) === 'hidden';
      const down = result.links[id as LinkId] === 'down';
      lv.g.dataset.state = hidden ? 'hidden' : down ? 'down' : 'up';
      const override = result.linkLabels?.[id];
      setLinkLabel(lv, override ?? lv.link.label, down);
    }

    player.play(result.flows);
  }

  return {
    render,
    replay() {
      if (current) player.play(current.flows);
    },
    onSelect(cb) {
      listeners.push(cb);
    },
    setSelected(id) {
      for (const el of scene.svg.querySelectorAll('.is-selected')) {
        el.classList.remove('is-selected');
        el.removeAttribute('aria-current');
      }
      if (!id) return;
      const g = scene.nodes.get(id)?.g ?? scene.frames.get(id)?.g;
      if (g) {
        g.classList.add('is-selected');
        g.setAttribute('aria-current', 'true');
      }
    },
  };
}
