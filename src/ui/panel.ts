import type { DeviceInfo, NodeId, Snippet, SnippetLang } from '../types';
import { h, paragraphs } from './dom';

export interface PanelNotes {
  body?: string;
  snippets?: Snippet[];
}

export interface DevicePanel {
  el: HTMLElement;
  isOpen(): boolean;
  openId(): NodeId | null;
  open(id: NodeId, device: DeviceInfo | undefined, notes: PanelNotes | undefined, returnFocus: Element | null): void;
  /** Re-render content for the open device (e.g. lesson changed) without moving focus. */
  refresh(device: DeviceInfo | undefined, notes: PanelNotes | undefined): void;
  close(): void;
  onClose(cb: (id: NodeId) => void): void;
}

const LANG_LABEL: Record<SnippetLang, string> = {
  opnsense: 'OPNsense',
  ios: 'Cisco IOS XE',
  shell: 'shell',
  text: 'text',
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = h('textarea', { readonly: true, class: 'visually-hidden', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function selectContents(el: Element): void {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {
    /* ignore */
  }
}

export function renderSnippet(s: Snippet): HTMLElement {
  const code = h('code', { class: `lang-${s.lang}` }, s.code);
  const feedback = h('span', { class: 'copy-feedback', role: 'status' });
  let timer = 0;
  const copy = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-small copy',
      'aria-label': `Copy ${s.title}`,
      onclick: async () => {
        const ok = await copyText(s.code);
        if (!ok) selectContents(code);
        feedback.textContent = ok ? 'Copied' : 'Selected: press Ctrl+C';
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (feedback.textContent = ''), 2000);
      },
    },
    'Copy',
  );
  return h(
    'figure',
    { class: 'snippet' },
    h(
      'figcaption',
      { class: 'snippet-head' },
      h('span', { class: 'snippet-title' }, s.title),
      h('span', { class: 'snippet-lang' }, LANG_LABEL[s.lang] ?? s.lang),
      feedback,
      copy,
    ),
    h('pre', { tabindex: '0' }, code),
    s.note ? h('p', { class: 'snippet-note' }, s.note) : null,
  );
}

function prettyId(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createPanel(): DevicePanel {
  const title = h('h2', { class: 'panel-title', id: 'panel-title', tabindex: '-1' });
  const model = h('p', { class: 'panel-model' });
  const body = h('div', { class: 'panel-body' });
  const closeBtn = h(
    'button',
    { type: 'button', class: 'btn btn-icon panel-close', 'aria-label': 'Close device panel' },
    '×',
  );
  const el = h(
    'aside',
    { class: 'panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'panel-title', hidden: true },
    h('header', { class: 'panel-header' }, h('div', null, title, model), closeBtn),
    body,
  );

  let current: NodeId | null = null;
  let returnTo: Element | null = null;
  const closeListeners: ((id: NodeId) => void)[] = [];

  function section(heading: string, ...content: (Node | null)[]): HTMLElement {
    return h('section', { class: 'panel-section' }, h('h3', null, heading), ...content);
  }

  function fill(id: NodeId, device: DeviceInfo | undefined, notes: PanelNotes | undefined): void {
    title.textContent = device?.name ?? prettyId(id);
    model.textContent = device?.model ?? '';
    model.hidden = !device?.model;
    const parts: HTMLElement[] = [];
    if (!device) {
      parts.push(h('p', { class: 'panel-fallback' }, 'Details for this device have not been written yet.'));
    } else {
      parts.push(section('What it is', ...paragraphs(device.what)));
      parts.push(section('Why it is here', ...paragraphs(device.why)));
      if (device.facts?.length) {
        parts.push(
          section(
            'Facts',
            h(
              'dl',
              { class: 'facts' },
              device.facts.flatMap((f) => [h('dt', null, f.label), h('dd', null, f.value)]),
            ),
          ),
        );
      }
      if (device.snippets?.length) parts.push(section('Config', ...device.snippets.map(renderSnippet)));
    }
    if (notes && (notes.body || notes.snippets?.length)) {
      parts.push(
        h(
          'section',
          { class: 'panel-section panel-lesson' },
          h('h3', null, 'In this lesson'),
          ...paragraphs(notes.body),
          ...(notes.snippets ?? []).map(renderSnippet),
        ),
      );
    }
    body.replaceChildren(...parts);
    body.scrollTop = 0;
  }

  function close(): void {
    if (!current) return;
    const id = current;
    current = null;
    el.hidden = true;
    document.body.classList.remove('panel-open');
    const target = returnTo;
    returnTo = null;
    closeListeners.forEach((cb) => cb(id));
    // Return focus to the node that opened the panel (or a node with the same id).
    if (target instanceof HTMLElement || target instanceof SVGElement) {
      if (target.isConnected) {
        target.focus();
        return;
      }
    }
    const fallback = document.querySelector<HTMLElement | SVGElement>(
      `[data-node-id="${id}"], [data-node="${id}"], [data-id="${id}"]`,
    );
    fallback?.focus();
  }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) {
      e.preventDefault();
      close();
    }
  });

  return {
    el,
    isOpen: () => current !== null,
    openId: () => current,
    open(id, device, notes, focusBack) {
      const wasOpen = current !== null;
      if (!wasOpen || !returnTo) returnTo = focusBack;
      else if (focusBack && !el.contains(focusBack)) returnTo = focusBack;
      current = id;
      fill(id, device, notes);
      el.hidden = false;
      document.body.classList.add('panel-open');
      title.focus({ preventScroll: true });
    },
    refresh(device, notes) {
      if (current) fill(current, device, notes);
    },
    close,
    onClose(cb) {
      closeListeners.push(cb);
    },
  };
}
