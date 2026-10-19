import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { Alert } from '@/components/arc/alert/alert'
import { api, type Courts, type Mode, type PlayerRef } from './api'
import { Leaderboard } from './views/Leaderboard'
import { GameLog } from './views/GameLog'
import { LogGame } from './views/LogGame'
import { PlayerStats } from './views/PlayerStats'

const NO_COURTS: Courts = { courts: [], runs: {} }

export default function App() {
  const [tab, setTab] = useState('leaderboard')
  const [modes, setModes] = useState<Mode[]>([])
  const [mode, setMode] = useState('')
  const [court, setCourt] = useState('')
  const [courts, setCourts] = useState<Courts>(NO_COURTS)
  const [player, setPlayer] = useState<PlayerRef | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    api.config().then((c) => setModes(c.modes)).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    let live = true
    api
      .courts()
      .then((value) => live && setCourts(value))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [version])

  const refresh = () => setVersion((v) => v + 1)
  const showPlayer = (p: PlayerRef) => {
    setPlayer(p)
    setTab('stats')
  }
  const changeTab = (nextTab: string) => setTab(nextTab)
  const filters = { modes, mode, onModeChange: setMode, courts: courts.courts, court, onCourtChange: setCourt, version }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Hoops tracker</h1>
      </header>

      {error && (
        <Alert tone="danger" title="Couldn't reach the server">
          {error}
        </Alert>
      )}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Sections">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="log">Log a game</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Leaderboard {...filters} onPlayer={showPlayer} />
        </TabsContent>
        <TabsContent value="stats">
          <PlayerStats
            {...filters}
            runCourts={courts.runs}
            player={player}
            onPlayerChange={setPlayer}
            onChange={refresh}
          />
        </TabsContent>
        <TabsContent value="games">
          <GameLog {...filters} courtData={courts} onChange={refresh} />
        </TabsContent>
        <TabsContent value="log">
          <LogGame modes={modes} courtData={courts} version={version} onSaved={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
