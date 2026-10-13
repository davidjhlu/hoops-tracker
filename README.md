# Hoops tracker

A game log and leaderboard for pickup basketball runs. Anyone with the link can view stats and log games.

- Node API using SQLite through `@libsql/client`: a local file in development, [Turso](https://turso.tech) in production
- React frontend in `web/`, built with Vite and [Arc UI](https://uiarc.dev) components
- Deploys to Vercel's free plan (`vercel.json`, `api/handler.js`)

## Run it

```bash
npm run build   # installs and builds the frontend into web/dist
npm start       # http://localhost:3000
```

For frontend work, run `npm run dev` (API on port 3000) and `npm run dev:web` (Vite on port 5173, proxies `/api`).

Locally, data lives in `data/hoops.db`. Set `DATA_DIR` to store it elsewhere and `PORT` to change the port. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to use a Turso database instead.

## Stats

Only games are stored (mode, date, teams, score). Every stat is computed from that log, so stats can change without migrating data.

- Win % and record, with a minimum games filter
- Average +/- per game, average margin in wins and losses
- Blowouts: the losing team scored half the winner's points or fewer
- Current and longest win streaks
- Elo: starts at 1000, K=32, team rating is the average of its players. It is calculated within the selected mode, or across all games when no mode is selected. Under 10 games is marked provisional.

Game modes are defined in `src/modes.js`.

## Tests

```bash
npm test
```

## Deploying (free: Vercel + Turso)

1. Create a database at [app.turso.tech](https://app.turso.tech). Copy its URL (`libsql://...`) and create a database token.
2. From this folder, log in and link the project:

   ```bash
   npx vercel login
   npx vercel link
   ```

3. Add the database settings to production:

   ```bash
   npx vercel env add TURSO_DATABASE_URL production
   npx vercel env add TURSO_AUTH_TOKEN production
   ```

4. Deploy:

   ```bash
   npx vercel --prod
   ```

The tables are created automatically on the first request.
