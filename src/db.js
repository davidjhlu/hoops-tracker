import { createClient } from '@libsql/client';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS games (
    id         INTEGER PRIMARY KEY,
    mode       TEXT NOT NULL,
    played_at  TEXT NOT NULL,
    score_a    INTEGER NOT NULL,
    score_b    INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    team      TEXT NOT NULL CHECK (team IN ('A', 'B')),
    PRIMARY KEY (game_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS courts (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A run is every game on one date, and a run is always at one court, so the court is stored per date.
  CREATE TABLE IF NOT EXISTS run_courts (
    played_at TEXT PRIMARY KEY,
    court_id  INTEGER NOT NULL REFERENCES courts(id)
  );
`;

/** `url` is a local `file:` path, `:memory:`, or a Turso `libsql://` URL. */
export async function openDb({ url, authToken }) {
  const db = createClient({ url, authToken, intMode: 'number' });
  await db.executeMultiple(SCHEMA);
  return db;
}

export async function listPlayers(db) {
  const { rows } = await db.execute('SELECT id, name FROM players ORDER BY name COLLATE NOCASE');
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// Returns games in chronological order (oldest first), which the stats engine relies on.
export async function listGames(db) {
  const [games, links] = await db.batch(
    [
      `SELECT g.id, g.mode, g.played_at AS playedAt, g.score_a AS scoreA, g.score_b AS scoreB,
              c.id AS courtId, c.name AS courtName
       FROM games g
       LEFT JOIN run_courts rc ON rc.played_at = g.played_at
       LEFT JOIN courts c ON c.id = rc.court_id
       ORDER BY g.played_at, g.id`,
      `SELECT gp.game_id AS gameId, gp.team, p.id, p.name
       FROM game_players gp JOIN players p ON p.id = gp.player_id
       ORDER BY p.name COLLATE NOCASE`,
    ],
    'read'
  );

  const byId = new Map();
  for (const g of games.rows) {
    byId.set(g.id, {
      id: g.id, mode: g.mode, playedAt: g.playedAt, scoreA: g.scoreA, scoreB: g.scoreB,
      court: g.courtId == null ? null : { id: g.courtId, name: g.courtName },
      teamA: [], teamB: [],
    });
  }
  for (const r of links.rows) {
    const game = byId.get(r.gameId);
    if (!game) continue;
    (r.team === 'A' ? game.teamA : game.teamB).push({ id: r.id, name: r.name });
  }
  return [...byId.values()];
}

/** Returns the stored player, keeping the existing spelling if the name differs only by case. */
export async function addPlayer(db, name) {
  await db.execute({ sql: 'INSERT INTO players (name) VALUES (?) ON CONFLICT (name) DO NOTHING', args: [name] });
  const { rows } = await db.execute({ sql: 'SELECT id, name FROM players WHERE name = ?', args: [name] });
  return { id: rows[0].id, name: rows[0].name };
}

async function getOrCreatePlayer(tx, name) {
  await tx.execute({ sql: 'INSERT INTO players (name) VALUES (?) ON CONFLICT (name) DO NOTHING', args: [name] });
  const { rows } = await tx.execute({ sql: 'SELECT id FROM players WHERE name = ?', args: [name] });
  return rows[0].id;
}

async function insertLineups(tx, gameId, teamA, teamB) {
  for (const [team, names] of [['A', teamA], ['B', teamB]]) {
    for (const name of names) {
      const playerId = await getOrCreatePlayer(tx, name);
      await tx.execute({
        sql: 'INSERT INTO game_players (game_id, player_id, team) VALUES (?, ?, ?)',
        args: [gameId, playerId, team],
      });
    }
  }
}

export async function listCourts(db) {
  const [courts, runs] = await db.batch(
    [
      'SELECT id, name FROM courts ORDER BY name COLLATE NOCASE',
      'SELECT played_at AS playedAt, court_id AS courtId FROM run_courts',
    ],
    'read'
  );
  return {
    courts: courts.rows.map((r) => ({ id: r.id, name: r.name })),
    runs: Object.fromEntries(runs.rows.map((r) => [r.playedAt, r.courtId])),
  };
}

/** Returns the stored court, keeping the existing spelling if the name differs only by case. */
export async function addCourt(db, name) {
  await db.execute({ sql: 'INSERT INTO courts (name) VALUES (?) ON CONFLICT (name) DO NOTHING', args: [name] });
  const { rows } = await db.execute({ sql: 'SELECT id, name FROM courts WHERE name = ?', args: [name] });
  return { id: rows[0].id, name: rows[0].name };
}

export async function courtExists(db, id) {
  const { rows } = await db.execute({ sql: 'SELECT 1 FROM courts WHERE id = ?', args: [id] });
  return rows.length > 0;
}

/** `courtId` null clears the run's court. Works on a `db` client or an open transaction. */
export async function setRunCourt(client, playedAt, courtId) {
  if (courtId == null) {
    await client.execute({ sql: 'DELETE FROM run_courts WHERE played_at = ?', args: [playedAt] });
    return;
  }
  await client.execute({
    sql: `INSERT INTO run_courts (played_at, court_id) VALUES (?, ?)
          ON CONFLICT (played_at) DO UPDATE SET court_id = excluded.court_id`,
    args: [playedAt, courtId],
  });
}

export async function insertGame(db, { mode, playedAt, scoreA, scoreB, teamA, teamB, courtId }) {
  const tx = await db.transaction('write');
  try {
    const res = await tx.execute({
      sql: 'INSERT INTO games (mode, played_at, score_a, score_b) VALUES (?, ?, ?, ?)',
      args: [mode, playedAt, scoreA, scoreB],
    });
    const gameId = Number(res.lastInsertRowid);
    await insertLineups(tx, gameId, teamA, teamB);
    if (courtId != null) await setRunCourt(tx, playedAt, courtId);
    await tx.commit();
    return gameId;
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

/** Rewrites a game in place, keeping its id so its position among same-date games (and thus streaks) is stable. */
export async function updateGame(db, id, { mode, playedAt, scoreA, scoreB, teamA, teamB, courtId }) {
  const tx = await db.transaction('write');
  try {
    const res = await tx.execute({
      sql: 'UPDATE games SET mode = ?, played_at = ?, score_a = ?, score_b = ? WHERE id = ?',
      args: [mode, playedAt, scoreA, scoreB, id],
    });
    if (res.rowsAffected === 0) {
      await tx.rollback();
      return false;
    }
    await tx.execute({ sql: 'DELETE FROM game_players WHERE game_id = ?', args: [id] });
    await insertLineups(tx, id, teamA, teamB);
    if (courtId != null) await setRunCourt(tx, playedAt, courtId);
    await tx.commit();
    return true;
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

// Foreign keys are off by default per connection, so links are removed explicitly rather than via cascade.
export async function deleteGame(db, id) {
  const [, res] = await db.batch(
    [
      { sql: 'DELETE FROM game_players WHERE game_id = ?', args: [id] },
      { sql: 'DELETE FROM games WHERE id = ?', args: [id] },
    ],
    'write'
  );
  return res.rowsAffected > 0;
}
