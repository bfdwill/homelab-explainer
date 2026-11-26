import type { Action, Param, ParamValue, ParamValues } from '../types';
import { h, uniqueId } from './dom';

export interface ControlsCallbacks {
  onParam(id: string, value: ParamValue): void;
  onAction(id: string): void;
  onReplay(): void;
}

export interface Controls {
  el: HTMLElement;
  /** Rebuild for a new lesson. */
  setup(params: Param[], actions: Action[], values: ParamValues, action: string | null): void;
  /** Reflect current values without rebuilding (keeps focus). */
  sync(values: ParamValues, action: string | null): void;
}

export function createControls(cb: ControlsCallbacks): Controls {
  const paramsEl = h('div', { class: 'params' });
  const actionsEl = h('div', { class: 'actions', role: 'group', 'aria-label': 'Send traffic' });
  const replay = h(
    'button',
    { type: 'button', class: 'btn btn-ghost replay', onclick: () => cb.onReplay() },
    h('span', { 'aria-hidden': 'true' }, '↻ '),
    'Replay',
  );
  const actionsRow = h('div', { class: 'actions-row' }, actionsEl, replay);
  const el = h('section', { class: 'controls', 'aria-label': 'Controls' }, paramsEl, actionsRow);

  let syncers: ((values: ParamValues, action: string | null) => void)[] = [];

  function toggle(p: Extract<Param, { type: 'toggle' }>): HTMLElement {
    const labelId = uniqueId('param-label');
    const hasHelp = !!(p.help || p.helpOn || p.helpOff);
    const helpId = hasHelp ? uniqueId('param-help') : null;
    const helpEl = helpId ? h('p', { class: 'param-help', id: helpId }) : null;
    const stateText = h('span', { class: 'switch-state' });
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'switch',
        class: 'switch',
        'aria-labelledby': labelId,
        'aria-describedby': helpId,
        onclick: () => cb.onParam(p.id, btn.getAttribute('aria-checked') !== 'true'),
      },
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })),
      stateText,
    );
    syncers.push((values) => {
      const on = values[p.id] === true;
      btn.setAttribute('aria-checked', String(on));
      stateText.textContent = on ? (p.onLabel ?? 'On') : (p.offLabel ?? 'Off');
      if (helpEl) helpEl.textContent = (on ? p.helpOn : p.helpOff) ?? p.help ?? '';
    });
    return h(
      'div',
      { class: 'param param-toggle' },
      h('span', { class: 'param-label', id: labelId }, p.label),
      btn,
      helpEl,
    );
  }

  function choice(p: Extract<Param, { type: 'choice' }>): HTMLElement {
    const labelId = uniqueId('param-label');
    const helpId = p.help ? uniqueId('param-help') : null;
    const name = uniqueId(`param-${p.id}`);
    const inputs: HTMLInputElement[] = [];
    const seg = h('div', {
      class: 'segmented',
      role: 'radiogroup',
      'aria-labelledby': labelId,
      'aria-describedby': helpId,
    });
    for (const opt of p.options) {
      const input = h('input', {
        type: 'radio',
        name,
        value: opt.value,
        class: 'visually-hidden',
        onchange: () => {
          if (input.checked) cb.onParam(p.id, opt.value);
        },
      });
      inputs.push(input);
      seg.appendChild(h('label', { class: 'segment' }, input, h('span', null, opt.label)));
    }
    syncers.push((values) => {
      for (const input of inputs) input.checked = input.value === values[p.id];
    });
    return h(
      'div',
      { class: 'param param-choice' },
      h('span', { class: 'param-label', id: labelId }, p.label),
      seg,
      helpId ? h('p', { class: 'param-help', id: helpId }, p.help) : null,
    );
  }

  function actionButton(a: Action): HTMLElement {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-action',
        'aria-pressed': 'false',
        title: a.description ?? null,
        onclick: () => cb.onAction(a.id),
      },
      h('span', { class: 'btn-dot', 'aria-hidden': 'true' }),
      a.label,
    );
    syncers.push((_v, action) => btn.setAttribute('aria-pressed', String(action === a.id)));
    return btn;
  }

  return {
    el,
    setup(params, actions, values, action) {
      syncers = [];
      paramsEl.replaceChildren(
        ...params.map((p) => (p.type === 'toggle' ? toggle(p) : choice(p))),
      );
      paramsEl.hidden = params.length === 0;
      actionsEl.replaceChildren(...actions.map(actionButton));
      actionsEl.hidden = actions.length === 0;
      this.sync(values, action);
    },
    sync(values, action) {
      syncers.forEach((s) => s(values, action));
    },
  };
}
