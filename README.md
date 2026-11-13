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
- Reminders can be edited or rescheduled from the list, and can be set to
  repeat every day or every week. A repeating reminder schedules its next run
  automatically after it fires, so it never disappears after the first alert.
- A fired reminder can be snoozed for 10 minutes from its **Snooze 10m**
  button. Snoozing a repeating reminder adds a one-off repeat of that run
  rather than changing the series.
- Fired reminders stay in the list for a week so you can see what came due,
  then they are removed automatically. **Clear fired reminders** in the
  reminder panel removes them immediately.
- Choosing **Start with Windows** during setup keeps the buddy running after a
  reboot, so future reminders can still fire.

The scheduling and catch-up logic lives in `electron/main.cjs` and
`src/reminders.ts`.

## Water breaks and hiding

Open **Drink water** to choose the amount for each break, a custom amount or
interval, and a daily goal. The **Today** tab shows how much you have logged
against that goal, and **History** lists each glass by day. **Undo** on Today
removes the latest glass logged today; **Undo** on a History row removes that
glass, whichever day it belongs to. Water settings are saved with the
schedule, so custom values, the goal, and quiet hours survive a restart.
History keeps the most recent 200 glasses, plus the rest of the oldest day
shown, so a busy day can add a few more before older days drop off.

Quiet hours pause nudges between the times you choose, including overnight
windows. A nudge that would land inside quiet hours waits until they end
instead. Nudges are checked while Desktop Buddy is running, whether the buddy
is on screen or hidden in the tray. A hidden window cannot show the nudge
bubble, so the due nudge arrives as a desktop notification instead. Clicking
the notification brings the buddy back so the glass can still be logged. A
visible buddy keeps showing the nudge in its own bubble instead of a
notification, so the two never appear at the same time. Dismissing the nudge
with the × in its bubble closes it without logging a glass. A nudge that was
already due comes back at the usual interval, while dismissing a previewed
nudge leaves the saved schedule as it was.

## Work sessions and quitting

A running work timer is saved locally. If Desktop Buddy quits or crashes while
a timer is running, reopening it resumes that timer from its last checkpoint.
Time spent with the app closed is paused, not added to the session, and the
Work mode panel notes that paused time is not counted. If an older version
left duplicate timers open, a timer that already counted work resumes (the
most recent activity wins if several did) and the other counted sessions are
closed into the work log; empty duplicates are discarded. Moving the system
clock backwards does not shrink a running timer, and time already counted
stays in the session.

Use **Pause timer** for a break without stopping the session; **Resume timer**
continues from the same elapsed time. After 90 minutes of running work, the
buddy shows a one-time reminder to take a short break. Log rows can be edited
(task, start time, or minutes worked) or deleted, and **Export CSV** downloads
the whole saved work log.

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
