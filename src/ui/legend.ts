import { h } from './dom';

/** Static key for packet colors and link states. Uses the same CSS vars as the stage. */
export function createLegend(): HTMLElement {
  const item = (swatch: HTMLElement, label: string) =>
    h('li', { class: 'legend-item' }, swatch, h('span', null, label));
  const dot = (cls: string) => h('span', { class: `legend-dot ${cls}`, 'aria-hidden': 'true' });
  const line = (cls: string) => h('span', { class: `legend-line ${cls}`, 'aria-hidden': 'true' });
  return h(
    'details',
    { class: 'legend', open: true },
    h('summary', null, 'Legend'),
    h(
      'ul',
      { class: 'legend-list' },
      item(dot('is-allow'), 'Packet allowed'),
      item(dot('is-nat'), 'Packet NATed (source address rewritten)'),
      item(dot('is-block'), 'Packet blocked (stops where it dies)'),
      item(line('is-up'), 'Link up'),
      item(line('is-down'), 'Link down / unplugged'),
      item(line('is-wireless'), 'Wireless link'),
    ),
    h('p', { class: 'legend-hint' }, 'Click any device on the diagram to see what it is and how it is configured.'),
  );
}
