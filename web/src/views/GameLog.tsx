import { useEffect, useState } from 'react'
import { Trash2, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { ConfirmMorph } from '@/components/arc/confirm-morph/confirm-morph'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Alert } from '@/components/arc/alert/alert'
import { api, formatDate, names, type Game, type Mode, type PlayerRef } from '../api'
import { ModeFilter } from './ModeFilter'

type Props = {
  modes: Mode[]
  mode: string
  onModeChange: (mode: string) => void
  player: PlayerRef | null
  onClearPlayer: () => void
  version: number
  onChange: () => void
}

const isBlowout = (g: Game) => Math.min(g.scoreA, g.scoreB) * 2 <= Math.max(g.scoreA, g.scoreB)

export function GameLog({ modes, mode, onModeChange, player, onClearPlayer, version, onChange }: Props) {
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState('')
  const modeLabel = (id: string) => modes.find((m) => m.id === id)?.label ?? id

  useEffect(() => {
    let live = true
    api
      .games(mode, player?.id)
      .then((g) => {
        if (!live) return
        setGames(g)
        setError('')
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [mode, player, version])

  const record = (() => {
    if (!player || !games) return null
    let w = 0
    for (const g of games) {
      const onA = g.teamA.some((p) => p.id === player.id)
      if (onA === g.scoreA > g.scoreB) w += 1
    }
    return { w, l: games.length - w }
  })()

  // Deleted games stay on screen until the undo window closes, so the row can offer Undo.
  const [ghosts, setGhosts] = useState<Map<number, Game>>(new Map())
  const setGhost = (game: Game, present: boolean) =>
    setGhosts((prev) => {
      if (prev.has(game.id) === present) return prev
      const next = new Map(prev)
      if (present) next.set(game.id, game)
      else next.delete(game.id)
      return next
    })

  const shown = games
    ? [...games, ...[...ghosts.values()].filter((g) => !games.some((x) => x.id === g.id))].sort(
        (a, b) => b.playedAt.localeCompare(a.playedAt) || b.id - a.id,
      )
    : null

  const remove = async (game: Game) => {
    await api.deleteGame(game.id)
    setGhost(game, true)
    onChange()
  }
  const restore = async (game: Game) => {
    setGhost(game, false)
    await api.addGame({
      mode: game.mode,
      playedAt: game.playedAt,
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      teamA: game.teamA.map((p) => p.name),
      teamB: game.teamB.map((p) => p.name),
    })
    onChange()
  }

  return (
    <div className="stack">
      <ModeFilter modes={modes} mode={mode} onModeChange={onModeChange} />

      {player && (
        <div className="player-filter">
          <span>
            Showing games for <strong>{player.name}</strong>
            {record && ` (${record.w}-${record.l})`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClearPlayer}>
            Show everyone
          </Button>
        </div>
      )}

      {error && (
        <Alert tone="danger" title="Couldn't load games">
          {error}
        </Alert>
      )}

      {shown && shown.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="No games to show"
          description={mode || player ? 'Try another mode or clear the player filter.' : 'Logged games show up here, newest first.'}
        />
      )}

      <ol className="games">
        {shown?.map((g) => {
          const aWon = g.scoreA > g.scoreB
          return (
            <li key={g.id} className={ghosts.has(g.id) ? 'game deleted' : 'game'}>
              <div className="game-meta">
                <span>{formatDate(g.playedAt)}</span>
                <Badge size="sm">{modeLabel(g.mode)}</Badge>
                {isBlowout(g) && (
                  <Badge size="sm" tone="warning">
                    Blowout
                  </Badge>
                )}
              </div>
              <div className="game-score">
                <span className={aWon ? 'team won' : 'team'}>{names(g.teamA)}</span>
                <span className="score">
                  <span className={aWon ? 'won' : 'lost'}>{g.scoreA}</span>
                  <span className="dash">-</span>
                  <span className={aWon ? 'lost' : 'won'}>{g.scoreB}</span>
                </span>
                <span className={aWon ? 'team right' : 'team right won'}>{names(g.teamB)}</span>
              </div>
              <div className="game-actions">
                <ConfirmMorph
                  label="Delete"
                  icon={<Trash2 size={14} strokeWidth={1.75} />}
                  prompt="Delete this game?"
                  onConfirm={() => remove(g)}
                  onUndo={() => restore(g)}
                  onStateChange={(state) => state === 'idle' && setGhost(g, false)}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
