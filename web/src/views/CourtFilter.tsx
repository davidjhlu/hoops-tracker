import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import type { Court, CourtFilter as CourtFilterValue } from '../api'

type Props = { courts: Court[]; court: CourtFilterValue; onCourtChange: (court: CourtFilterValue) => void }

export function CourtFilter({ courts, court, onCourtChange }: Props) {
  if (!courts.length) return null
  return (
    <div className="filter-field">
      <span className="filter-label">Court</span>
      <ChipGroup
        label="Court"
        multiple={false}
        options={[
          { value: 'all', label: 'All courts' },
          ...courts.map((c) => ({ value: String(c.id), label: c.name })),
        ]}
        value={[court || 'all']}
        onValueChange={(v) => onCourtChange(!v[0] || v[0] === 'all' ? '' : v[0])}
      />
    </div>
  )
}
