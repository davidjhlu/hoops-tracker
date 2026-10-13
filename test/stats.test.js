import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, isBlowout, marginPct, ELO_START } from '../src/stats.js';

const p = (id, name) => ({ id, name });
const ann = p(1, 'Ann');
const bob = p(2, 'Bob');
const cat = p(3, 'Cat');
const dan = p(4, 'Dan');

const game = (id, teamA, teamB, scoreA, scoreB, mode = 'hc3') => ({
  id, mode, playedAt: `2026-01-${String(id).padStart(2, '0')}`, teamA, teamB, scoreA, scoreB,
});

const byName = (stats) => Object.fromEntries(stats.leaderboard.map((r) => [r.name, r]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('blowout means loser scored half or less', () => {
  assert.equal(isBlowout(21, 10), true);
  assert.equal(isBlowout(11, 6), false);
  assert.equal(isBlowout(11, 5), true);
});

test('wins, losses, margins and streaks', () => {
  const games = [
    game(1, [ann, bob], [cat, dan], 21, 10),
    game(2, [ann, cat], [bob, dan], 21, 19),
    game(3, [bob, cat], [ann, dan], 21, 15),
  ];
  const s = byName(computeStats(games));

  assert.equal(s.Ann.wins, 2);
  assert.equal(s.Ann.losses, 1);
  assert.equal(s.Ann.streak, -1);
  assert.equal(s.Ann.longestWinStreak, 2);
  close(s.Ann.avgWinMarginPct, (11 / 21 + 2 / 21) / 2);
  close(s.Ann.avgLossMarginPct, 6 / 21);
  close(s.Ann.avgMarginPct, (11 / 21 + 2 / 21 - 6 / 21) / 3);
  assert.equal(s.Ann.blowoutWins, 1);
  assert.equal(s.Ann.biggestWin.margin, 11);

  assert.equal(s.Dan.wins, 0);
  assert.equal(s.Dan.losses, 3);
  assert.equal(s.Dan.streak, -3);
  assert.equal(s.Dan.blowoutLosses, 1);
  assert.equal(s.Dan.worstLoss.margin, 11);
  assert.equal(s.Dan.avgWinMarginPct, null);
  close(s.Dan.avgMarginPct, -(11 + 2 + 6) / 21 / 3);
});

test('margin % compares games played to different scores', () => {
  close(marginPct(11, 0), 1);
  close(marginPct(15, 3), 0.8);
  close(marginPct(15, 5), 2 / 3);

  const games = [game(1, [ann], [bob], 15, 5), game(2, [ann], [bob], 11, 9)];
  const s = byName(computeStats(games));
  close(s.Ann.avgWinMarginPct, (10 / 15 + 2 / 11) / 2);
  close(s.Bob.avgMarginPct, -(10 / 15 + 2 / 11) / 2);
  assert.equal(s.Ann.biggestWin.gameId, 1);
});

test('biggest blowout ranks by margin %, then raw margin', () => {
  const games = [
    game(1, [ann], [bob], 15, 3),
    game(2, [ann], [bob], 11, 0),
    game(3, [ann], [bob], 15, 0),
    game(4, [ann], [bob], 21, 19),
  ];
  const { records } = computeStats(games);
  assert.deepEqual(records.biggestBlowouts.map((g) => g.id), [3, 2, 1, 4]);
  close(records.biggestBlowouts[2].marginPct, 0.8);
});

test('elo is zero-sum and favors winners', () => {
  const games = [game(1, [ann, bob], [cat, dan], 21, 10), game(2, [ann, cat], [bob, dan], 21, 19)];
  const { leaderboard } = computeStats(games);
  const total = leaderboard.reduce((sum, r) => sum + r.elo, 0);
  assert.ok(Math.abs(total - ELO_START * 4) <= 2, 'ratings stay centered on the start value');
  const s = Object.fromEntries(leaderboard.map((r) => [r.name, r]));
  assert.ok(s.Ann.elo > ELO_START);
  assert.ok(s.Dan.elo < ELO_START);
  assert.equal(s.Ann.eloProvisional, true);
});

test('min games pushes unqualified players below qualified ones', () => {
  const games = [
    game(1, [ann], [bob], 11, 5),
    game(2, [ann], [bob], 11, 9),
    game(3, [cat], [bob], 11, 2),
  ];
  const { leaderboard } = computeStats(games, { minGames: 2 });
  assert.deepEqual(leaderboard.map((r) => [r.name, r.qualified]), [
    ['Ann', true],
    ['Bob', true],
    ['Cat', false],
  ]);
});

test('records pick the biggest blowouts and streak leaders', () => {
  const games = [game(1, [ann], [bob], 11, 2), game(2, [ann], [bob], 11, 9), game(3, [bob], [ann], 11, 0)];
  const { records } = computeStats(games);
  assert.equal(records.totalGames, 3);
  assert.equal(records.biggestBlowouts[0].id, 3);
  assert.deepEqual(records.longestWinStreak, { value: 2, players: ['Ann'] });
});
