import type { NodeId, NodeKind } from '../types';

/** 24x24 stroke icons (drawn with stroke=currentColor, no fill). */
const KIND_ICONS: Record<NodeKind, string> = {
  cloud: '',
  modem: 'M3 10h18v8H3z M7 14h.5 M11 14h.5 M15 14h.5 M7 10L5 4 M17 10l2-6',
  host: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.5 M8 17h.5',
  firewall:
    'M3 5h18v14H3z M3 9.7h18 M3 14.3h18 M9 5v4.7 M15 5v4.7 M6 9.7v4.6 M12 9.7v4.6 M18 9.7v4.6 M9 14.3V19 M15 14.3V19',
  switch: 'M2 8h20v8H2z M5 12h2 M9 12h2 M13 12h2 M17 12h2',
  ap: 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M12 19.5h.5',
  client: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  iot: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
};

const ID_ICONS: Partial<Record<NodeId, string>> = {
  laptop: 'M5 5h14v10H5z M2 19h20l-2-4H4z',
  'tent-sensor': 'M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z M12 17v-7',
  'tent-fan':
    'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 12c-1-4 0-6 2-6s2 3-2 6 M12 12c4-1 6 0 6 2s-3 2-6-2 M12 12c1 4 0 6-2 6s-2-3 2-6 M12 12c-4 1-6 0-6-2s3-2 6 2',
  'tent-light':
    'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
};

export function iconPath(id: NodeId, kind: NodeKind): string {
  return ID_ICONS[id] ?? KIND_ICONS[kind];
}

/** Cloud outline centered on (0,0), roughly 150 x 86. */
export const CLOUD_PATH =
  'M-46 32a24 24 0 0 1-8-47a30 30 0 0 1 54-14a26 26 0 0 1 46 16a24 24 0 0 1-4 45z';
