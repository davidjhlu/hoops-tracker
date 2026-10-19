import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import type { Mode } from '../api'

type Props = { modes: Mode[]; mode: string; onModeChange: (mode: string) => void }

export function ModeFilter({ modes, mode, onModeChange }: Props) {
  return (
    <div className="filter-field">
      <span className="filter-label">Mode</span>
      <ChipGroup
        label="Game mode"
        multiple={false}
        options={[
          { value: 'all', label: 'All modes' },
          ...modes.map((m) => ({ value: m.id, label: m.label })),
        ]}
        value={[mode || 'all']}
        onValueChange={(v) => onModeChange(!v[0] || v[0] === 'all' ? '' : v[0])}
      />
    </div>
  )
}
