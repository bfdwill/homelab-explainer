import type {
  DeviceInfo,
  Lesson,
  LessonState,
  NodeId,
  Param,
  ParamValue,
  ParamValues,
  SolveResult,
  Stage,
  Topology,
} from '../types';
import { progress, type LessonShape } from '../progress';
import { h, paragraphs } from './dom';
import { createLessonList } from './lessonList';
import { createControls } from './controls';
import { createStatusBar } from './statusBar';
import { createPanel } from './panel';
import { createLegend } from './legend';

export interface AppDeps {
  topology: Topology;
  createStage(container: HTMLElement, topology: Topology): Stage;
  lessons: Lesson[];
  devices: Partial<Record<NodeId, DeviceInfo>>;
}

const APP_TITLE = 'How My Home Lab Is Wired';
const TAGLINE = 'Flip switches, break things, and watch packets find their way through my network.';

function defaultParams(params: Param[]): ParamValues {
  const values: ParamValues = {};
  for (const p of params) values[p.id] = p.default;
  return values;
}

/** Restore saved values only when they still fit the lesson's current params. */
function restoreParams(params: Param[], saved: ParamValues | undefined): ParamValues {
  const values = defaultParams(params);
  if (!saved) return values;
  for (const p of params) {
    const v = saved[p.id];
    if (p.type === 'toggle' && typeof v === 'boolean') values[p.id] = v;
    if (p.type === 'choice' && typeof v === 'string' && p.options.some((o) => o.value === v)) {
      values[p.id] = v;
    }
  }
  return values;
}

function shapeOf(lesson: Lesson): LessonShape {
  return { hasParams: lesson.params.length > 0, hasActions: lesson.actions.length > 0 };
}

