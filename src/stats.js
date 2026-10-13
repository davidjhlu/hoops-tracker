export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_PROVISIONAL_GAMES = 10;

/**
 * Margin as a share of the winning score, so games to 11 and to 15 compare fairly:
 * 11-0 is 1.0, 15-3 is 0.8, 11-9 is about 0.18.
 */
export function marginPct(winnerScore, loserScore) {
  return winnerScore > 0 ? (winnerScore - loserScore) / winnerScore : 0;
}

export function isBlowout(winnerScore, loserScore) {
  return marginPct(winnerScore, loserScore) >= 0.5;
}

/** Orders by margin %, then raw margin, so 11-0 beats 15-3 and 15-0 beats 11-0. */
const moreLopsided = (a, b) => b.marginPct - a.marginPct || b.margin - a.margin;

function blankPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    games: 0,
    wins: 0,
    losses: 0,
    marginPctTotal: 0,
    winMarginPctTotal: 0,
    lossMarginPctTotal: 0,
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
    const winner = Math.max(g.scoreA, g.scoreB);
    const loser = Math.min(g.scoreA, g.scoreB);
    const margin = winner - loser;
    const pct = marginPct(winner, loser);
    const blowout = isBlowout(winner, loser);

    const teamA = g.teamA.map(get);
    const teamB = g.teamB.map(get);
    const avg = (team) => team.reduce((s, p) => s + p.elo, 0) / team.length;
    const expectedA = 1 / (1 + 10 ** ((avg(teamB) - avg(teamA)) / 400));
    const deltaA = ELO_K * ((aWon ? 1 : 0) - expectedA);

    const apply = (team, won, ptsFor, ptsAgainst, eloDelta) => {
      for (const p of team) {
        p.games += 1;
        p.elo += eloDelta;
        const ref = { gameId: g.id, margin, marginPct: pct, score: `${ptsFor}-${ptsAgainst}`, playedAt: g.playedAt };
        if (won) {
          p.wins += 1;
          p.marginPctTotal += pct;
          p.winMarginPctTotal += pct;
          if (blowout) p.blowoutWins += 1;
          if (!p.biggestWin || moreLopsided(ref, p.biggestWin) < 0) p.biggestWin = ref;
          p.streak = p.streak > 0 ? p.streak + 1 : 1;
          p.longestWinStreak = Math.max(p.longestWinStreak, p.streak);
        } else {
          p.losses += 1;
          p.marginPctTotal -= pct;
          p.lossMarginPctTotal += pct;
          if (blowout) p.blowoutLosses += 1;
          if (!p.worstLoss || moreLopsided(ref, p.worstLoss) < 0) p.worstLoss = ref;
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
    avgMarginPct: p.games ? p.marginPctTotal / p.games : 0,
    avgWinMarginPct: p.wins ? p.winMarginPctTotal / p.wins : null,
    avgLossMarginPct: p.losses ? p.lossMarginPctTotal / p.losses : null,
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
      b.avgMarginPct - a.avgMarginPct ||
      a.name.localeCompare(b.name)
  );

  return { leaderboard, records: computeRecords(games, leaderboard) };
}

function computeRecords(games, leaderboard) {
  const decided = games.filter((g) => g.scoreA !== g.scoreB);
  const biggestBlowouts = decided
    .map((g) => {
      const winner = Math.max(g.scoreA, g.scoreB);
      const loser = Math.min(g.scoreA, g.scoreB);
      return { ...g, margin: winner - loser, marginPct: marginPct(winner, loser) };
    })
    .sort((a, b) => moreLopsided(a, b) || b.id - a.id)
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
