import { useEffect, useState } from "react";
import { db, type Reminder } from "../storage/db";
import {
  missedReminderNotice,
  nextReminderTime,
  planRemindersAtLaunch,
  reminderTextError,
  selectExpiredFiredReminders,
  toReminderRepeat,
  type MissedReminderNotice,
  type ReminderDraft,
} from "../lib/reminders";

/**
 * Owns the saved reminders: restores their timers at launch (folding any
 * that came due while the app was closed into one catch-up notification),
 * marks them fired, schedules the next run of repeating ones, and cleans up
 * old fired rows. Timers live in the Electron main process; in a plain
 * browser a 30-second poll stands in for them.
 */
export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    let active = true;
    // Fired reminders are visible for a while, then removed so the database
    // does not keep growing. Deleting them here also cleans up rows left by
    // older versions that did not record when a reminder fired.
    const readReminders = async () => {
      const saved = await db.reminders.orderBy("remindAt").toArray();
      const expired = selectExpiredFiredReminders(saved, Date.now());
      const expiredIds = expired
        .map((reminder) => reminder.id)
        .filter((id): id is number => id !== undefined);
      if (expiredIds.length === 0) return saved;

      try {
        await db.reminders.bulkDelete(expiredIds);
      } catch (error) {
        console.error("Could not clean up fired reminders", error);
        return saved;
      }
      const deleted = new Set(expiredIds);
      return saved.filter(
        (reminder) => reminder.id === undefined || !deleted.has(reminder.id),
      );
    };
    const refreshReminders = async () => {
      const saved = await readReminders();
      if (active) setReminders(saved);
      return saved;
    };
    const scheduleReminder = (reminder: Reminder) => {
      if (reminder.id === undefined) return;
      window.desktopBuddy?.scheduleReminder(
        reminder.id,
        reminder.text,
        reminder.remindAt,
      );
    };

    // A repeating reminder keeps one fired row for history and gets a fresh
    // upcoming row. The transaction re-checks `notified` so a duplicate event
    // cannot add the next occurrence twice.
    const handleMissed = async (missed: Reminder[], handledAt: number) => {
      const handled: Reminder[] = [];
      const nextOccurrences: Reminder[] = [];
      await db.transaction("rw", db.reminders, async () => {
        for (const candidate of missed) {
          if (candidate.id === undefined) continue;
          const reminder = await db.reminders.get(candidate.id);
          if (!reminder || reminder.notified) continue;
          await db.reminders.update(candidate.id, {
            notified: true,
            notifiedAt: handledAt,
          });
          handled.push({ ...reminder, notified: true, notifiedAt: handledAt });

          const nextAt = nextReminderTime(
            reminder.remindAt,
            reminder.repeat,
            handledAt,
          );
          if (nextAt === null) continue;
          const nextDraft: Reminder = {
            text: reminder.text,
            remindAt: nextAt,
            notified: false,
            repeat: toReminderRepeat(reminder.repeat),
          };
          const nextId = await db.reminders.add(nextDraft);
          nextOccurrences.push({ ...nextDraft, id: nextId });
        }
      });
      return { handled, nextOccurrences };
    };

    const markFired = async (id: number, firedAt: number) => {
      let next: Reminder | null = null;
      let changed = false;
      await db.transaction("rw", db.reminders, async () => {
        const reminder = await db.reminders.get(id);
        if (!reminder || reminder.notified) return;
        await db.reminders.update(id, { notified: true, notifiedAt: firedAt });
        changed = true;

        const nextAt = nextReminderTime(
          reminder.remindAt,
          reminder.repeat,
          firedAt,
        );
        if (nextAt === null) return;
        const nextDraft: Reminder = {
          text: reminder.text,
          remindAt: nextAt,
          notified: false,
          repeat: toReminderRepeat(reminder.repeat),
        };
        const nextId = await db.reminders.add(nextDraft);
        next = { ...nextDraft, id: nextId };
      });
      if (next) scheduleReminder(next);
      if (changed) await refreshReminders();
    };

    const startReminders = async () => {
      const saved = await refreshReminders();
      // Compare against the moment the timers are restored, not when the
      // process started: the window may be reloaded or reopened much later.
      // Anything already due is part of the catch-up, never a zero-delay
      // timer that would notify separately.
      const { missed, pending } = planRemindersAtLaunch(saved, Date.now());
      if (missed.length > 0) {
        try {
          // Mark the backlog handled before showing it, so a reload cannot
          // deliver the same missed reminders twice.
          const { handled, nextOccurrences } = await handleMissed(
            missed,
            Date.now(),
          );
          const notice = missedReminderNotice(handled);
          if (notice) announceMissedReminders(notice);
          // A timer can outlive a reload, so clear any that still point at the
          // reminders just consolidated. Otherwise the main process could
          // notify them separately after the catch-up notice.
          for (const reminder of handled) {
            if (reminder.id !== undefined) {
              window.desktopBuddy?.cancelReminder(reminder.id);
            }
          }
          for (const reminder of nextOccurrences) scheduleReminder(reminder);
          if (active) await refreshReminders();
        } catch (error) {
          console.error("Could not catch up on missed reminders", error);
        }
      }
      if (!active) return;
      for (const reminder of pending) scheduleReminder(reminder);
    };
    void startReminders();

    const unsubscribe = window.desktopBuddy?.onReminder((id) => {
      void markFired(id, Date.now()).catch((error) => {
        console.error("Could not mark reminder as fired", error);
      });
    });
    const checkReminders = window.desktopBuddy
      ? undefined
      : window.setInterval(async () => {
          try {
            const due = await db.reminders
              .where("remindAt")
              .belowOrEqual(Date.now())
              .and((reminder) => !reminder.notified)
              .toArray();
            for (const reminder of due) {
              if (reminder.id === undefined) continue;
              if (
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                new Notification("Desktop Buddy reminder", {
                  body: reminder.text,
                });
              } else {
                window.alert(`Reminder: ${reminder.text}`);
              }
              await markFired(reminder.id, Date.now());
            }
          } catch (error) {
            console.error("Could not check reminders", error);
          }
        }, 30000);

    // A long-running app still needs to remove fired reminders even when no
    // new reminder fires; hourly is precise enough for a week-long window.
    const cleanupReminders = window.setInterval(
      () => {
        void refreshReminders().catch((error) => {
          console.error("Could not clean up fired reminders", error);
        });
      },
      60 * 60 * 1000,
    );

    return () => {
      active = false;
      if (checkReminders) window.clearInterval(checkReminders);
      window.clearInterval(cleanupReminders);
      unsubscribe?.();
    };
  }, []);

  const refreshReminderList = async () => {
    setReminders(await db.reminders.orderBy("remindAt").toArray());
  };

  const scheduleSavedReminder = (reminder: Reminder) => {
    if (reminder.id === undefined) return;
    window.desktopBuddy?.scheduleReminder(
      reminder.id,
      reminder.text,
      reminder.remindAt,
    );
  };

  const saveReminder = async (draft: ReminderDraft, id?: number) => {
    try {
      await db.open();
      const text = draft.text.trim();
      const textProblem = reminderTextError(text);
      if (textProblem) throw new Error(textProblem);
      const repeat = toReminderRepeat(draft.repeat);
      let saved: Reminder;
      if (id === undefined) {
        const newId = await db.reminders.add({
          text,
          remindAt: draft.remindAt,
          notified: false,
          repeat,
        });
        saved = {
          id: newId,
          text,
          remindAt: draft.remindAt,
          notified: false,
          repeat,
        };
      } else {
        const existing = await db.reminders.get(id);
        if (!existing) throw new Error("that reminder no longer exists.");
        if (existing.notified) {
          throw new Error(
            "that reminder already fired; edit its next run instead.",
          );
        }
        saved = {
          ...existing,
          text,
          remindAt: draft.remindAt,
          repeat,
          notified: false,
          notifiedAt: undefined,
        };
        await db.reminders.put(saved);
      }

      // scheduleReminder replaces the main-process timer for this id, so an
      // edited time cannot leave the old timer waiting in the background.
      scheduleSavedReminder(saved);
      await refreshReminderList();
      if (
        !window.desktopBuddy &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission().catch(() => undefined);
      }
    } catch (error) {
      console.error("Could not save reminder", error);
      throw error;
    }
  };

  const removeReminder = async (id: number) => {
    try {
      window.desktopBuddy?.cancelReminder(id);
      await db.reminders.delete(id);
      await refreshReminderList();
    } catch (error) {
      console.error("Could not delete reminder", error);
      throw error;
    }
  };

  const snoozeReminder = async (reminder: Reminder) => {
    if (reminder.id === undefined || !reminder.notified) return;
    try {
      // A repeating reminder already has its next occurrence scheduled. Turn
      // the fired row into a one-off so snoozing cannot start a second series.
      const snoozed: Reminder = {
        ...reminder,
        remindAt: Date.now() + 10 * 60 * 1000,
        notified: false,
        notifiedAt: undefined,
        repeat: "none",
      };
      await db.reminders.put(snoozed);
      scheduleSavedReminder(snoozed);
      await refreshReminderList();
    } catch (error) {
      console.error("Could not snooze reminder", error);
      throw error;
    }
  };

  const clearFiredReminders = async () => {
    try {
      const fired = await db.reminders
        .filter((reminder) => reminder.notified)
        .toArray();
      const ids = fired
        .map((reminder) => reminder.id)
        .filter((id): id is number => id !== undefined);
      if (ids.length > 0) await db.reminders.bulkDelete(ids);
      await refreshReminderList();
    } catch (error) {
      console.error("Could not clear fired reminders", error);
      throw error;
    }
  };

  return {
    reminders,
    saveReminder,
    removeReminder,
    snoozeReminder,
    clearFiredReminders,
  };
}

function announceMissedReminders(notice: MissedReminderNotice) {
  if (window.desktopBuddy) {
    window.desktopBuddy.notifyMissedReminders(notice);
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(notice.title, { body: notice.body });
  } else {
    window.alert(`${notice.title}\n\n${notice.body}`);
  }
}
