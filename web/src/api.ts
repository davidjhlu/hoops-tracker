export type Mode = { id: string; label: string }
export type PlayerRef = { id: number; name: string }

export type Game = {
  id: number
  mode: string
  playedAt: string
  scoreA: number
  scoreB: number
  teamA: PlayerRef[]
  teamB: PlayerRef[]
}

export type PlayerStats = {
  id: number
  name: string
  games: number
  wins: number
  losses: number
  winPct: number
  streak: number
  longestWinStreak: number
  elo: number
  eloProvisional: boolean
  qualified: boolean
}

export type Leader = { value: number; players: string[] } | null

export type Stats = {
  leaderboard: PlayerStats[]
  records: {
    totalGames: number
    longestWinStreak: Leader
  }
}

export type NewGame = {
  mode: string
  playedAt: string
  scoreA: number
  scoreB: number
  teamA: string[]
  teamB: string[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body as T
}

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  config: () => request<{ modes: Mode[] }>('/api/config'),
  players: () => request<PlayerRef[]>('/api/players'),
  addPlayer: (name: string) =>
    request<PlayerRef>('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  games: (mode?: string, player?: number) => request<Game[]>(`/api/games${query({ mode, player })}`),
  stats: (mode?: string, minGames?: number) => request<Stats>(`/api/stats${query({ mode, minGames })}`),
  addGame: (game: NewGame) =>
    request<{ id: number }>('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game),
    }),
  updateGame: (id: number, game: NewGame) =>
    request<{ ok: true }>(`/api/games/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game),
    }),
  deleteGame: (id: number) => request<{ ok: true }>(`/api/games/${id}`, { method: 'DELETE' }),
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function toIsoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Runs often go past midnight, so before this hour a new game defaults to the previous day's run. */
export const RUN_DAY_CUTOFF_HOUR = 5

export function runDate(now: Date) {
  const date = new Date(now)
  if (date.getHours() < RUN_DAY_CUTOFF_HOUR) date.setDate(date.getDate() - 1)
  return date
}

const MODE_BY_TEAM_SIZE: Record<number, string> = { 3: 'hc3', 4: 'hc4', 5: 'fc5' }

export function modeForTeamSize(size: number): string | undefined {
  return MODE_BY_TEAM_SIZE[size]
}

export const names = (team: PlayerRef[]) => team.map((p) => p.name).join(', ')
