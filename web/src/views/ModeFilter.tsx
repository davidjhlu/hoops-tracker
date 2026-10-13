import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import type { Mode } from '../api'

type Props = { modes: Mode[]; mode: string; onModeChange: (mode: string) => void }

export function ModeFilter({ modes, mode, onModeChange }: Props) {
  return (
    <ChipGroup
      label="Game mode"
      multiple={false}
      options={modes.map((m) => ({ value: m.id, label: m.label }))}
      value={mode ? [mode] : []}
      onValueChange={(v) => onModeChange(v[0] ?? '')}
    />
  )
}
