import type { SolveResult } from '../types';
import { h } from './dom';

export interface StatusBar {
  el: HTMLElement;
  update(result: SolveResult | null): void;
}

/** Plain-language status sentence (announced politely) plus optional detail bullets. */
export function createStatusBar(): StatusBar {
  const text = h('p', { class: 'status-text', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const details = h('ul', { class: 'status-details' });
  const el = h(
    'section',
    { class: 'status', 'aria-label': 'What is happening' },
    h('span', { class: 'status-label', 'aria-hidden': 'true' }, 'Status'),
    text,
    details,
  );
  let verdictClass = '';

  return {
    el,
    update(result) {
      const status = result?.status ?? '';
      if (text.textContent !== status) text.textContent = status;
      const items = result?.details ?? [];
      details.replaceChildren(...items.map((d) => h('li', null, d)));
      details.hidden = items.length === 0;
      // Tint the bar by the worst verdict among the flows.
      const flows = result?.flows ?? [];
      const next = flows.some((f) => f.verdict === 'block')
        ? 'is-block'
        : flows.some((f) => f.verdict === 'nat')
          ? 'is-nat'
          : flows.length
            ? 'is-allow'
            : '';
      if (verdictClass) el.classList.remove(verdictClass);
      if (next) el.classList.add(next);
      verdictClass = next;
    },
  };
}
