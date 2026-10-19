import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import type { Court, CourtFilter as CourtFilterValue } from '../api'

type Props = { courts: Court[]; court: CourtFilterValue; onCourtChange: (court: CourtFilterValue) => void }

export function CourtFilter({ courts, court, onCourtChange }: Props) {
  if (!courts.length) return null
  return (
    <ChipGroup
      label="Court"
      multiple={false}
      options={[
        ...courts.map((c) => ({ value: String(c.id), label: c.name })),
        { value: 'none', label: 'No court' },
      ]}
      value={court ? [court] : []}
      onValueChange={(v) => onCourtChange(v[0] ?? '')}
    />
  )
}
