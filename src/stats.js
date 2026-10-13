export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_PROVISIONAL_GAMES = 10;

function blankPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    games: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    longestWinStreak: 0,
    elo: ELO_START,
  };
}

/**
 * Computes per-player stats from games sorted oldest first.
 * Elo is computed only over the games passed in, so filtering by mode yields per-mode Elo.
 */
export function computeStats(games, { minGames = 0 } = {}) {
  const players = new Map();
  const get = (p) => {
    if (!players.has(p.id)) players.set(p.id, blankPlayer(p));
    return players.get(p.id);
  };

  for (const g of games) {
    if (g.scoreA === g.scoreB || !g.teamA.length || !g.teamB.length) continue;
    const aWon = g.scoreA > g.scoreB;

    const teamA = g.teamA.map(get);
    const teamB = g.teamB.map(get);
    const avg = (team) => team.reduce((s, p) => s + p.elo, 0) / team.length;
    const expectedA = 1 / (1 + 10 ** ((avg(teamB) - avg(teamA)) / 400));
    const deltaA = ELO_K * ((aWon ? 1 : 0) - expectedA);

    const apply = (team, won, eloDelta) => {
      for (const p of team) {
        p.games += 1;
        p.elo += eloDelta;
        if (won) {
          p.wins += 1;
          p.streak = p.streak > 0 ? p.streak + 1 : 1;
          p.longestWinStreak = Math.max(p.longestWinStreak, p.streak);
        } else {
          p.losses += 1;
          p.streak = p.streak < 0 ? p.streak - 1 : -1;
        }
      }
    };
    apply(teamA, aWon, deltaA);
    apply(teamB, !aWon, -deltaA);
  }

  const leaderboard = [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    games: p.games,
    wins: p.wins,
    losses: p.losses,
    winPct: p.games ? p.wins / p.games : 0,
    streak: p.streak,
    longestWinStreak: p.longestWinStreak,
    elo: Math.round(p.elo),
    eloProvisional: p.games < ELO_PROVISIONAL_GAMES,
    qualified: p.games >= minGames,
  }));

  leaderboard.sort(
    (a, b) =>
      b.qualified - a.qualified ||
      b.winPct - a.winPct ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
  );

  const longestWinStreak = (() => {
    const best = Math.max(0, ...leaderboard.map((p) => p.longestWinStreak));
    if (best === 0) return null;
    return { value: best, players: leaderboard.filter((p) => p.longestWinStreak === best).map((p) => p.name) };
  })();

  return {
    leaderboard,
    records: {
      totalGames: games.filter((g) => g.scoreA !== g.scoreB).length,
      longestWinStreak,
    },
  };
}
