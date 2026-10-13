import { useEffect, useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Alert } from '@/components/arc/alert/alert'
import { api, formatDate, names, type Game, type Mode, type PlayerRef } from '../api'

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
            .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.id - a.id)
            .slice(0, 5),
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

  return (
    <section className="player-recent" aria-label={`Recent games for ${player.name}`}>
      <h3>Recent games</h3>
      {error && (
        <Alert tone="danger" title="Couldn't load recent games">
          {error}
        </Alert>
      )}
      {games === null && !error && <p className="note">Loading recent games…</p>}
      {games?.length === 0 && <p className="note">No games to show.</p>}
      {games && games.length > 0 && (
        <ol className="player-recent-list">
          {games.map((game) => {
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
      )}
    </section>
  )
}
