import type { Lesson } from '../types';
import { progress } from '../progress';
import { clear, h } from './dom';

export interface LessonList {
  el: HTMLElement;
  setActive(id: string | null): void;
  refresh(): void;
}

/** Sidebar navigation: numbered lessons with visited/complete marks and a reset link. */
export function createLessonList(lessons: Lesson[], onPick: (id: string) => void): LessonList {
  let activeId: string | null = null;
  const list = h('ol', { class: 'lesson-list' });
  const reset = h(
    'button',
    {
      type: 'button',
      class: 'link-button reset-progress',
      onclick: () => {
        if (window.confirm('Reset your lesson progress?')) progress.reset();
      },
    },
    'Reset progress',
  );
  const count = h('p', { class: 'progress-count' });

  const el = h(
    'nav',
    { class: 'sidebar', 'aria-label': 'Lessons' },
    h('h2', { class: 'sidebar-title' }, 'Lessons'),
    list,
    h('div', { class: 'sidebar-footer' }, count, reset),
  );

  function refresh(): void {
    clear(list);
    if (lessons.length === 0) {
      list.appendChild(h('li', { class: 'lesson-empty' }, 'No lessons yet.'));
    }
    let done = 0;
    lessons.forEach((lesson, i) => {
      const complete = progress.isComplete(lesson.id);
      const visited = progress.isVisited(lesson.id);
      if (complete) done += 1;
      const mark = complete ? '✓' : visited ? '•' : '';
      const stateText = complete ? ' (completed)' : visited ? ' (visited)' : '';
      const a = h(
        'a',
        {
          href: `#${lesson.id}`,
          class: `lesson-link${complete ? ' is-complete' : ''}${visited ? ' is-visited' : ''}`,
          'aria-current': lesson.id === activeId ? 'page' : null,
          onclick: (e: Event) => {
            e.preventDefault();
            onPick(lesson.id);
          },
        },
        h('span', { class: 'lesson-num', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'lesson-name' }, lesson.title),
        h('span', { class: 'lesson-mark', 'aria-hidden': 'true' }, mark),
        h('span', { class: 'visually-hidden' }, stateText),
      );
      list.appendChild(h('li', null, a));
    });
    count.textContent = lessons.length ? `${done} of ${lessons.length} complete` : '';
    reset.hidden = lessons.length === 0;
  }

  progress.onChange(refresh);
  refresh();

  return {
    el,
    refresh,
    setActive(id) {
      activeId = id;
      refresh();
      const current = list.querySelector<HTMLElement>('[aria-current="page"]');
      // Keep the active pill visible in the mobile horizontal strip.
      current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    },
  };
}
