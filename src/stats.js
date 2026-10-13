export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_PROVISIONAL_GAMES = 10;

// Score-scale independent, so it works whether a mode plays to 11, 15, or 21.
export function isBlowout(winnerScore, loserScore) {
  return loserScore * 2 <= winnerScore;
}

function blankPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    games: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    winMarginTotal: 0,
    lossMarginTotal: 0,
    biggestWin: null,
    worstLoss: null,
    blowoutWins: 0,
    blowoutLosses: 0,
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
    const margin = Math.abs(g.scoreA - g.scoreB);
    const blowout = isBlowout(Math.max(g.scoreA, g.scoreB), Math.min(g.scoreA, g.scoreB));

    const teamA = g.teamA.map(get);
    const teamB = g.teamB.map(get);
    const avg = (team) => team.reduce((s, p) => s + p.elo, 0) / team.length;
    const expectedA = 1 / (1 + 10 ** ((avg(teamB) - avg(teamA)) / 400));
    const deltaA = ELO_K * ((aWon ? 1 : 0) - expectedA);

    const apply = (team, won, ptsFor, ptsAgainst, eloDelta) => {
      for (const p of team) {
        p.games += 1;
        p.pointsFor += ptsFor;
        p.pointsAgainst += ptsAgainst;
        p.elo += eloDelta;
        const ref = { gameId: g.id, margin, score: `${ptsFor}-${ptsAgainst}`, playedAt: g.playedAt };
        if (won) {
          p.wins += 1;
          p.winMarginTotal += margin;
          if (blowout) p.blowoutWins += 1;
          if (!p.biggestWin || margin > p.biggestWin.margin) p.biggestWin = ref;
          p.streak = p.streak > 0 ? p.streak + 1 : 1;
          p.longestWinStreak = Math.max(p.longestWinStreak, p.streak);
        } else {
          p.losses += 1;
          p.lossMarginTotal += margin;
          if (blowout) p.blowoutLosses += 1;
          if (!p.worstLoss || margin > p.worstLoss.margin) p.worstLoss = ref;
          p.streak = p.streak < 0 ? p.streak - 1 : -1;
        }
      }
    };
    apply(teamA, aWon, g.scoreA, g.scoreB, deltaA);
    apply(teamB, !aWon, g.scoreB, g.scoreA, -deltaA);
  }

  const leaderboard = [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    games: p.games,
    wins: p.wins,
    losses: p.losses,
    winPct: p.games ? p.wins / p.games : 0,
    avgPlusMinus: p.games ? (p.pointsFor - p.pointsAgainst) / p.games : 0,
    avgWinMargin: p.wins ? p.winMarginTotal / p.wins : null,
    avgLossMargin: p.losses ? p.lossMarginTotal / p.losses : null,
    blowoutWins: p.blowoutWins,
    blowoutLosses: p.blowoutLosses,
    biggestWin: p.biggestWin,
    worstLoss: p.worstLoss,
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
      b.avgPlusMinus - a.avgPlusMinus ||
      a.name.localeCompare(b.name)
  );

  return { leaderboard, records: computeRecords(games, leaderboard) };
}

function computeRecords(games, leaderboard) {
  const decided = games.filter((g) => g.scoreA !== g.scoreB);
  const biggestBlowouts = decided
    .map((g) => ({ ...g, margin: Math.abs(g.scoreA - g.scoreB) }))
    .sort((a, b) => b.margin - a.margin || b.id - a.id)
    .slice(0, 5);

  const top = (key) => {
    const best = Math.max(0, ...leaderboard.map((p) => p[key]));
    if (best === 0) return null;
    return { value: best, players: leaderboard.filter((p) => p[key] === best).map((p) => p.name) };
  };

  return {
    totalGames: decided.length,
    biggestBlowouts,
    longestWinStreak: top('longestWinStreak'),
    mostBlowoutWins: top('blowoutWins'),
    mostBlowoutLosses: top('blowoutLosses'),
  };
}
