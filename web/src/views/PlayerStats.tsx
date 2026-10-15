import { useEffect, useState } from 'react'
import { Alert } from '@/components/arc/alert/alert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Select } from '@/components/arc/select/select'
import { api, formatDate, names, type Game, type Mode, type PlayerRef, type Stats } from '../api'
import { MIN_MATCHUP_GAMES, summarizePlayerMatchups, type PairingRecord } from '../matchups'
import { ModeFilter } from './ModeFilter'
import { RunAttendanceCalendar } from './RunAttendanceCalendar'

const PAGE_SIZE = 10

type Props = {
  modes: Mode[]
  mode: string
  onModeChange: (mode: string) => void
  player: PlayerRef | null
  onPlayerChange: (player: PlayerRef | null) => void
  version: number
}

type KeyedResult<T> = {
  key: string
  value: T | null
  error: string
}

const MODE_TONES: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  hc3: 'info',
  hc4: 'success',
  hc5: 'warning',
  fc5: 'danger',
}

const streakValue = (streak: number) => Math.abs(streak)
// The counter renders its suffix in an inline-block, which drops a leading regular space, so use a non-breaking one.
const streakSuffix = (streak: number) => {
  if (streak === 0) return ''
  const one = Math.abs(streak) === 1
  return `\u00a0${streak > 0 ? (one ? 'win' : 'wins') : one ? 'loss' : 'losses'}`
}

