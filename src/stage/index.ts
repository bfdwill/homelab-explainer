import type { LinkId, NodeId, NodeState, SolveResult, Stage, Topology } from '../types';
import { FlowPlayer } from './flows';
import { buildScene, setLinkLabel } from './scene';
import './stage.css';

const STATE_SUFFIX: Partial<Record<NodeState, string>> = {
  hidden: ' (not present)',
  dim: ' (inactive)',
  highlight: ' (highlighted)',
  warn: ' (warning)',
};

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
