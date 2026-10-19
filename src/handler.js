import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openDb, listGames, listPlayers, addPlayer, insertGame, updateGame, deleteGame,
  listCourts, addCourt, courtExists, setRunCourt,
} from './db.js';
import { computeStats } from './stats.js';
import { MODES, MODE_IDS } from './modes.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, '..', 'web', 'dist');
const MAX_BODY = 10_000;
const MAX_NAME = 30;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function cleanTeam(value, label) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be a list of names`);
  const names = value.map(normalizeName).filter(Boolean);
  if (!names.length) throw new HttpError(400, `${label} needs at least one player`);
  for (const n of names) checkNameLength(n);
  return names;
}

const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

function checkNameLength(name) {
  if (name.length > MAX_NAME) throw new HttpError(400, `Name too long: ${name.slice(0, 40)}`);
}

function validatePlayerName(body) {
  const name = normalizeName(body.name);
  if (!name) throw new HttpError(400, 'Name is required');
  checkNameLength(name);
  return name;
}

const MAX_COURT_NAME = 40;

function validateCourtName(body) {
  const name = normalizeName(body.name);
  if (!name) throw new HttpError(400, 'Court name is required');
  if (name.length > MAX_COURT_NAME) throw new HttpError(400, `Keep court names to ${MAX_COURT_NAME} characters`);
  return name;
}

function validateCourtId(value) {
  if (value == null) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Unknown court');
  return id;
}

function validateDate(value) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new HttpError(400, 'Date must be YYYY-MM-DD');
  }
  return date;
}

// Foreign keys aren't enforced on these connections, so a missing court would otherwise be saved silently.
async function requireCourt(db, courtId) {
  if (courtId != null && !(await courtExists(db, courtId))) throw new HttpError(400, 'Unknown court');
}

function validateGame(body) {
  const mode = String(body.mode ?? '');
  if (!MODE_IDS.has(mode)) throw new HttpError(400, 'Unknown game mode');

  const playedAt = validateDate(body.playedAt);

  const scoreA = Number(body.scoreA);
  const scoreB = Number(body.scoreB);
  for (const s of [scoreA, scoreB]) {
    if (!Number.isInteger(s) || s < 0 || s > 50) throw new HttpError(400, 'Scores must be whole numbers, max 50, min 0');
  }
  if (scoreA === scoreB) throw new HttpError(400, 'Games cannot end in a tie');

  const teamA = cleanTeam(body.teamA, 'Team A');
  const teamB = cleanTeam(body.teamB, 'Team B');
  const seen = new Set();
  for (const n of [...teamA, ...teamB]) {
    const key = n.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, `${n} is listed more than once`);
    seen.add(key);
  }

  return { mode, playedAt, scoreA, scoreB, teamA, teamB, courtId: validateCourtId(body.courtId) };
}

/** `court` is a court id, or `none` for runs that have no court yet. */
function filterGames(games, params) {
  const mode = params.get('mode');
  const player = Number(params.get('player'));
  const court = params.get('court');
  return games.filter(
    (g) =>
      (!mode || mode === 'all' || g.mode === mode) &&
      (!player || [...g.teamA, ...g.teamB].some((p) => p.id === player)) &&
      (!court || (court === 'none' ? g.court === null : g.court?.id === Number(court)))
  );
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found');
  try {
    const data = await readFile(file);
    const headers = { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
    if (rel.startsWith('assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    if (pathname === '/') throw new HttpError(404, 'Frontend not built. Run npm run build.');
    throw new HttpError(404, 'Not found');
  }
}

export function createHandler(getDb) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { searchParams } = url;
    // On Vercel, /api/* is rewritten to the single function with the original path in ?path=.
    const pathname = url.pathname === '/api/handler' ? `/api/${searchParams.get('path') ?? ''}` : url.pathname;
    try {
      if (req.method === 'GET' && pathname === '/api/config') {
        return sendJson(res, 200, { modes: MODES });
      }
      if (pathname.startsWith('/api/')) {
        const db = await getDb();
        if (req.method === 'GET' && pathname === '/api/players') {
          return sendJson(res, 200, await listPlayers(db));
        }
        if (req.method === 'POST' && pathname === '/api/players') {
          const name = validatePlayerName(await readJson(req));
          return sendJson(res, 201, await addPlayer(db, name));
        }
        if (req.method === 'GET' && pathname === '/api/games') {
          const games = filterGames(await listGames(db), searchParams).reverse();
          return sendJson(res, 200, games);
        }
        if (req.method === 'GET' && pathname === '/api/courts') {
          return sendJson(res, 200, await listCourts(db));
        }
        if (req.method === 'POST' && pathname === '/api/courts') {
          const name = validateCourtName(await readJson(req));
          return sendJson(res, 201, await addCourt(db, name));
        }
        const run = pathname.match(/^\/api\/runs\/([^/]+)\/court$/);
        if (req.method === 'PUT' && run) {
          const playedAt = validateDate(decodeURIComponent(run[1]));
          const courtId = validateCourtId((await readJson(req)).courtId);
          await requireCourt(db, courtId);
          await setRunCourt(db, playedAt, courtId);
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === 'POST' && pathname === '/api/games') {
          const game = validateGame(await readJson(req));
          await requireCourt(db, game.courtId);
          const id = await insertGame(db, game);
          return sendJson(res, 201, { id });
        }
        const one = pathname.match(/^\/api\/games\/(\d+)$/);
        if (req.method === 'PUT' && one) {
          const game = validateGame(await readJson(req));
          await requireCourt(db, game.courtId);
          if (!(await updateGame(db, Number(one[1]), game))) throw new HttpError(404, 'Game not found');
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === 'DELETE' && one) {
          if (!(await deleteGame(db, Number(one[1])))) throw new HttpError(404, 'Game not found');
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === 'GET' && pathname === '/api/stats') {
          const minGames = Math.max(0, Number(searchParams.get('minGames')) || 0);
          const modeGames = filterGames(await listGames(db), new URLSearchParams({ mode: searchParams.get('mode') || '' }));
          const court = searchParams.get('court');
          if (!court) return sendJson(res, 200, computeStats(modeGames, { minGames }));
          // Records follow the court filter, but Elo keeps rating every game in the mode.
          const courtStats = computeStats(filterGames(modeGames, new URLSearchParams({ court })), { minGames });
          const elo = new Map(computeStats(modeGames).leaderboard.map((p) => [p.id, p]));
          for (const p of courtStats.leaderboard) {
            p.elo = elo.get(p.id).elo;
            p.eloProvisional = elo.get(p.id).eloProvisional;
          }
          return sendJson(res, 200, courtStats);
        }
        throw new HttpError(404, 'Not found');
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      await serveStatic(req, res, pathname);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Something went wrong' : err.message });
    }
  };
}

export function createServer(getDb) {
  return http.createServer(createHandler(getDb));
}

/** Opens the database once, on first use, and retries if that first attempt failed. */
export function lazyDb() {
  let pending;
  return () => {
    pending ??= openDb({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }).catch(
      (err) => {
        pending = undefined;
        throw err;
      }
    );
    return pending;
  };
}
