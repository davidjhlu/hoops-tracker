import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, listGames, listPlayers, insertGame, deleteGame } from './db.js';
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
  const names = value.map((n) => String(n).trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!names.length) throw new HttpError(400, `${label} needs at least one player`);
  for (const n of names) {
    if (n.length > MAX_NAME) throw new HttpError(400, `Name too long: ${n.slice(0, 40)}`);
  }
  return names;
}

function validateGame(body) {
  const mode = String(body.mode ?? '');
  if (!MODE_IDS.has(mode)) throw new HttpError(400, 'Unknown game mode');

  const playedAt = String(body.playedAt ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt) || Number.isNaN(Date.parse(playedAt))) {
    throw new HttpError(400, 'Date must be YYYY-MM-DD');
  }

  const scoreA = Number(body.scoreA);
  const scoreB = Number(body.scoreB);
  for (const s of [scoreA, scoreB]) {
    if (!Number.isInteger(s) || s < 0 || s > 300) throw new HttpError(400, 'Scores must be whole numbers');
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

  return { mode, playedAt, scoreA, scoreB, teamA, teamB };
}

function filterGames(games, params) {
  const mode = params.get('mode');
  const player = Number(params.get('player'));
  return games.filter(
    (g) =>
      (!mode || mode === 'all' || g.mode === mode) &&
      (!player || [...g.teamA, ...g.teamB].some((p) => p.id === player))
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
        if (req.method === 'GET' && pathname === '/api/games') {
          const games = filterGames(await listGames(db), searchParams).reverse();
          return sendJson(res, 200, games);
        }
        if (req.method === 'POST' && pathname === '/api/games') {
          const game = validateGame(await readJson(req));
          const id = await insertGame(db, game);
          return sendJson(res, 201, { id });
        }
        const del = pathname.match(/^\/api\/games\/(\d+)$/);
        if (req.method === 'DELETE' && del) {
          if (!(await deleteGame(db, Number(del[1])))) throw new HttpError(404, 'Game not found');
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === 'GET' && pathname === '/api/stats') {
          const minGames = Math.max(0, Number(searchParams.get('minGames')) || 0);
          const games = filterGames(await listGames(db), new URLSearchParams({ mode: searchParams.get('mode') || '' }));
          return sendJson(res, 200, computeStats(games, { minGames }));
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
