import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Select } from '@/components/arc/select/select'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Alert } from '@/components/arc/alert/alert'
import { api, names, type Leader, type Mode, type PlayerRef, type PlayerStats, type Stats } from '../api'
import { ModeFilter } from './ModeFilter'
import { useMediaQuery } from '../useMediaQuery'

type Props = {
  modes: Mode[]
  mode: string
  onModeChange: (mode: string) => void
  version: number
  onPlayer: (player: PlayerRef) => void
}

type Row = PlayerStats & { rank: number }

const MIN_GAME_OPTIONS = ['0', '1', '3', '5', '10'].map((v) => ({ value: v, label: v === '1' ? '1 game' : `${v} games` }))

type MobileSort = 'rank' | 'avgMarginPct' | 'elo'
const SORT_OPTIONS: { value: MobileSort; label: string }[] = [
  { value: 'rank', label: 'Win %' },
  { value: 'avgMarginPct', label: 'Avg margin' },
  { value: 'elo', label: 'Elo' },
]

const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`)
const signedPct = (n: number) => {
  const rounded = Math.round(n * 100)
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`
}
const streakLabel = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–')
const leaderContext = (leader: Leader, fallback: string) => (leader ? leader.players.join(', ') : fallback)

// MetricCard only takes a number, and a score like "11-0" is the point of this card.
function BlowoutCard({ game }: { game: Stats['records']['biggestBlowouts'][number] | undefined }) {
  if (!game) {
    return (
      <article className="score-card">
        <span className="score-card-label">Biggest blowout</span>
        <span className="score-card-value">–</span>
        <p>No games yet</p>
      </article>
    )
  }
  const aWon = game.scoreA > game.scoreB
  const winners = aWon ? game.teamA : game.teamB
  const losers = aWon ? game.teamB : game.teamA
  return (
    <article className="score-card">
      <span className="score-card-label">Biggest blowout</span>
      <span className="score-card-value">
        {Math.max(game.scoreA, game.scoreB)}-{Math.min(game.scoreA, game.scoreB)}
      </span>
      <p>
        <span className="score-card-winners">{names(winners)}</span> over {names(losers)}
      </p>
    </article>
  )
}

type CompactBoardProps = {
  rows: Row[]
  sort: MobileSort
  emptyMessage: string
  onPlayer: (player: PlayerRef) => void
}

