import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, lazyDb } from './handler.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, '..', 'data');
const PORT = Number(process.env.PORT) || 3000;

if (!process.env.TURSO_DATABASE_URL) {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.TURSO_DATABASE_URL = `file:${path.join(DATA_DIR, 'hoops.db')}`;
}

createServer(lazyDb()).listen(PORT, () => {
  console.log(`Hoops tracker running at http://localhost:${PORT}`);
});
