import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { Alert } from '@/components/arc/alert/alert'
import { api, type Mode, type PlayerRef } from './api'
import { Leaderboard } from './views/Leaderboard'
import { GameLog } from './views/GameLog'
import { LogGame } from './views/LogGame'
import { PlayerStats } from './views/PlayerStats'

export default function App() {
  const [tab, setTab] = useState('leaderboard')
  const [modes, setModes] = useState<Mode[]>([])
  const [mode, setMode] = useState('')
  const [player, setPlayer] = useState<PlayerRef | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    api.config().then((c) => setModes(c.modes)).catch((e: Error) => setError(e.message))
  }, [])

  const refresh = () => setVersion((v) => v + 1)
  const showPlayer = (p: PlayerRef) => {
    setPlayer(p)
    setTab('stats')
  }
  const changeTab = (nextTab: string) => setTab(nextTab)

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
          <Leaderboard modes={modes} mode={mode} onModeChange={setMode} version={version} onPlayer={showPlayer} />
        </TabsContent>
        <TabsContent value="stats">
          <PlayerStats
            modes={modes}
            mode={mode}
            onModeChange={setMode}
            player={player}
            onPlayerChange={setPlayer}
            version={version}
          />
        </TabsContent>
        <TabsContent value="games">
          <GameLog
            modes={modes}
            mode={mode}
            onModeChange={setMode}
            version={version}
            onChange={refresh}
          />
        </TabsContent>
        <TabsContent value="log">
          <LogGame modes={modes} version={version} onSaved={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
