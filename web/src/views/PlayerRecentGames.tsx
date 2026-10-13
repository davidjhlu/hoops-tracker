import { useEffect, useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Alert } from '@/components/arc/alert/alert'
import { api, formatDate, names, type Game, type Mode, type PlayerRef } from '../api'

const MIN_MATCHUP_GAMES = 3

type Props = {
  player: PlayerRef
  mode: string
  modes: Mode[]
  version: number
}

const MODE_TONES: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  hc3: 'info',
  hc4: 'success',
  hc5: 'warning',
  fc5: 'danger',
}

const playerWon = (game: Game, playerId: number) => {
  const isOnTeamA = game.teamA.some((player) => player.id === playerId)
  return isOnTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA
}

type RecentGamesState = {
  key: string
  games: Game[] | null
  error: string
}

type PairingRecord = {
  id: number
  name: string
  wins: number
  losses: number
  games: number
  winPct: number
}

type MatchupHighlights = {
  best: PairingRecord | null
  lowest: PairingRecord | null
}

type MatchupSummary = {
  teammates: MatchupHighlights
  opponents: MatchupHighlights
}

function getHighlights(records: Map<number, Omit<PairingRecord, 'games' | 'winPct'>>): MatchupHighlights {
  const pairings = [...records.values()].map((record) => {
    const games = record.wins + record.losses
    return { ...record, games, winPct: record.wins / games }
  }).filter((record) => record.games >= MIN_MATCHUP_GAMES)
  const bestFirst = [...pairings].sort(
    (a, b) => b.winPct - a.winPct || b.games - a.games || a.name.localeCompare(b.name),
  )
  const lowestFirst = [...pairings].sort(
    (a, b) => a.winPct - b.winPct || b.games - a.games || a.name.localeCompare(b.name),
  )
  return { best: bestFirst[0] ?? null, lowest: lowestFirst[0] ?? null }
}

function summarizeMatchups(games: Game[], playerId: number): MatchupSummary {
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

  return { teammates: getHighlights(teammates), opponents: getHighlights(opponents) }
}

function MatchupGroup({
  title,
  relation,
  highlights,
}: {
  title: string
  relation: 'with' | 'against'
  highlights: MatchupHighlights
}) {
  const pairing = (label: string, value: PairingRecord | null) => (
    <div className="player-matchup-row">
      <span className="player-matchup-label">{label}</span>
      {value ? (
        <>
          <strong className="player-matchup-name">{value.name}</strong>
          <span className="player-matchup-record">
            {value.wins}-{value.losses} · {Math.round(value.winPct * 100)}% · {value.games}{' '}
            {value.games === 1 ? 'game' : 'games'}
          </span>
        </>
      ) : (
        <span className="player-matchup-empty">No pairing with 3+ games yet</span>
      )}
    </div>
  )

  return (
    <section className="player-matchup-group">
      <h4>{title}</h4>
      <div className="player-matchup-list">
        {pairing(`Highest win % ${relation}`, highlights.best)}
        {pairing(`Lowest win % ${relation}`, highlights.lowest)}
      </div>
    </section>
  )
}

export function PlayerRecentGames({ player, mode, modes, version }: Props) {
  const requestKey = `${mode}:${player.id}`
  const [state, setState] = useState<RecentGamesState>({ key: '', games: null, error: '' })

  useEffect(() => {
    let live = true
    api
      .games(mode, player.id)
      .then((result) => {
        if (!live) return
        setState({
          key: requestKey,
          error: '',
          games: result
            .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.id - a.id),
        })
      })
      .catch((e: Error) => live && setState({ key: requestKey, games: null, error: e.message }))
    return () => {
      live = false
    }
  }, [mode, player.id, requestKey, version])

  const modeLabel = (id: string) => modes.find((item) => item.id === id)?.label ?? id
  const games = state.key === requestKey ? state.games : null
  const error = state.key === requestKey ? state.error : ''
  const matchups = games ? summarizeMatchups(games, player.id) : null
  const recentGames = games?.slice(0, 5)

  return (
    <section className="player-recent" aria-label={`Recent games for ${player.name}`}>
      {error && (
        <Alert tone="danger" title="Couldn't load recent games">
          {error}
        </Alert>
      )}
      {games === null && !error && <p className="note">Loading recent games…</p>}
      {games?.length === 0 && <p className="note">No games to show.</p>}
      {matchups && games && games.length > 0 && (
        <>
          <section className="player-matchup-summary">
            <h3>Matchups</h3>
            <p className="note">Only pairings with 3 or more games are ranked.</p>
            <div className="player-matchup-groups">
              <MatchupGroup title="Teammates" relation="with" highlights={matchups.teammates} />
              <MatchupGroup title="Opponents" relation="against" highlights={matchups.opponents} />
            </div>
          </section>
          <section className="player-recent-games">
            <h3>Recent games</h3>
            <ol className="player-recent-list">
              {recentGames?.map((game) => {
                const aWon = game.scoreA > game.scoreB
                const won = playerWon(game, player.id)
                return (
                  <li key={game.id} className={`player-recent-game ${won ? 'player-win' : 'player-loss'}`}>
                    <div className="player-recent-meta">
                      <time dateTime={game.playedAt}>{formatDate(game.playedAt)}</time>
                      <Badge size="sm" tone={won ? 'success' : 'danger'}>
                        {won ? 'Win' : 'Loss'}
                      </Badge>
                      {!mode && (
                        <Badge size="sm" tone={MODE_TONES[game.mode] ?? 'neutral'}>
                          {modeLabel(game.mode)}
                        </Badge>
                      )}
                    </div>
                    <div className="player-recent-teams">
                      <span className={`player-recent-team ${aWon ? 'is-winner' : ''}`}>{names(game.teamA)}</span>
                      <span className="player-recent-score">
                        {game.scoreA}-{game.scoreB}
                      </span>
                      <span className={`player-recent-team right ${aWon ? '' : 'is-winner'}`}>{names(game.teamB)}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}
    </section>
  )
}
