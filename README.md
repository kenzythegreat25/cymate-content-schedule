# Content Studio — Cymate

A premium social media content workspace. Same data model as a content tracker, but designed as its own product — not an Airtable clone.

- **Board** (default) — Kanban by status: Idea → Drafting → Scheduled → Posted → Archived
- **Calendar** — month grid with posts color-coded by status
- **List** — refined data view with title, status, platform stack, performance

Data persists in your browser's `localStorage` — no backend, no database, no login. Trade-off: data is per-browser (a different machine or incognito tab won't see your records).

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

- Click **New post** (top right) to create a record. A right-side drawer opens for editing all fields.
- On the Board, click a card to edit; click the status pill on a card to move it between columns.
- On the Calendar, hover a day cell to reveal a `+` for creating a post on that date.
- On the List, click any row to open the drawer; hover to reveal the delete icon.
- Filter by platform from the left sidebar.
- The empty state has a **Load examples** button to seed 5 sample posts.

## Deploy to GitHub + Vercel

The CLIs aren't installed on this machine — install them first:

```bash
brew install gh
npm install -g vercel
```

### 1. Push to GitHub

```bash
cd cymate-content-schedule
git init
git add .
git commit -m "Initial commit"

gh auth login                 # interactive — pick GitHub.com + HTTPS
gh repo create cymate-content-schedule --public --source=. --push
```

If you'd rather create the repo in the GitHub UI, do that, then:

```bash
git remote add origin https://github.com/<your-username>/cymate-content-schedule.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Vercel

```bash
vercel login                  # interactive — pick GitHub
vercel                        # follow prompts; accept defaults
vercel --prod                 # promote the preview to production
```

Or use the Vercel dashboard: **Add New → Project → Import Git Repository → cymate-content-schedule → Deploy**. Vercel auto-detects Next.js and needs no config.

## Tech

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- localStorage for persistence (key: `cymate-content-schedule:v1`)

## Customizing

- **Add/remove platforms or statuses** — edit `lib/types.ts`, update `PLATFORMS` / `STATUSES` and their style maps.
- **Connect a real backend later** — replace `lib/storage.ts` with API calls (Vercel Postgres, Supabase, or your existing Airtable via REST API). The rest of the app stays the same.
