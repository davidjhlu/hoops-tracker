import type { Game } from './api'

/** Two players who have shared this many games without being teammates get a strong pull toward each other. */
export const PITY_GAMES = 3
const OVERDUE_BONUS = 6
const CANDIDATE_SPLITS = 400
/** Softmax temperature: each point of cost makes a split about e^(1/1.5) ≈ 2x less likely, without ever ruling it out. */
const TEMPERATURE = 1.5

export type RandomizerMode = 'balanced' | 'pure'

export type Draw = { teams: string[][]; sittingOut: string[] }

/** Unbiased integer in [0, max) from the browser's cryptographic generator, using rejection sampling. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new Error('max must be a positive integer')
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0] < limit) return buffer[0] % max
  }
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const key = (name: string) => name.toLowerCase()
const pairKey = (a: string, b: string) => {
  const [x, y] = [key(a), key(b)].sort()
  return `${x}\u0000${y}`
}

/**
 * For every pair that has shared a game, how many shared games have passed since they were last teammates
 * (0 means they were teammates in their most recent shared game). Games must be oldest first.
 */
export function gamesSinceTeammates(games: Game[]): Map<string, number> {
  const since = new Map<string, number>()
  for (const game of games) {
    const players = [
      ...game.teamA.map((p) => ({ name: p.name, team: 'A' })),
      ...game.teamB.map((p) => ({ name: p.name, team: 'B' })),
    ]
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const pair = pairKey(players[i].name, players[j].name)
        since.set(pair, players[i].team === players[j].team ? 0 : (since.get(pair) ?? 0) + 1)
      }
    }
  }
  return since
}

function pairCost(since: number | undefined): number {
  if (since === undefined) return 0
  if (since >= PITY_GAMES) return -OVERDUE_BONUS
  return PITY_GAMES - since
}

/** Lower is better: recent teammates add cost, overdue pairs subtract it. */
export function splitCost(teams: string[][], history: Map<string, number>): number {
  let cost = 0
  for (const team of teams) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) cost += pairCost(history.get(pairKey(team[i], team[j])))
    }
  }
  return cost
}

function deal(players: string[], teamCount: number): string[][] {
  const order = shuffle(players)
  const size = order.length / teamCount
  return Array.from({ length: teamCount }, (_, index) => order.slice(index * size, (index + 1) * size))
}

/**
 * Splits players into equal teams. Anyone left over sits out, and anyone in `mustPlay` (last draw's bench)
 * is never benched again while others are available.
 */
export function drawTeams({
  players,
  teamCount,
  mode,
  history,
  mustPlay = [],
}: {
  players: string[]
  teamCount: number
  mode: RandomizerMode
  history: Map<string, number>
  mustPlay?: string[]
}): Draw {
  const size = Math.floor(players.length / teamCount)
  if (teamCount < 2 || size < 1) throw new Error(`Need at least ${Math.max(2, teamCount)} players for ${teamCount} teams`)
  const extras = players.length - size * teamCount

  const protectedKeys = new Set(mustPlay.map(key))
  const benchable = shuffle(players.filter((p) => !protectedKeys.has(key(p))))
  const fallback = shuffle(players.filter((p) => protectedKeys.has(key(p))))
  const sittingOut = [...benchable, ...fallback].slice(0, extras)
  const benched = new Set(sittingOut)
  const playing = players.filter((p) => !benched.has(p))

  if (mode === 'pure') return { teams: deal(playing, teamCount), sittingOut }

  const candidates = Array.from({ length: CANDIDATE_SPLITS }, () => {
    const teams = deal(playing, teamCount)
    return { teams, cost: splitCost(teams, history) }
  })
  const lowest = Math.min(...candidates.map((c) => c.cost))
  const weights = candidates.map((c) => Math.exp((lowest - c.cost) / TEMPERATURE))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let pick = randomFraction() * total
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i]
    if (pick < 0) return { teams: candidates[i].teams, sittingOut }
  }
  return { teams: candidates[candidates.length - 1].teams, sittingOut }
}

/** Uniform in [0, 1) with 53 bits from the cryptographic generator. */
function randomFraction(): number {
  const buffer = new Uint32Array(2)
  crypto.getRandomValues(buffer)
  return (buffer[0] * 2 ** 21 + (buffer[1] >>> 11)) / 2 ** 53
}
