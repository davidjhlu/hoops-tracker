import { useEffect, useState } from 'react'
import { Trash2, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/arc/badge/badge'
import { ConfirmMorph } from '@/components/arc/confirm-morph/confirm-morph'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Alert } from '@/components/arc/alert/alert'
import { api, formatDate, names, type Game, type Mode } from '../api'
import { ModeFilter } from './ModeFilter'

type Props = {
  modes: Mode[]
  mode: string
  onModeChange: (mode: string) => void
  version: number
  onChange: () => void
}

const MODE_TONES: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  hc3: 'info',
  hc4: 'success',
  hc5: 'warning',
  fc5: 'danger',
}

export function GameLog({ modes, mode, onModeChange, version, onChange }: Props) {
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState('')
  const modeLabel = (id: string) => modes.find((m) => m.id === id)?.label ?? id

  useEffect(() => {
    let live = true
    api
      .games(mode)
      .then((g) => {
        if (!live) return
        setGames(g)
        setError('')
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [mode, version])

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

      {error && (
        <Alert tone="danger" title="Couldn't load games">
          {error}
        </Alert>
      )}

      {shown && shown.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="No games to show"
          description={mode ? 'Try another mode.' : 'Logged games show up here, newest first.'}
        />
      )}

      <ol className="games">
        {shown?.map((g) => {
          const aWon = g.scoreA > g.scoreB
          const rowClassName = ['game', ghosts.has(g.id) ? 'deleted' : ''].filter(Boolean).join(' ')
          return (
            <li key={g.id} className={rowClassName}>
              <div className="game-meta">
                <span>{formatDate(g.playedAt)}</span>
                {!mode && (
                  <Badge size="sm" tone={MODE_TONES[g.mode] ?? 'neutral'}>
                    {modeLabel(g.mode)}
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
