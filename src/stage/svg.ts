export const SVG_NS = 'http://www.w3.org/2000/svg';

export type Attrs = Record<string, string | number | undefined>;

/** Create an SVG element with attributes, optionally appending it to a parent. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}

/** Create a <text> element with content. */
export function text(content: string, attrs: Attrs, parent?: Element): SVGTextElement {
  const t = svg('text', attrs, parent);
  t.textContent = content;
  return t;
}

/** Rough width estimate for text (avoids getBBox, which fails when detached/hidden). */
export function textWidth(s: string, fontSize: number, bold = false): number {
  return s.length * fontSize * (bold ? 0.6 : 0.56);
}

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number; // center
  y: number; // center
  w: number;
  h: number;
}

/** Fraction t (0..0.5) along a->b where the segment exits box a (centered at a). */
export function exitFraction(dx: number, dy: number, w: number, h: number): number {
  const tx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  return Math.min(tx, ty, 0.5);
}