function lessonFromHash(lessons: Lesson[]): Lesson | undefined {
  let id = window.location.hash.replace(/^#/, '');
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  return lessons.find((l) => l.id === id);
}

export function mountApp(root: HTMLElement, deps: AppDeps): void {
  const { lessons, devices } = deps;

  // ---------- Build the static layout ----------
  const header = h(
    'header',
    { class: 'app-header' },
    h('div', { class: 'brand' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('div', null, h('h1', { class: 'app-title' }, APP_TITLE), h('p', { class: 'app-tagline' }, TAGLINE)),
    ),
  );

  const eyebrow = h('p', { class: 'lesson-eyebrow' });
  const lessonTitle = h('h2', { class: 'lesson-title', tabindex: '-1' });
  const intro = h('div', { class: 'lesson-intro' });
  const lessonHead = h('div', { class: 'lesson-head' }, eyebrow, lessonTitle, intro);

  const status = createStatusBar();
  const controls = createControls({
    onParam: (id, value) => setParam(id, value),
    onAction: (id) => pressAction(id),
    onReplay: () => stage.replay(),
  });

  const stageEl = h('div', { class: 'stage-container' });
  const stageWrap = h('div', { class: 'stage-wrap' }, stageEl);

  const prevBtn = h('button', { type: 'button', class: 'btn btn-ghost pager-prev' });
  const nextBtn = h('button', { type: 'button', class: 'btn pager-next' });
  const pager = h('nav', { class: 'pager', 'aria-label': 'Lesson navigation' }, prevBtn, nextBtn);

  const main = h(
    'main',
    { class: 'main', id: 'main' },
    lessonHead,
    controls.el,
    stageWrap,
    status.el,
    createLegend(),
    pager,
  );

  const list = createLessonList(lessons, (id) => goTo(id));
  const panel = createPanel();
  const body = h('div', { class: 'app-body' }, list.el, main, panel.el);
  const skip = h('a', { class: 'skip-link', href: '#main' }, 'Skip to lesson');

  root.replaceChildren(skip, header, body);

  const stage = deps.createStage(stageEl, deps.topology);

  // ---------- State ----------
  let lesson: Lesson | null = null;
  let state: LessonState = { params: {}, action: null };

  function solveAndRender(): void {
    if (!lesson) return;
    let result: SolveResult;
    try {
      result = lesson.solve(state);
    } catch (err) {
      console.error('lesson.solve failed', err);
      result = { links: {}, flows: [], status: 'Something went wrong working out this scenario.' };
    }
    try {
      stage.render(result);
    } catch (err) {
      console.error('stage.render failed', err);
    }
    status.update(result);
    controls.sync(state.params, state.action);
  }

  function setParam(id: string, value: ParamValue): void {
    if (!lesson || state.params[id] === value) return;
    state = { ...state, params: { ...state.params, [id]: value } };
    progress.paramChanged(lesson.id, state.params, shapeOf(lesson));
    solveAndRender();
  }

  function pressAction(id: string): void {
    if (!lesson) return;
    state = { ...state, action: id };
    progress.actionPressed(lesson.id, shapeOf(lesson));
    solveAndRender();
  }

  function notesFor(id: NodeId) {
    return lesson?.deviceNotes?.[id];
  }

  function showLesson(next: Lesson, moveFocus: boolean): void {
    const changed = lesson?.id !== next.id;
    lesson = next;
    const index = lessons.indexOf(next);
    state = { params: restoreParams(next.params, progress.savedParams(next.id)), action: null };
    eyebrow.textContent = `Lesson ${index + 1} of ${lessons.length}`;
    lessonTitle.textContent = next.title;
    intro.replaceChildren(...paragraphs(next.intro));
    document.title = `${next.title} · ${APP_TITLE}`;
    controls.setup(next.params, next.actions, state.params, state.action);
    list.setActive(next.id);
    progress.visit(next.id, shapeOf(next));

    const prev = lessons[index - 1];
    const after = lessons[index + 1];
    prevBtn.hidden = !prev;
    nextBtn.hidden = !after;
    prevBtn.textContent = prev ? `← ${prev.title}` : '';
    nextBtn.textContent = after ? `Next: ${after.title} →` : '';
    prevBtn.onclick = prev ? () => goTo(prev.id) : null;
    nextBtn.onclick = after ? () => goTo(after.id) : null;

    solveAndRender();
    const open = panel.openId();
    if (open) panel.refresh(devices[open], notesFor(open));
    if (changed && moveFocus) {
      lessonTitle.focus({ preventScroll: true });
      lessonHead.scrollIntoView?.({ block: 'start' });
    }
  }

  function goTo(id: string): void {
    const target = lessons.find((l) => l.id === id);
    if (!target) return;
    if (window.location.hash === `#${id}`) showLesson(target, true);
    else window.location.hash = id; // hashchange handler shows it
  }

  // ---------- Stage selection -> device panel ----------
  stage.onSelect((id) => {
    const opener = document.activeElement;
    stage.setSelected(id);
    panel.open(id, devices[id], notesFor(id), opener && opener !== document.body ? opener : null);
  });
  panel.onClose(() => stage.setSelected(null));

  // ---------- Routing ----------
  window.addEventListener('hashchange', () => {
    const target = lessonFromHash(lessons);
    if (target) showLesson(target, true);
  });

  if (lessons.length === 0) {
    eyebrow.textContent = 'No lessons yet';
    lessonTitle.textContent = 'Lessons are on their way';
    intro.replaceChildren(
      h('p', null, 'The diagram below shows the network. Click a device to read about it.'),
    );
    controls.setup([], [], {}, null);
    controls.el.hidden = true;
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    const empty: SolveResult = { links: {}, flows: [], status: 'Nothing is moving yet.' };
    try {
      stage.render(empty);
    } catch (err) {
      console.error('stage.render failed', err);
    }
    status.update(empty);
    return;
  }

  const lastId = progress.lastLesson();
  const initial =
    lessonFromHash(lessons) ?? lessons.find((l) => l.id === lastId) ?? lessons[0];
  if (window.location.hash !== `#${initial.id}`) {
    try {
      history.replaceState(null, '', `#${initial.id}`);
    } catch {
      /* ignore (e.g. sandboxed iframe) */
    }
  }
  showLesson(initial, false);
}
