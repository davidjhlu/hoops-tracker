import { useEffect, useId, useState, type FormEvent } from 'react'
import { Select } from '@/components/arc/select/select'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Input } from '@/components/arc/input/input'
import { Button } from '@/components/arc/button/button'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Alert } from '@/components/arc/alert/alert'
import { Shuffle } from 'lucide-react'
import { api, fromIsoDate, modeForTeamSize, runDate, toIsoDate, type Game, type Mode } from '../api'
import type { Draw } from '../teamRandomizer'
import { RandomizeTeams } from './RandomizeTeams'

type Props = {
  modes: Mode[]
  version: number
  onSaved: () => void
  /** When set, the form edits this game instead of logging a new one. */
  game?: Game
  onCancel?: () => void
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function LogGame({ modes, version, onSaved, game, onCancel }: Props) {
  const formId = useId()
  const [mode, setMode] = useState(game?.mode ?? 'hc3')
  const [today] = useState(() => new Date())
  const [date, setDate] = useState<Date | undefined>(() => (game ? fromIsoDate(game.playedAt) : runDate(today)))
  const [pool, setPool] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [teamA, setTeamA] = useState<string[]>(() => game?.teamA.map((p) => p.name) ?? [])
  const [teamB, setTeamB] = useState<string[]>(() => game?.teamB.map((p) => p.name) ?? [])
  const [scoreA, setScoreA] = useState(game?.scoreA ?? 0)
  const [scoreB, setScoreB] = useState(game?.scoreB ?? 0)
  const [randomizerOpen, setRandomizerOpen] = useState(false)
  const [draw, setDraw] = useState<Draw | null>(null)

  // Only a change in team size picks the mode, so a manual pick sticks until someone is added or removed.
  const changeTeams = (nextA: string[], nextB: string[]) => {
    const before = Math.max(teamA.length, teamB.length)
    const after = Math.max(nextA.length, nextB.length)
    const suggested = after !== before ? modeForTeamSize(after) : undefined
    if (suggested && modes.some((m) => m.id === suggested)) setMode(suggested)
    setTeamA(nextA)
    setTeamB(nextB)
  }
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .players()
      .then((players) =>
        setPool((prev) => {
          const merged = [...players.map((p) => p.name)]
          for (const n of prev) if (!merged.some((m) => sameName(m, n))) merged.push(n)
          return merged.sort((a, b) => a.localeCompare(b))
        }),
      )
      .catch((e: Error) => setError(e.message))
  }, [version])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved])

  const nameError = (() => {
    const n = newName.trim()
    if (!n) return undefined
    if (n.length > 30) return 'Keep names to 30 characters'
    if (pool.some((p) => sameName(p, n))) return `${n} is already in the list`
    return undefined
  })()

  const addPlayer = async () => {
    const n = newName.trim().replace(/\s+/g, ' ')
    if (!n || nameError || adding) return
    setAdding(true)
    setAddError('')
    try {
      const player = await api.addPlayer(n)
      setPool((prev) =>
        prev.some((p) => sameName(p, player.name)) ? prev : [...prev, player.name].sort((a, b) => a.localeCompare(b)),
      )
      setNewName('')
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const toOptions = (exclude: string[]) =>
    pool.filter((n) => !exclude.includes(n)).map((n) => ({ value: n, label: n }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!date) return setError('Pick the date the game was played.')
    if (!teamA.length || !teamB.length) return setError('Each team needs at least one player.')
    if (scoreA === scoreB) return setError("Scores can't be tied. Somebody won.")
    setSaving(true)
    const body = { mode, playedAt: toIsoDate(date), teamA, teamB, scoreA, scoreB }
    if (game) {
      try {
        await api.updateGame(game.id, body)
        onSaved()
      } catch (err) {
        setError((err as Error).message)
        setSaving(false)
      }
      return
    }
    try {
      await api.addGame(body)
      setDraw(null)
      setTeamA([])
      setTeamB([])
      setScoreA(0)
      setScoreB(0)
      setSaved(true)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack log-form" onSubmit={submit} noValidate>
      <div className="row">
        <Select
          label="Mode"
          options={modes.map((m) => ({ value: m.id, label: m.label }))}
          value={mode}
          onValueChange={setMode}
        />
        <DatePicker label="Date" value={date} onChange={setDate} maxDate={today} showToday />
      </div>

      <div className="row add-player">
        <Input
          label="Add a player"
          placeholder="Name"
          value={newName}
          maxLength={40}
          autoComplete="off"
          error={nameError ?? (addError || undefined)}
          onChange={(e) => {
            setNewName(e.target.value)
            setAddError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addPlayer()
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addPlayer}
          loading={adding}
          disabled={!newName.trim() || !!nameError}
        >
          Add
        </Button>
      </div>

      {!game && (
        <>
          <div className="row">
            <Button type="button" variant="secondary" onClick={() => setRandomizerOpen(true)} disabled={!pool.length}>
              <Shuffle size={16} aria-hidden="true" />
              Randomize teams
            </Button>
          </div>
          <RandomizeTeams
            open={randomizerOpen}
            onClose={() => setRandomizerOpen(false)}
            pool={pool}
            draw={draw}
            onDraw={setDraw}
            onUse={(nextA, nextB) => {
              changeTeams(nextA, nextB)
              setRandomizerOpen(false)
            }}
          />
        </>
      )}

      <div className="teams">
        <section className="team" aria-labelledby={`${formId}-team-a`}>
          <h2 id={`${formId}-team-a`}>Team A</h2>
          {pool.length ? (
            <ChipGroup
              label="Team A players"
              options={toOptions(teamB)}
              value={teamA}
              onValueChange={(next) => changeTeams(next, teamB)}
            />
          ) : (
            <p className="note">Add players above to pick teams.</p>
          )}
          <NumberField label="Team A score" value={scoreA} onValueChange={setScoreA} min={0} max={300} />
        </section>
        <section className="team" aria-labelledby={`${formId}-team-b`}>
          <h2 id={`${formId}-team-b`}>Team B</h2>
          {pool.length ? (
            <ChipGroup
              label="Team B players"
              options={toOptions(teamA)}
              value={teamB}
              onValueChange={(next) => changeTeams(teamA, next)}
            />
          ) : (
            <p className="note">Add players above to pick teams.</p>
          )}
          <NumberField label="Team B score" value={scoreB} onValueChange={setScoreB} min={0} max={300} />
        </section>
      </div>

      {error && (
        <Alert tone="danger" title="Couldn't save the game">
          {error}
        </Alert>
      )}

      {game ? (
        <div className="row form-actions">
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="submit" size="lg" loading={saving}>
          {saved ? 'Saved' : 'Save game'}
        </Button>
      )}
    </form>
  )
}
