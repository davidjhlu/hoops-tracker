export const MODES = [
  { id: 'hc2', label: 'Halfcourt 2v2' },
  { id: 'hc3', label: 'Halfcourt 3v3' },
  { id: 'hc4', label: 'Halfcourt 4v4' },
  { id: 'hc5', label: 'Halfcourt 5v5' },
  { id: 'fc5', label: 'Fullcourt 5v5' },
];

export const MODE_IDS = new Set(MODES.map((m) => m.id));
