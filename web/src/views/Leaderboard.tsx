import { useEffect, useState } from 'react'
import { ChevronDown, Trophy } from 'lucide-react'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Select } from '@/components/arc/select/select'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Alert } from '@/components/arc/alert/alert'
import { api, type Leader, type Mode, type PlayerRef, type PlayerStats, type Stats } from '../api'
import { ModeFilter } from './ModeFilter'
import { PlayerRecentGames } from './PlayerRecentGames'
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

type MobileSort = 'rank' | 'elo'
const SORT_OPTIONS: { value: MobileSort; label: string }[] = [
  { value: 'rank', label: 'Win %' },
  { value: 'elo', label: 'Elo' },
]

const streakLabel = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–')
const leaderContext = (leader: Leader, fallback: string) => (leader ? leader.players.join(', ') : fallback)

type CompactBoardProps = {
  rows: Row[]
  sort: MobileSort
  emptyMessage: string
  expandedId: number | null
  mode: string
  modes: Mode[]
  version: number
  onToggle: (player: Row) => void
  onPlayer: (player: PlayerRef) => void
}

function CompactBoard({ rows, sort, emptyMessage, expandedId, mode, modes, version, onToggle, onPlayer }: CompactBoardProps) {
  if (!rows.length) return <p className="note board-empty">{emptyMessage}</p>
  const sorted = sort === 'rank' ? rows : [...rows].sort((a, b) => b[sort] - a[sort] || a.rank - b.rank)
  return (
    <ol className="board" aria-label="Leaderboard">
      {sorted.map((row) => (
        <li key={row.id} className="board-item">
          <div className="board-row-shell">
            <button
              type="button"
              className="board-row-expander"
              aria-label={`${expandedId === row.id ? 'Hide' : 'Show'} recent games for ${row.name}`}
              aria-expanded={expandedId === row.id}
              aria-controls={expandedId === row.id ? `compact-player-games-${row.id}` : undefined}
              onClick={() => onToggle(row)}
            />
            <span className="board-rank">{row.rank}</span>
            <span className="board-main">
              <button
                type="button"
                className="board-name board-name-link"
                onClick={() => onPlayer({ id: row.id, name: row.name })}
              >
                {row.name}
              </button>
              <span className="board-sub">
                {streakLabel(row.streak)} · Elo {row.elo}
                {row.eloProvisional ? '*' : ''}
              </span>
            </span>
            <span className="board-stat">
              <span className="board-pct">{Math.round(row.winPct * 100)}%</span>
              <span className="board-sub">
                {row.wins}-{row.losses}
              </span>
            </span>
            <span className={`board-row-chevron ${expandedId === row.id ? 'is-expanded' : ''}`} aria-hidden="true">
              <ChevronDown size={16} />
            </span>
          </div>
          {expandedId === row.id && (
            <div className="board-expanded" id={`compact-player-games-${row.id}`}>
              <PlayerRecentGames player={row} mode={mode} modes={modes} version={version} />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export function Leaderboard({ modes, mode, onModeChange, version, onPlayer }: Props) {
  const [minGames, setMinGames] = useState('1')
  const [mobileSort, setMobileSort] = useState<MobileSort>('rank')
  const [expandedId, setExpandedId] = useState<number | null>(null)
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
  const toggleExpanded = (row: Row) => setExpandedId((current) => (current === row.id ? null : row.id))

  const columns: DataColumn<Row>[] = [
    {
      key: 'rank',
      label: '#',
      width: 58,
      render: (value, row) => (
        <span className={`leader-rank ${expandedId === row.id ? 'is-expanded' : ''}`}>
          {value as number}
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      ),
    },
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
                expandedId={expandedId}
                mode={mode}
                modes={modes}
                version={version}
                onToggle={toggleExpanded}
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
                onRowActivate={toggleExpanded}
                expandedRowKey={expandedId === null ? undefined : String(expandedId)}
                renderExpandedRow={(row) => <PlayerRecentGames player={row} mode={mode} modes={modes} version={version} />}
              />
            )}

            {unqualified.length > 0 && (
              <p className="note">
                Under {minGames} games: {unqualified.map((p) => `${p.name} (${p.wins}-${p.losses})`).join(', ')}
              </p>
            )}
            <p className="note">
              Elo starts at 1000 and is calculated within the selected mode. An asterisk means fewer than 10 games, so
              the rating is still settling.
            </p>
          </>
        )
      )}
    </div>
  )
}