function CompactBoard({ rows, sort, emptyMessage, onPlayer }: CompactBoardProps) {
  if (!rows.length) return <p className="note board-empty">{emptyMessage}</p>
  const sorted = sort === 'rank' ? rows : [...rows].sort((a, b) => b[sort] - a[sort] || a.rank - b.rank)
  return (
    <ol className="board" aria-label="Leaderboard">
      {sorted.map((row) => (
        <li key={row.id}>
          <button type="button" className="board-row" onClick={() => onPlayer({ id: row.id, name: row.name })}>
            <span className="board-rank">{row.rank}</span>
            <span className="board-main">
              <span className="board-name">{row.name}</span>
              <span className="board-sub">
                {signedPct(row.avgMarginPct)} margin · {streakLabel(row.streak)} · Elo {row.elo}
                {row.eloProvisional ? '*' : ''}
              </span>
            </span>
            <span className="board-stat">
              <span className="board-pct">{Math.round(row.winPct * 100)}%</span>
              <span className="board-sub">
                {row.wins}-{row.losses}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export function Leaderboard({ modes, mode, onModeChange, version, onPlayer }: Props) {
  const [minGames, setMinGames] = useState('1')
  const [mobileSort, setMobileSort] = useState<MobileSort>('rank')
  // Matches the width where the Arc table folds its rows and drops the column labels.
  const compact = useMediaQuery('(max-width: 619px)')
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    api
      .stats(mode, Number(minGames))
      .then((s) => {
        if (!live) return
        setStats(s)
        setError('')
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [mode, minGames, version])

  const qualified: Row[] = (stats?.leaderboard ?? []).filter((p) => p.qualified).map((p, i) => ({ ...p, rank: i + 1 }))
  const unqualified = (stats?.leaderboard ?? []).filter((p) => !p.qualified)
  const records = stats?.records
  const topBlowout = records?.biggestBlowouts[0]

  const columns: DataColumn<Row>[] = [
    { key: 'rank', label: '#', width: 48 },
    {
      key: 'name',
      label: 'Player',
      render: (_, row) => (
        <button type="button" className="link-button" onClick={() => onPlayer({ id: row.id, name: row.name })}>
          {row.name}
        </button>
      ),
    },
    { key: 'games', label: 'Games' },
    { key: 'wins', label: 'Record', numeric: true, render: (_, row) => `${row.wins}-${row.losses}` },
    { key: 'winPct', label: 'Win %', render: (v) => `${Math.round((v as number) * 100)}%` },
    { key: 'avgMarginPct', label: 'Avg margin', render: (v) => signedPct(v as number) },
    { key: 'avgWinMarginPct', label: 'Avg win by', numeric: true, render: (v) => pct(v as number | null) },
    { key: 'avgLossMarginPct', label: 'Avg loss by', numeric: true, render: (v) => pct(v as number | null) },
    { key: 'blowoutWins', label: 'Blowouts', render: (_, row) => `${row.blowoutWins} / ${row.blowoutLosses}` },
    { key: 'streak', label: 'Streak', render: (v) => streakLabel(v as number) },
    { key: 'elo', label: 'Elo', render: (v, row) => `${v}${row.eloProvisional ? '*' : ''}` },
  ]

  return (
    <div className="stack">
      <ModeFilter modes={modes} mode={mode} onModeChange={onModeChange} />

      {error && (
        <Alert tone="danger" title="Couldn't load the leaderboard">
          {error}
        </Alert>
      )}

      {stats && records && records.totalGames === 0 ? (
        <EmptyState
          icon={<Trophy size={24} />}
          title="No games yet"
          description={mode ? 'Nobody has logged a game in this mode yet.' : 'Log your first game and the leaderboard fills in.'}
        />
      ) : (
        stats &&
        records && (
          <>
            <div className="metrics">
              <MetricCard label="Games played" value={records.totalGames} context={mode ? 'In this mode' : 'All modes'} />
              <MetricCard
                label="Longest win streak"
                value={records.longestWinStreak?.value ?? 0}
                context={leaderContext(records.longestWinStreak, 'Nobody yet')}
              />
              <MetricCard
                label="Most blowout wins"
                value={records.mostBlowoutWins?.value ?? 0}
                context={leaderContext(records.mostBlowoutWins, 'No blowouts yet')}
              />
              <BlowoutCard game={topBlowout} />
            </div>

            <div className="toolbar">
              {compact && (
                <Select
                  label="Sort by"
                  options={SORT_OPTIONS}
                  value={mobileSort}
                  onValueChange={(v) => setMobileSort(v as MobileSort)}
                />
              )}
              <Select label="Minimum games" options={MIN_GAME_OPTIONS} value={minGames} onValueChange={setMinGames} />
            </div>

            {compact ? (
              <CompactBoard
                rows={qualified}
                sort={mobileSort}
                emptyMessage={`Nobody has played ${minGames} games yet. Lower the minimum to see everyone.`}
                onPlayer={onPlayer}
              />
            ) : (
              <SortableDataTable
                rows={qualified}
                rowKey={(row) => String(row.id)}
                columns={columns}
                caption="Leaderboard"
                emptyMessage={`Nobody has played ${minGames} games yet. Lower the minimum to see everyone.`}
                defaultSort={{ key: 'rank', direction: 'asc' }}
                itemName={{ one: 'player', other: 'players' }}
              />
            )}

            {unqualified.length > 0 && (
              <p className="note">
                Under {minGames} games: {unqualified.map((p) => `${p.name} (${p.wins}-${p.losses})`).join(', ')}
              </p>
            )}
            <p className="note">
              Margin is the gap as a share of the winning score, so games to 11 and to 15 compare fairly: 15-5 is 67% and
              11-0 is 100%. Avg margin counts wins as plus and losses as minus. A blowout is a margin of 50% or more. Elo
              starts at 1000 and is calculated within the selected mode. An asterisk means fewer than 10 games, so the
              rating is still settling.
            </p>
          </>
        )
      )}
    </div>
  )
}
