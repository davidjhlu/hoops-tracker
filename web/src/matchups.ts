import type { Game, PlayerRef } from './api'

export const MIN_MATCHUP_GAMES = 3

export type PairingRecord = {
  id: number
  name: string
  wins: number
  losses: number
  games: number
  winPct: number
}

export type PlayerMatchups = {
  teammates: PairingRecord[]
  opponents: PairingRecord[]
}

function sortByWinRate(a: PairingRecord, b: PairingRecord) {
  return b.winPct - a.winPct || b.games - a.games || a.name.localeCompare(b.name)
}

export function summarizePlayerMatchups(games: Game[], playerId: number): PlayerMatchups {
  const teammates = new Map<number, Omit<PairingRecord, 'games' | 'winPct'>>()
  const opponents = new Map<number, Omit<PairingRecord, 'games' | 'winPct'>>()

  const record = (records: typeof teammates, player: PlayerRef, won: boolean) => {
    const current = records.get(player.id) ?? { id: player.id, name: player.name, wins: 0, losses: 0 }
    if (won) current.wins += 1
    else current.losses += 1
    records.set(player.id, current)
  }

  for (const game of games) {
    const playerOnA = game.teamA.some((member) => member.id === playerId)
    const playerOnB = game.teamB.some((member) => member.id === playerId)
    if (!playerOnA && !playerOnB) continue

    const ownTeam = playerOnA ? game.teamA : game.teamB
    const otherTeam = playerOnA ? game.teamB : game.teamA
    const won = playerOnA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA

    for (const teammate of ownTeam) if (teammate.id !== playerId) record(teammates, teammate, won)
    for (const opponent of otherTeam) record(opponents, opponent, won)
  }

  const toPairings = (records: typeof teammates) =>
    [...records.values()]
      .map((record) => {
        const games = record.wins + record.losses
        return { ...record, games, winPct: record.wins / games }
      })
      .filter((pairing) => pairing.games >= MIN_MATCHUP_GAMES)
      .sort(sortByWinRate)

  return { teammates: toPairings(teammates), opponents: toPairings(opponents) }
}

export function getMatchupHighlights(pairings: PairingRecord[]) {
  const lowestFirst = [...pairings].sort(
    (a, b) => a.winPct - b.winPct || b.games - a.games || a.name.localeCompare(b.name),
  )
  return { best: pairings[0] ?? null, lowest: lowestFirst[0] ?? null }
}
