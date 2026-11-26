/**
 * localStorage-backed progress. Every storage access is wrapped in try/catch so the
 * app still works (without persistence) when storage is blocked or full.
 *
 * Completion rule: a lesson counts as complete once the user has, in that lesson,
 * pressed at least one action AND changed at least one param (on any visit; the two
 * need not happen in the same visit). Lessons with no params complete on the first
 * action; lessons with no actions complete on the first param change; lessons with
 * neither complete on visit.
 * The sidebar shows a check for complete lessons and a dot for visited ones.
 */
import type { ParamValues } from './types';

const KEY = 'homelab-explainer:progress:v1';

interface LessonProgress {
  visited?: boolean;
  acted?: boolean;
  changed?: boolean;
  complete?: boolean;
  params?: ParamValues;
}

interface ProgressData {
  lastLesson?: string;
  lessons: Record<string, LessonProgress>;
}

function empty(): ProgressData {
  return { lessons: {} };
}

let cache: ProgressData | null = null;

function load(): ProgressData {
  if (cache) return cache;
  let data = empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'lessons' in parsed) {
        const p = parsed as ProgressData;
        if (p.lessons && typeof p.lessons === 'object') data = p;
      }
    }
  } catch {
    /* storage blocked or corrupt: start fresh in memory */
  }
  cache = data;
  return data;
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* storage blocked or full: keep in-memory state only */
  }
}

function entry(id: string): LessonProgress {
  const data = load();
  if (!data.lessons[id]) data.lessons[id] = {};
  return data.lessons[id];
}

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((cb) => cb());
}

export interface LessonShape {
  hasParams: boolean;
  hasActions: boolean;
}

function updateComplete(id: string, shape: LessonShape): void {
  const e = entry(id);
  const actedOk = !shape.hasActions || !!e.acted;
  const changedOk = !shape.hasParams || !!e.changed;
  if (!e.complete && e.visited && actedOk && changedOk) e.complete = true;
}

export const progress = {
  onChange(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  lastLesson(): string | undefined {
    return load().lastLesson;
  },
  isVisited(id: string): boolean {
    return !!load().lessons[id]?.visited;
  },
  isComplete(id: string): boolean {
    return !!load().lessons[id]?.complete;
  },
  savedParams(id: string): ParamValues | undefined {
    return load().lessons[id]?.params;
  },
  visit(id: string, shape: LessonShape): void {
    const data = load();
    data.lastLesson = id;
    entry(id).visited = true;
    updateComplete(id, shape);
    save();
    emit();
  },
  paramChanged(id: string, params: ParamValues, shape: LessonShape): void {
    const e = entry(id);
    e.changed = true;
    e.params = { ...params };
    updateComplete(id, shape);
    save();
    emit();
  },
  actionPressed(id: string, shape: LessonShape): void {
    entry(id).acted = true;
    updateComplete(id, shape);
    save();
    emit();
  },
  reset(): void {
    cache = empty();
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
};
