export const MODES = [
  { id: 'hc3', label: 'halfcourt 3s' },
  { id: 'hc4', label: 'halfcourt 4s' },
  { id: 'hc5', label: 'halfcourt 5s' },
  { id: 'fc5', label: 'fullcourt 5s' },
];

export const MODE_IDS = new Set(MODES.map((m) => m.id));
