import { useEffect, useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Alert } from '@/components/arc/alert/alert'
import { api, formatDate, names, type Game, type Mode, type PlayerRef } from '../api'
import { getMatchupHighlights, summarizePlayerMatchups, type PairingRecord } from '../matchups'

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

type MatchupHighlights = {
  best: PairingRecord | null
  lowest: PairingRecord | null
}

type MatchupSummary = {
  teammates: MatchupHighlights
  opponents: MatchupHighlights
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
  const pairings = games ? summarizePlayerMatchups(games, player.id) : null
  const matchups: MatchupSummary | null = pairings
    ? {
        teammates: getMatchupHighlights(pairings.teammates),
        opponents: getMatchupHighlights(pairings.opponents),
      }
    : null
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
