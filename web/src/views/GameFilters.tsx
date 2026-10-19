import { Button } from '@/components/arc/button/button'
import type { Court, Mode } from '../api'
import { ModeFilter } from './ModeFilter'
import { CourtFilter } from './CourtFilter'

type Props = {
  modes: Mode[]
  mode: string
  onModeChange: (mode: string) => void
  courts: Court[]
  court: string
  onCourtChange: (court: string) => void
}

export function GameFilters({ modes, mode, onModeChange, courts, court, onCourtChange }: Props) {
  return (
    <div className="game-filters">
      <ModeFilter modes={modes} mode={mode} onModeChange={onModeChange} />
      <CourtFilter courts={courts} court={court} onCourtChange={onCourtChange} />
      {(mode || court) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="filter-reset"
          onClick={() => {
            onModeChange('')
            onCourtChange('')
          }}
        >
          Reset filters
        </Button>
      )}
    </div>
  )
}
