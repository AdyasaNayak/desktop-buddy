# Desktop Buddy

A small always-on-top desktop companion for Windows. It keeps you company
while you work, nudges you to drink water, tracks work sessions, and shows the
reminders you set from its menu.

## Requirements

- Node.js 22.18 or newer (the test suite loads the TypeScript reminder
  helpers directly)
- npm

## Run it locally

```bash
npm ci
npm run desktop
```

`npm run desktop` starts the Vite dev server and opens the Electron window. To
preview only the renderer in a browser, run `npm run dev` and open
<http://localhost:5173>. In browser mode reminders fall back to the browser
Notification API, or an alert when notification permission is not granted.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the renderer |
| `npm run desktop` | Vite plus the Electron app |
| `npm start` | Electron against an existing `dist/` build |
| `npm run build` | Type-check and build the renderer into `dist/` |
| `npm run dist` | Build the Windows installer into `release/` |
| `npm test` | Node test suite under `tests/` |
| `npm run lint` | Oxlint |

## Reminders and quitting

Reminders are saved in the app's local IndexedDB, so quitting does not delete
them. Their timers, however, are `setTimeout`s in the Electron main process,
and a desktop app cannot run code while it is closed.

- Keep Desktop Buddy running for reminders to fire at their scheduled time.
  Use **Hide buddy** (or the tray icon) to get it off the screen without
  quitting. To quit completely, choose **Quit** in the buddy's menu or the
  tray menu.
- If the system tray is unavailable and Desktop Buddy cannot show a
  notification explaining how to bring the buddy back, it stays on screen
  instead of hiding with no way to restore it.
- When you reopen the app after one or more reminder times have passed, the
  overdue reminders arrive as **one combined notification** (for example,
  "3 reminders came due while I was closed") instead of a burst of separate
  notifications. They are then marked as handled and will not fire again.
  Future reminders are rescheduled.
- Choosing **Start with Windows** during setup keeps the buddy running after a
  reboot, so future reminders can still fire.

The scheduling and catch-up logic lives in `electron/main.cjs` and
`src/reminders.ts`.

## Work sessions and quitting

A running work timer is saved locally. If Desktop Buddy quits or crashes while
a timer is running, reopening it resumes that timer from its last heartbeat.
Time spent with the app closed is paused, not added to the session, and the
Work mode panel says when a timer was resumed after a restart. If an older
version left duplicate timers open, the most recent one resumes and the extras
are closed into the work log.

## Project layout

- `electron/` — Electron main process, preload bridge, and timer helpers
- `src/` — React renderer: the pet, menus, reminders, water breaks, work log
- `tests/` — Node tests for timer, click-through, and reminder logic
- `website/` — separate landing-page project (see `website/README.md`)

## Landing page

```bash
cd website
npm ci
npm run dev
```
