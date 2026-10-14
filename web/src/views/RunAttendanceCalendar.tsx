import { useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { Select } from '@/components/arc/select/select'
import { formatDate, names, type Game, type Mode, type PlayerRef } from '../api'

type Props = {
  player: PlayerRef
  runGames: Game[]
  playerGames: Game[]
  mode: string
  modes: Mode[]
}

const WEEKDAYS = [
  { short: 'Su', full: 'Sunday' },
  { short: 'Mo', full: 'Monday' },
  { short: 'Tu', full: 'Tuesday' },
  { short: 'We', full: 'Wednesday' },
  { short: 'Th', full: 'Thursday' },
  { short: 'Fr', full: 'Friday' },
  { short: 'Sa', full: 'Saturday' },
]

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`
const currentMonthKey = () => {
  const today = new Date()
  return monthKey(today.getFullYear(), today.getMonth() + 1)
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}-01T12:00:00Z`),
  )
}

function buildMonthOptions(games: Game[]) {
  const current = currentMonthKey()
  const gameMonths = games.map((game) => game.playedAt.slice(0, 7)).filter(Boolean).sort()
  const firstGameMonth = gameMonths[0] ?? current
  const latestGameMonth = gameMonths.at(-1) ?? current
  const first = firstGameMonth < current ? firstGameMonth : current
  const last = latestGameMonth > current ? latestGameMonth : current
  const [startYear, startMonth] = first.split('-').map(Number)
  const [endYear, endMonth] = last.split('-').map(Number)
  const options: { value: string; label: string }[] = []

  for (let date = new Date(Date.UTC(startYear, startMonth - 1, 1)); date <= new Date(Date.UTC(endYear, endMonth - 1, 1)); date.setUTCMonth(date.getUTCMonth() + 1)) {
    const value = monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1)
    options.push({ value, label: monthLabel(value) })
  }
  return options.reverse()
}

function gameWon(game: Game, playerId: number) {
  const onA = game.teamA.some((member) => member.id === playerId)
  return onA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA
}

export function RunAttendanceCalendar({ player, runGames, playerGames, mode, modes }: Props) {
  const [monthSelection, setMonthSelection] = useState('')
  const [selectedDay, setSelectedDay] = useState<{ key: string; date: string } | null>(null)
  const options = buildMonthOptions(runGames)
  const newestGameMonth = runGames.reduce((latest, game) => {
    const value = game.playedAt.slice(0, 7)
    return value > latest ? value : latest
  }, '')
  const month =
    options.find((option) => option.value === monthSelection)?.value ??
    options.find((option) => option.value === newestGameMonth)?.value ??
    options[0]?.value ??
    currentMonthKey()
  const selectedMonthKey = `${player.id}:${mode}:${month}`

  const runGamesByDate = new Map<string, Game[]>()
  for (const game of runGames) {
    const date = game.playedAt.slice(0, 10)
    const sameDay = runGamesByDate.get(date) ?? []
    sameDay.push(game)
    runGamesByDate.set(date, sameDay)
  }
  const playerDates = new Set(playerGames.map((game) => game.playedAt.slice(0, 10)))
  const runDates = [...runGamesByDate.keys()].sort((a, b) => b.localeCompare(a))
  const latestRuns = runDates.slice(0, 10)
  const attendedLatestRuns = latestRuns.filter((date) => playerDates.has(date)).length

  const [year, monthNumber] = month.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const days: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  while (days.length % 7 !== 0) days.push(null)
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, (index + 1) * 7))
  const monthRunDates = runDates.filter((date) => date.startsWith(month))
  const attendedRuns = monthRunDates.filter((date) => playerDates.has(date)).length
  const detailDate = selectedDay?.key === selectedMonthKey ? selectedDay.date : ''
  const detailGames = detailDate ? runGamesByDate.get(detailDate) ?? [] : []
  const attendedDetailRun = detailDate ? playerDates.has(detailDate) : false
  const modeLabel = (id: string) => modes.find((item) => item.id === id)?.label ?? id

  return (
    <section className="run-attendance" aria-label={`Run attendance for ${player.name}`}>
      <header className="run-attendance-header">
        <div>
          <h3>Runs attended</h3>
          <p className="note">Each recorded run is one date; filled means attended, outlined means missed.</p>
        </div>
        <Select
          label="Month"
          options={options}
          value={month}
          onValueChange={setMonthSelection}
        />
      </header>

      <p className="run-attendance-count">
        {attendedRuns} {attendedRuns === 1 ? 'run' : 'runs'} attended in {monthLabel(month)}
      </p>
      <p className="run-attendance-recent-count">
        {latestRuns.length > 0
          ? `${attendedLatestRuns} of the last ${latestRuns.length} ${latestRuns.length === 1 ? 'run' : 'runs'} attended`
          : 'No runs recorded yet'}
      </p>

      <div className="run-calendar" role="group" aria-label={`Run attendance for ${monthLabel(month)}`}>
        <div className="run-calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day.full}>
              {day.short}
            </span>
          ))}
        </div>
        <div className="run-calendar-weeks">
          {weeks.map((week, weekIndex) => (
            <div className="run-calendar-week" key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (day === null) return <span className="run-calendar-blank" aria-hidden="true" key={dayIndex} />
                const date = `${month}-${String(day).padStart(2, '0')}`
                const dayGames = runGamesByDate.get(date) ?? []
                const hasRun = dayGames.length > 0
                const attended = hasRun && playerDates.has(date)
                const missed = hasRun && !attended
                const dayLabel = `${formatDate(date)}: ${
                  !hasRun
                    ? 'no run recorded'
                    : `${attended ? 'attended' : 'run recorded, not attended'}, ${dayGames.length} ${dayGames.length === 1 ? 'game' : 'games'}`
                }`
                return (
                  <div className="run-calendar-cell" key={date}>
                    <button
                      type="button"
                      className={`run-calendar-day ${attended ? 'is-attended' : ''} ${missed ? 'is-missed' : ''} ${detailDate === date ? 'is-selected' : ''}`}
                      aria-label={dayLabel}
                      aria-pressed={detailDate === date}
                      title={dayLabel}
                      disabled={!hasRun}
                      onClick={() => setSelectedDay({ key: selectedMonthKey, date })}
                    >
                      {day}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {detailGames.length > 0 && (
        <section className="run-attendance-details" aria-label={`Games on ${formatDate(detailDate)}`}>
          <h4>
            {formatDate(detailDate)} · {attendedDetailRun ? 'Attended' : 'Not attended'} · {detailGames.length}{' '}
            {detailGames.length === 1 ? 'game' : 'games'}
          </h4>
          <ul>
            {detailGames.map((game) => {
              const played = [...game.teamA, ...game.teamB].some((member) => member.id === player.id)
              const won = played && gameWon(game, player.id)
              return (
                <li key={game.id}>
                  <div className="run-attendance-game-meta">
                    <Badge size="sm" tone={!played ? 'neutral' : won ? 'success' : 'danger'}>
                      {!played ? 'Not in game' : won ? 'Win' : 'Loss'}
                    </Badge>
                    {!mode && <Badge size="sm" tone="neutral">{modeLabel(game.mode)}</Badge>}
                  </div>
                  <span>{names(game.teamA)}</span>
                  <strong>{game.scoreA}-{game.scoreB}</strong>
                  <span>{names(game.teamB)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </section>
  )
}
