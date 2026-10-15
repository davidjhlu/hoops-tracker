import { useEffect, useRef, useState } from 'react'
import { Shuffle, X } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Alert } from '@/components/arc/alert/alert'
import { api } from '../api'
import { PITY_GAMES, drawTeams, gamesSinceTeammates, type Draw, type RandomizerMode } from '../teamRandomizer'

type Props = {
  open: boolean
  onClose: () => void
  pool: string[]
  draw: Draw | null
  onDraw: (draw: Draw) => void
  onUse: (teamA: string[], teamB: string[]) => void
}

/** Kept for the browser session so the lineup and the bench rule survive tab switches and logged games. */
const STORAGE_KEY = 'hoops:randomizer'
type Saved = { players: string[]; teamCount: number; mode: RandomizerMode; lastSatOut: string[] }

function loadSaved(): Saved {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '')
    return {
      players: Array.isArray(saved.players) ? saved.players : [],
      teamCount: [2, 3, 4].includes(saved.teamCount) ? saved.teamCount : 2,
      mode: saved.mode === 'pure' ? 'pure' : 'balanced',
      lastSatOut: Array.isArray(saved.lastSatOut) ? saved.lastSatOut : [],
    }
  } catch {
    return { players: [], teamCount: 2, mode: 'balanced', lastSatOut: [] }
  }
}

const MODE_NOTES: Record<RandomizerMode, string> = {
  balanced: `Random, but recent teammates are less likely to repeat, and anyone who hasn't teamed up in ${PITY_GAMES}+ shared games is pulled together.`,
  pure: 'Every split is equally likely. No history is used.',
}

export function RandomizeTeams({ open, onClose, pool, draw, onDraw, onUse }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saved, setSaved] = useState<Saved>(loadSaved)
  const [history, setHistory] = useState<Map<string, number> | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<[number, number]>([0, 1])

  const players = saved.players.filter((name) => pool.includes(name))
  const update = (patch: Partial<Saved>) =>
    setSaved((prev) => {
      const next = { ...prev, ...patch }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open || history) return
    let live = true
    api
      .games()
      .then((games) => live && setHistory(gamesSinceTeammates([...games].reverse())))
      .catch((e: Error) => live && setHistoryError(e.message))
    return () => {
      live = false
    }
  }, [open, history])

  const generate = () => {
    setError('')
    if (players.length < saved.teamCount) {
      setError(`Pick at least ${saved.teamCount} players for ${saved.teamCount} teams.`)
      return
    }
    const mode = saved.mode === 'balanced' && !history ? 'pure' : saved.mode
    const next = drawTeams({
      players,
      teamCount: saved.teamCount,
      mode,
      history: history ?? new Map(),
      mustPlay: saved.lastSatOut,
    })
    update({ lastSatOut: next.sittingOut })
    setPicked([0, 1])
    onDraw(next)
  }

  const teamOptions = draw?.teams.map((_, index) => ({ value: String(index), label: `Team ${index + 1}` })) ?? []
  const [left, right] = picked
  const canUse = draw && left !== right && draw.teams[left] && draw.teams[right]

  return (
    <dialog ref={dialogRef} className="randomizer" aria-labelledby="randomizer-title" onClose={onClose}>
      <div className="randomizer-body">
        <header className="randomizer-header">
          <h2 id="randomizer-title">Randomize teams</h2>
          <Button type="button" variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </Button>
        </header>

        <section className="randomizer-section" aria-labelledby="randomizer-players">
          <div className="randomizer-section-head">
            <h3 id="randomizer-players">
              Players <span className="note">{players.length} selected</span>
            </h3>
            <div className="randomizer-quick">
              <Button type="button" variant="ghost" size="sm" onClick={() => update({ players: pool })}>
                All
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => update({ players: [] })}>
                None
              </Button>
            </div>
          </div>
          {pool.length ? (
            <ChipGroup
              label="Players to randomize"
              options={pool.map((name) => ({ value: name, label: name }))}
              value={players}
              onValueChange={(next) => update({ players: next })}
            />
          ) : (
            <p className="note">Add players in the form first.</p>
          )}
        </section>

        <div className="randomizer-options">
          <section className="randomizer-section" aria-labelledby="randomizer-count">
            <h3 id="randomizer-count">Teams</h3>
            <ChipGroup
              label="Number of teams"
              multiple={false}
              options={[2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
              value={[String(saved.teamCount)]}
              onValueChange={(next) => next[0] && update({ teamCount: Number(next[0]) })}
            />
          </section>
          <section className="randomizer-section" aria-labelledby="randomizer-mode">
            <h3 id="randomizer-mode">Randomizer</h3>
            <ChipGroup
              label="Randomizer mode"
              multiple={false}
              options={[
                { value: 'balanced', label: 'Balanced' },
                { value: 'pure', label: 'Pure' },
              ]}
              value={[saved.mode]}
              onValueChange={(next) => next[0] && update({ mode: next[0] as RandomizerMode })}
            />
          </section>
        </div>
        <p className="note">{MODE_NOTES[saved.mode]}</p>

        {historyError && saved.mode === 'balanced' && (
          <Alert tone="warning" title="Couldn't load game history">
            Balanced needs past games, so draws will be pure random until it loads.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" title="Can't randomize yet">
            {error}
          </Alert>
        )}

        <Button type="button" variant="secondary" onClick={generate}>
          <Shuffle size={16} aria-hidden="true" />
          {draw ? 'Reroll' : 'Generate teams'}
        </Button>

        {draw && (
          <section className="randomizer-result" aria-label="Generated teams" aria-live="polite">
            <ol className="randomizer-teams">
              {draw.teams.map((team, index) => (
                <li key={index} className={index === left || index === right ? 'is-picked' : ''}>
                  <h4>Team {index + 1}</h4>
                  <span>{team.join(', ')}</span>
                </li>
              ))}
            </ol>
            {draw.sittingOut.length > 0 && (
              <p className="note">
                Sitting out: {draw.sittingOut.join(', ')}. {draw.sittingOut.length === 1 ? 'They play' : 'They all play'} on the
                next roll.
              </p>
            )}
            {draw.teams.length > 2 && (
              <div className="randomizer-options">
                <section className="randomizer-section" aria-labelledby="randomizer-team-a">
                  <h3 id="randomizer-team-a">Team A</h3>
                  <ChipGroup
                    label="Generated team to use as Team A"
                    multiple={false}
                    options={teamOptions}
                    value={[String(left)]}
                    onValueChange={(next) => next[0] && setPicked([Number(next[0]), right])}
                  />
                </section>
                <section className="randomizer-section" aria-labelledby="randomizer-team-b">
                  <h3 id="randomizer-team-b">Team B</h3>
                  <ChipGroup
                    label="Generated team to use as Team B"
                    multiple={false}
                    options={teamOptions}
                    value={[String(right)]}
                    onValueChange={(next) => next[0] && setPicked([left, Number(next[0])])}
                  />
                </section>
              </div>
            )}
            {draw.teams.length > 2 && left === right && <p className="note">Pick two different teams.</p>}
          </section>
        )}

        <footer className="randomizer-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canUse}
            onClick={() => {
              if (!draw || !canUse) return
              onUse(draw.teams[left], draw.teams[right])
            }}
          >
            Use these teams
          </Button>
        </footer>
      </div>
    </dialog>
  )
}
