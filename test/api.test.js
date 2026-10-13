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

test('a failed insert rolls back the whole game', async () => {
  const before = (await listGames(db)).length;
  await assert.rejects(insertGame(db, { ...valid, teamA: ['Zed', 'zed'], teamB: ['Yan'] }));
  assert.equal((await listGames(db)).length, before);
  assert.ok(!(await listPlayers(db)).some((p) => p.name === 'Zed'), 'new players are rolled back too');
});

test('accepts the Vercel rewrite path', async () => {
  const res = await fetch(`${base}/api/handler?path=config`);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).modes.length > 0);
});