function MatchupTable({ title, pairings, playerName }: { title: string; pairings: PairingRecord[]; playerName: string }) {
  return (
    <section className="player-matchup-group">
      <h3>{title}</h3>
      {pairings.length === 0 ? (
        <p className="note">No pairings have reached {MIN_MATCHUP_GAMES} games yet.</p>
      ) : (
        <div className="matchup-table-wrap">
          <table className="matchup-table">
            <caption className="sr-only">{title} for {playerName}</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Record</th>
                <th scope="col">Win rate</th>
                <th scope="col">Games</th>
              </tr>
            </thead>
            <tbody>
              {pairings.map((pairing) => (
                <tr key={pairing.id}>
                  <th scope="row">{pairing.name}</th>
                  <td>{pairing.wins}-{pairing.losses}</td>
                  <td>{Math.round(pairing.winPct * 100)}%</td>
                  <td>{pairing.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function playerWon(game: Game, playerId: number) {
  const onA = game.teamA.some((member) => member.id === playerId)
  return onA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA
}

export function PlayerStats({ modes, mode, onModeChange, player, onPlayerChange, version }: Props) {
  const [playersState, setPlayersState] = useState<KeyedResult<PlayerRef[]>>({ key: '', value: null, error: '' })
  const [statsState, setStatsState] = useState<KeyedResult<Stats>>({ key: '', value: null, error: '' })
  const [runGamesState, setRunGamesState] = useState<KeyedResult<Game[]>>({ key: '', value: null, error: '' })
  const [pageState, setPageState] = useState({ key: '', value: 1 })
  const statsKey = `${mode}:${version}`
  const gamesKey = `${mode}:${player?.id ?? ''}:${version}`
  const runGamesKey = `${mode}:${version}`

  useEffect(() => {
    let live = true
    api.players()
      .then((value) => live && setPlayersState({ key: 'players', value, error: '' }))
      .catch((e: Error) => live && setPlayersState({ key: 'players', value: null, error: e.message }))
    return () => {
      live = false
    }
  }, [version])

  useEffect(() => {
    let live = true
    api.stats(mode, 0)
      .then((value) => live && setStatsState({ key: statsKey, value, error: '' }))
      .catch((e: Error) => live && setStatsState({ key: statsKey, value: null, error: e.message }))
    return () => {
      live = false
    }
  }, [mode, statsKey])

  useEffect(() => {
    let live = true
    api.games(mode)
      .then((value) => {
        if (!live) return
        setRunGamesState({
          key: runGamesKey,
          value: value.sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.id - a.id),
          error: '',
        })
      })
      .catch((e: Error) => live && setRunGamesState({ key: runGamesKey, value: null, error: e.message }))
    return () => {
      live = false
    }
  }, [mode, runGamesKey])

  const players = playersState.key === 'players' ? playersState.value ?? [] : []
  const stats = statsState.key === statsKey ? statsState.value : null
  const runGames = runGamesState.key === runGamesKey ? runGamesState.value : null
  const statsError = statsState.key === statsKey ? statsState.error : ''
  const runGamesError = runGamesState.key === runGamesKey ? runGamesState.error : ''
  const games = runGames && player
    ? runGames.filter((game) => [...game.teamA, ...game.teamB].some((member) => member.id === player.id))
    : null
  const loadingGames = Boolean(player) && runGamesState.key !== runGamesKey && !runGamesError
  const gamesError = runGamesError
  const playerStats = stats?.leaderboard.find((entry) => entry.id === player?.id)
  const matchups = games && player ? summarizePlayerMatchups(games, player.id) : null
  const pageCount = Math.max(1, Math.ceil((games?.length ?? 0) / PAGE_SIZE))
  const page = pageState.key === gamesKey ? pageState.value : 1
  const currentPage = Math.min(page, pageCount)
  const pageGames = games?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) ?? []
  const firstShown = games?.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const lastShown = Math.min(currentPage * PAGE_SIZE, games?.length ?? 0)
  const modeLabel = (id: string) => modes.find((item) => item.id === id)?.label ?? id

  return (
    <div className="stack">
      <ModeFilter modes={modes} mode={mode} onModeChange={onModeChange} />
      {playersState.error && (
        <Alert tone="danger" title="Couldn't load players">
          {playersState.error}
        </Alert>
      )}
      {statsError && (
        <Alert tone="danger" title="Couldn't load player stats">
          {statsError}
        </Alert>
      )}
      {runGamesError && (
        <Alert tone="danger" title="Couldn't load run history">
          {runGamesError}
        </Alert>
      )}
      <div className="toolbar stats-toolbar">
        <Select
          label="Player"
          placeholder="Choose a player"
          options={players.map((option) => ({ value: String(option.id), label: option.name }))}
          value={player ? String(player.id) : ''}
          onValueChange={(id) => onPlayerChange(players.find((option) => option.id === Number(id)) ?? null)}
        />
      </div>

      {!player && (
        <EmptyState
          title="Choose a player"
          description="Select a player to see their record, matchup win rates, and full game history."
        />
      )}

      {player && (
        <section className="player-stats">
          <header className="player-stats-header">
            <h2>{player.name}</h2>
            {mode && <Badge size="sm" tone="neutral">{modeLabel(mode)}</Badge>}
          </header>

          {playerStats ? (
            <div className="metrics">
              <MetricCard
                label="Games played"
                value={playerStats.games}
                context={`${playerStats.wins}-${playerStats.losses} record`}
              />
              <MetricCard
                label="Win rate"
                value={Math.round(playerStats.winPct * 100)}
                suffix="%"
                context={`${playerStats.wins} ${playerStats.wins === 1 ? 'win' : 'wins'} · ${playerStats.losses} ${
                  playerStats.losses === 1 ? 'loss' : 'losses'
                }`}
              />
              <MetricCard
                label="Current streak"
                value={streakValue(playerStats.streak)}
                suffix={streakSuffix(playerStats.streak)}
                context={`Longest win streak: ${playerStats.longestWinStreak}`}
              />
            </div>
          ) : (
            <p className="note">{stats ? 'No games for this player in the selected mode yet.' : 'Loading player stats…'}</p>
          )}

          {games && runGames && (
            <RunAttendanceCalendar player={player} playerGames={games} runGames={runGames} mode={mode} modes={modes} />
          )}
          {games && !runGames && !runGamesError && <p className="note">Loading run attendance…</p>}

          {matchups && (
            <section className="player-matchup-summary">
              <div>
                <h3>Matchup win rates</h3>
                <p className="note">Showing every pairing with at least {MIN_MATCHUP_GAMES} games.</p>
              </div>
              <div className="player-matchup-groups">
                <MatchupTable title="Teammates" pairings={matchups.teammates} playerName={player.name} />
                <MatchupTable title="Opponents" pairings={matchups.opponents} playerName={player.name} />
              </div>
            </section>
          )}

          <section className="player-recent-games">
            <div>
              <h3>Game history</h3>
              {games && <p className="note">{games.length} {games.length === 1 ? 'game' : 'games'}{mode ? ` in ${modeLabel(mode)}` : ' across all modes'}.</p>}
            </div>
            {gamesError && (
              <Alert tone="danger" title="Couldn't load game history">
                {gamesError}
              </Alert>
            )}
            {loadingGames && <p className="note">Loading game history…</p>}
            {games?.length === 0 && <p className="note">No games to show for this player in the selected mode.</p>}
            {pageGames.length > 0 && (
              <>
                <ol className="player-recent-list">
                  {pageGames.map((game) => {
                    const aWon = game.scoreA > game.scoreB
                    const won = playerWon(game, player.id)
                    return (
                      <li key={game.id} className={`player-recent-game ${won ? 'player-win' : 'player-loss'}`}>
                        <div className="player-recent-meta">
                          <time dateTime={game.playedAt}>{formatDate(game.playedAt)}</time>
                          <Badge size="sm" tone={won ? 'success' : 'danger'}>{won ? 'Win' : 'Loss'}</Badge>
                          {!mode && <Badge size="sm" tone={MODE_TONES[game.mode] ?? 'neutral'}>{modeLabel(game.mode)}</Badge>}
                        </div>
                        <div className="player-recent-teams">
                          <span className={`player-recent-team ${aWon ? 'is-winner' : ''}`}>{names(game.teamA)}</span>
                          <span className="player-recent-score">{game.scoreA}-{game.scoreB}</span>
                          <span className={`player-recent-team right ${aWon ? '' : 'is-winner'}`}>{names(game.teamB)}</span>
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {pageCount > 1 && (
                  <nav className="history-pagination" aria-label="Game history pages">
                    <span aria-live="polite">Showing {firstShown}–{lastShown} of {games?.length} games</span>
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setPageState({ key: gamesKey, value: Math.max(1, currentPage - 1) })}
                      >
                        Previous
                      </Button>
                      <span>Page {currentPage} of {pageCount}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={currentPage >= pageCount}
                        onClick={() => setPageState({ key: gamesKey, value: Math.min(pageCount, currentPage + 1) })}
                      >
                        Next
                      </Button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </div>
  )
}
