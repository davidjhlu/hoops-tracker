import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, listGames, listPlayers, insertGame } from '../src/db.js';
import { createServer } from '../src/handler.js';

let server;
let base;
let dir;
let db;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hoops-test-'));
  db = await openDb({ url: `file:${path.join(dir, 'test.db')}` });
  server = createServer(async () => db);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (body) =>
  fetch(`${base}/api/games`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const valid = { mode: 'hc3', playedAt: '2026-10-10', teamA: ['Ann', 'Bob'], teamB: ['Cat', 'Dan'], scoreA: 21, scoreB: 15 };

test('logs a game and reflects it in stats', async () => {
  const res = await post(valid);
  assert.equal(res.status, 201);

  await post({ ...valid, mode: 'fc5', teamA: ['ann', 'Cat'], teamB: ['Bob', 'Dan'], scoreA: 10, scoreB: 30 });

  const players = await (await fetch(`${base}/api/players`)).json();
  assert.deepEqual(players.map((p) => p.name), ['Ann', 'Bob', 'Cat', 'Dan'], 'names match case-insensitively');

  const hc3 = await (await fetch(`${base}/api/stats?mode=hc3`)).json();
  assert.equal(hc3.records.totalGames, 1);
  assert.equal(hc3.leaderboard.find((p) => p.name === 'Ann').wins, 1);

  const all = await (await fetch(`${base}/api/stats`)).json();
  const ann = all.leaderboard.find((p) => p.name === 'Ann');
  assert.equal(ann.wins, 1);
  assert.equal(ann.losses, 1);

  const annGames = await (await fetch(`${base}/api/games?player=${ann.id}`)).json();
  assert.equal(annGames.length, 2);
  assert.equal(annGames[0].mode, 'fc5', 'newest first');
});

test('rejects bad games', async () => {
  const cases = [
    { ...valid, mode: 'nope' },
    { ...valid, scoreB: 21 },
    { ...valid, teamB: [] },
    { ...valid, teamB: ['ANN'] },
    { ...valid, playedAt: 'yesterday' },
    { ...valid, scoreA: -1 },
  ];
  for (const body of cases) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('deletes a game', async () => {
  const { id } = await (await post(valid)).json();
  assert.equal((await fetch(`${base}/api/games/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/api/games/${id}`, { method: 'DELETE' })).status, 404);
});

test('edits a game in place', async () => {
  const { id } = await (await post(valid)).json();
  const put = (gameId, body) =>
    fetch(`${base}/api/games/${gameId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const edited = { ...valid, mode: 'hc4', playedAt: '2026-10-09', teamA: ['Ann', 'Bob', 'Eve'], scoreA: 5, scoreB: 11 };
  assert.equal((await put(id, edited)).status, 200);

  const game = (await listGames(db)).find((g) => g.id === id);
  assert.equal(game.mode, 'hc4');
  assert.equal(game.playedAt, '2026-10-09');
  assert.deepEqual([game.scoreA, game.scoreB], [5, 11]);
  assert.deepEqual(game.teamA.map((p) => p.name), ['Ann', 'Bob', 'Eve']);
  assert.deepEqual(game.teamB.map((p) => p.name), ['Cat', 'Dan']);

  assert.equal((await put(id, { ...edited, scoreB: 5 })).status, 400, 'validates like a new game');
  assert.equal((await put(999999, edited)).status, 404);
  await fetch(`${base}/api/games/${id}`, { method: 'DELETE' });
});

test('courts belong to runs and filter games and stats', async () => {
  const json = (method, url, body) =>
    fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const court = await (await json('POST', '/api/courts', { name: 'Main St' })).json();
  assert.equal((await (await json('POST', '/api/courts', { name: 'main st' })).json()).id, court.id, 'case-insensitive');
  assert.equal((await json('POST', '/api/courts', { name: '  ' })).status, 400);

  const day = '2026-09-01';
  const first = await (await post({ ...valid, playedAt: day, courtId: court.id })).json();
  const second = await (await post({ ...valid, playedAt: day, scoreA: 1, scoreB: 21 })).json();
  assert.equal((await post({ ...valid, playedAt: day, courtId: 999999 })).status, 400, 'unknown court');

  const onDay = (await listGames(db)).filter((g) => g.playedAt === day);
  assert.deepEqual(onDay.map((g) => g.court?.name), ['Main St', 'Main St'], 'every game in the run shares the court');

  const { runs } = await (await fetch(`${base}/api/courts`)).json();
  assert.equal(runs[day], court.id);

  const filtered = await (await fetch(`${base}/api/games?court=${court.id}`)).json();
  assert.deepEqual(filtered.map((g) => g.id).sort(), [first.id, second.id].sort());
  assert.ok((await (await fetch(`${base}/api/games?court=none`)).json()).every((g) => g.court === null));

  const all = await (await fetch(`${base}/api/stats?mode=hc3`)).json();
  const atCourt = await (await fetch(`${base}/api/stats?mode=hc3&court=${court.id}`)).json();
  assert.equal(atCourt.records.totalGames, 2);
  const ann = (stats) => stats.leaderboard.find((p) => p.name === 'Ann');
  assert.equal(ann(atCourt).wins, 1, 'records follow the court');
  assert.equal(ann(atCourt).elo, ann(all).elo, 'Elo still rates every game');

  const otherCourt = await (await json('POST', '/api/courts', { name: 'Park' })).json();
  assert.equal((await json('PUT', `/api/games/${first.id}`, {
    ...valid, playedAt: day, courtId: otherCourt.id,
  })).status, 200);
  assert.ok((await listGames(db)).filter((g) => g.playedAt === day).every((g) => g.court?.id === otherCourt.id),
    'editing a court updates every game on the date');
  assert.equal((await json('PUT', `/api/runs/${day}/court`, { courtId: court.id })).status, 200);
  assert.ok((await listGames(db)).filter((g) => g.playedAt === day).every((g) => g.court?.id === court.id),
    'the calendar route sets the court for the whole run');
  assert.equal((await json('PUT', `/api/runs/${day}/court`, { courtId: 999999 })).status, 400);
  const afterCourtChange = await (await fetch(`${base}/api/stats?mode=hc3`)).json();
  assert.deepEqual(afterCourtChange, all, 'changing only a court leaves global stats and Elo unchanged');

  assert.equal((await json('PUT', `/api/runs/${day}/court`, { courtId: null })).status, 200);
  assert.ok((await listGames(db)).filter((g) => g.playedAt === day).every((g) => g.court === null));
  assert.equal((await json('PUT', '/api/runs/not-a-date/court', { courtId: court.id })).status, 400);

  for (const { id } of [first, second]) await fetch(`${base}/api/games/${id}`, { method: 'DELETE' });
});

test('a failed insert rolls back the whole game', async () => {
  const before = (await listGames(db)).length;
  await assert.rejects(insertGame(db, { ...valid, teamA: ['Zed', 'zed'], teamB: ['Yan'] }));
  assert.equal((await listGames(db)).length, before);
  assert.ok(!(await listPlayers(db)).some((p) => p.name === 'Zed'), 'new players are rolled back too');
});

test('adds a player without a game', async () => {
  const add = (name) =>
    fetch(`${base}/api/players`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });

  const res = await add('  Rookie   Smith ');
  assert.equal(res.status, 201);
  assert.equal((await res.json()).name, 'Rookie Smith');

  const again = await (await add('rookie smith')).json();
  assert.equal(again.name, 'Rookie Smith', 'keeps the first spelling');

  const players = await (await fetch(`${base}/api/players`)).json();
  assert.equal(players.filter((p) => p.name === 'Rookie Smith').length, 1);

  assert.equal((await add('')).status, 400);
  assert.equal((await add('x'.repeat(31))).status, 400);
});

test('accepts the Vercel rewrite path', async () => {
  const res = await fetch(`${base}/api/handler?path=config`);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).modes.length > 0);
});
