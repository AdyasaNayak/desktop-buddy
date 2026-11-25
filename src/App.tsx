import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { db, type Profile, type Reminder } from "./db";
import { Onboarding, type OnboardingResult } from "./Onboarding";
import { PetPreview } from "./PetPreview";
import { WaterPanel } from "./WaterPanel";
import { WorkPanel } from "./WorkPanel";
import { ReminderPanel } from "./ReminderPanel";
import { formatClock, formatDuration, formatInterval } from "./time";
import {
  missedReminderNotice,
  nextReminderTime,
  planRemindersAtLaunch,
  reminderTextError,
  selectExpiredFiredReminders,
  toReminderRepeat,
  type MissedReminderNotice,
  type ReminderDraft,
} from "./reminders";
import { useWaterReminder } from "./useWaterReminder";
import { useWorkLog } from "./useWorkLog";
import type { WaterNudgeNotice } from "./waterMessages";
import type { WaterSettings } from "./waterOptions";
import { usePendingAction } from "./usePendingAction";
import { useClickThrough } from "./useClickThrough";
import type { Rect } from "./clickThrough";
import {
  PETS,
  PET_PREVIEW_SIZE,
  PET_TYPES,
  toPetType,
  type PetType,
} from "./pets";
import { startPetEngine, type PetEngine, type PetEntrance } from "./petEngine";
import { workElapsedAt, type ActiveWork } from "./useWorkLog";
import { useNow } from "./useNow";
import { PixelIcon } from "./PixelIcon";

declare global {
  interface Window {
    desktopBuddy?: {
      getWindowPosition: () => [number, number];
      getPointerPosition: () => { x: number; y: number; inside: boolean };
      getAlwaysOnTop: () => boolean;
      setAlwaysOnTop: (enabled: boolean) => void;
      onAlwaysOnTopChanged: (
        callback: (enabled: boolean) => void,
      ) => () => void;
      onPointerPosition: (
        callback: (point: { x: number; y: number; inside: boolean }) => void,
      ) => () => void;
      setWindowMode: (mode: "setup" | "pet") => void;
      moveWindow: (x: number, y: number) => void;
      sleepWindow: (duration: number) => void;
      hideApp: () => Promise<boolean>;
      setWorkStatus: (
        status: { task: string; elapsedMs: number; paused: boolean } | null,
      ) => void;
      setClickThrough: (ignore: boolean) => void;
      exitApp: () => void;
      scheduleReminder: (id: number, text: string, remindAt: number) => void;
      cancelReminder: (id: number) => void;
      notifyMissedReminders: (notice: MissedReminderNotice) => void;
      notifyWaterReminder: (notice: WaterNudgeNotice) => void;
      notifyWorkReminder: (notice: { title: string; body: string }) => void;
      onReminder: (callback: (id: number) => void) => () => void;
      onWindowHidden: (callback: () => void) => () => void;
      onWindowWake: (callback: () => void) => () => void;
      onWindowShown: (callback: () => void) => () => void;
      setLoginItem: (openAtLogin: boolean, launchHidden: boolean) => boolean;
      isPackaged: boolean;
    };
  }
}

const SIZE = 160; // draw size - bigger = larger buddy

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PetEngine | null>(null);
  const entranceRef = useRef<PetEntrance>("drop");
  const workingRef = useRef(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(
    () => window.desktopBuddy?.getAlwaysOnTop() ?? true,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [waterOpen, setWaterOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [sleepMinutes, setSleepMinutes] = useState("15");
  // undefined = still loading, null = first run (show setup)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [hideError, setHideError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [changingPet, setChangingPet] = useState(false);
  const waterAction = usePendingAction();
  const profileAction = usePendingAction();
  const petAction = usePendingAction();
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const petBoxRef = useRef<Rect | null>(null);
  const welcomeTimer = useRef<number | null>(null);
  const longBreakNotified = useRef<number | null>(null);
  // true while sleep is the reason a running timer is paused
  const sleepPausedWork = useRef(false);
  const showSetup = profile === null;
  // true once a profile exists (or is created), no form is shown, and the pet view can mount
  const petReady = profile !== undefined && !showSetup && !renaming;
  const activePet = profile ? toPetType(profile.petType) : "cat";
  const water = useWaterReminder(
    profile?.petName ?? "your buddy",
    profile?.yourName ?? "",
    petReady,
  );
  const work = useWorkLog();
  const { active: activeWork, longBreakDue, acknowledgeLongReminder } = work;
  const refreshClickThrough = useClickThrough(petReady, petBoxRef);
  const windowMode =
    profile === undefined ? null : showSetup || renaming ? "setup" : "pet";

  // Hiding the buddy keeps the renderer alive, so menus and dialogs would
  // otherwise be waiting behind the window and pop up again when it wakes.
  const closeOverlays = useCallback(() => {
    setMenuOpen(false);
    setWaterOpen(false);
    setWorkOpen(false);
    setReminderOpen(false);
    setSleepOpen(false);
    setChangingPet(false);
  }, []);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        await db.open();
        const saved = await db.profiles.get("me");
        if (active) {
          setProfile(
            saved ? { ...saved, petType: toPetType(saved.petType) } : null,
          );
        }
      } catch {
        if (active) setProfile(null);
      }
    };
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!windowMode) return;
    window.desktopBuddy?.setWindowMode(windowMode);
  }, [windowMode]);

  useEffect(() => {
    return window.desktopBuddy?.onWindowHidden(closeOverlays);
  }, [closeOverlays]);

  // The tray menu can change this while the buddy menu is closed.
  useEffect(() => {
    return window.desktopBuddy?.onAlwaysOnTopChanged(setAlwaysOnTop);
  }, []);

  useEffect(() => {
    return () => {
      if (welcomeTimer.current !== null)
        window.clearTimeout(welcomeTimer.current);
    };
  }, []);

  useEffect(() => {
    workingRef.current = activeWork !== null;
    engineRef.current?.wake();
  }, [activeWork]);

  // The tray is the only place a hidden buddy can show that a timer is still
  // running, so keep its tooltip in sync with the clock. This pushes from an
  // interval instead of React state so the app does not re-render each second.
  useEffect(() => {
    const bridge = window.desktopBuddy;
    if (!bridge) return;
    if (!activeWork) {
      bridge.setWorkStatus(null);
      return;
    }
    const paused = activeWork.pausedAt !== undefined;
    const send = () =>
      bridge.setWorkStatus({
        task: activeWork.task,
        elapsedMs: workElapsedAt(activeWork, Date.now()),
        paused,
      });
    send();
    if (paused) return;
    const timer = window.setInterval(send, 1000);
    return () => window.clearInterval(timer);
  }, [activeWork]);

  // a water nudge takes over the bubble: the buddy jumps for attention and
  // plays the drinking animation
  useEffect(() => {
    if (!water.prompt) return;
    engineRef.current?.react("alert");
    engineRef.current?.drink(2600);
  }, [water.prompt]);

  // Escape closes the top-most overlay; clicking away from the buddy (the
  // window loses focus) closes the menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sleepOpen || changingPet || waterOpen || workOpen || reminderOpen) {
        setSleepOpen(false);
        setChangingPet(false);
        setWaterOpen(false);
        setWorkOpen(false);
        setReminderOpen(false);
        setProfileError("");
      } else if (menuOpen) {
        setMenuOpen(false);
      }
    };
    const onBlur = () => setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [sleepOpen, changingPet, waterOpen, workOpen, reminderOpen, menuOpen]);

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
    const cleanupReminders = window.setInterval(() => {
      void refreshReminders().catch((error) => {
        console.error("Could not clean up fired reminders", error);
      });
    }, 60 * 60 * 1000);

    return () => {
      active = false;
      if (checkReminders) window.clearInterval(checkReminders);
      window.clearInterval(cleanupReminders);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    // the canvas only exists once a profile is loaded/created
    if (!petReady) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const bridge = window.desktopBuddy;
    const engine = startPetEngine({
      canvas,
      stage,
      pet: PETS[activePet],
      size: SIZE,
      start: positionRef.current,
      entrance: entranceRef.current,
      isWorking: () => workingRef.current,
      onHitBoxChange: (box) => {
        petBoxRef.current = box;
        // the buddy may have walked under a pointer that is not moving
        refreshClickThrough();
      },
      onClick: () => {
        // a stale hide error should not greet the next menu opening
        setHideError("");
        setMenuOpen((open) => !open);
      },
      moveWindow: bridge ? (x, y) => bridge.moveWindow(x, y) : undefined,
    });
    engineRef.current = engine;
    // the first buddy drops in; switching buddies or finishing a rename poofs
    entranceRef.current = "poof";

    return () => {
      // positionRef keeps a pet switch from teleporting the buddy
      positionRef.current = engine.dispose();
      engineRef.current = null;
      petBoxRef.current = null;
    };
  }, [petReady, activePet, refreshClickThrough]);

  // Nothing on the canvas should run while the window is hidden or asleep.
  // Electron reports a hidden window as visible (background throttling is
  // off for the water timers), so listen for the main-process events too.
  useEffect(() => {
    const bridge = window.desktopBuddy;
    const setVisible = (visible: boolean) =>
      engineRef.current?.setVisible(visible);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const offHidden = bridge?.onWindowHidden(() => setVisible(false));
    const offShown = bridge?.onWindowShown(() => setVisible(true));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      offHidden?.();
      offShown?.();
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
          throw new Error("that reminder already fired; edit its next run instead.");
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

  const showBubble = useCallback((message: string, ms = 6000) => {
    setWelcome(message);
    if (welcomeTimer.current !== null)
      window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), ms);
  }, []);

  // Sleep is time off, so a running timer is paused before the buddy hides and
  // starts again when the buddy wakes (on time or early from the tray).
  const resumeWork = work.resume;
  useEffect(() => {
    return window.desktopBuddy?.onWindowWake(() => {
      if (!sleepPausedWork.current) return;
      sleepPausedWork.current = false;
      void resumeWork().catch((error) => {
        console.error("Could not resume the work timer after sleep", error);
        showBubble(
          "could not restart your work timer. open Work mode to resume it.",
        );
      });
    });
  }, [resumeWork, showBubble]);

  // One break nudge per long session. The acknowledgement is saved with the
  // session so reopening the app does not repeat it for the same stretch.
  useEffect(() => {
    if (!activeWork || !longBreakDue) {
      if (!activeWork) longBreakNotified.current = null;
      return;
    }
    if (longBreakNotified.current === activeWork.id) return;
    longBreakNotified.current = activeWork.id;

    const elapsed = formatDuration(workElapsedAt(activeWork, Date.now()));
    showBubble(
      `you've been working on ${activeWork.task} for ${elapsed}. maybe stretch for a minute?`,
      9000,
    );
    announceWorkReminder({
      title: "Desktop Buddy work break",
      body: `${elapsed} on ${activeWork.task}. A short break might help.`,
    });
    void acknowledgeLongReminder().catch((error) => {
      console.error("Could not save the work break reminder", error);
    });
  }, [activeWork, longBreakDue, acknowledgeLongReminder, showBubble]);

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    window.desktopBuddy?.setAlwaysOnTop(next);
  };

  // A failed hide leaves the buddy on screen instead of stranding the app, so
  // say why rather than making the button look broken.
  const hideBuddy = () => {
    const bridge = window.desktopBuddy;
    if (!bridge) return;
    setHideError("");
    const explain = () =>
      setHideError(
        "Could not hide the buddy: the system tray is unavailable. Use Quit to close the app.",
      );
    void bridge.hideApp().then((hidden) => {
      if (!hidden) explain();
    }, explain);
  };

  const putBuddyToSleep = (durationMs: number) => {
    const bridge = window.desktopBuddy;
    if (!bridge) return;

    const running = work.active !== null && work.active.pausedAt === undefined;
    const sleep = async () => {
      if (running) {
        try {
          await work.pause();
        } catch (error) {
          console.error("Could not pause the work timer for sleep", error);
          showBubble("i couldn't pause your work timer, so i stayed awake.");
          return;
        }
      }
      // Only a timer this sleep paused is resumed when the buddy wakes; a
      // timer the user had already paused stays paused.
      sleepPausedWork.current = running;
      bridge.sleepWindow(durationMs);
    };
    void sleep();
  };

  const announce = (pet: PetType, name: string, humanName: string) => {
    const greeting = PETS[pet].greeting;
    showBubble(
      humanName
        ? `${greeting} i'm ${name}. hi, ${humanName}! click me for my menu.`
        : `${greeting} i'm ${name}. i live here now. click me for my menu.`,
    );
  };

  const saveWaterPlan = async (settings: WaterSettings) => {
    await water.savePlan(settings);
    engineRef.current?.drink(1600);
    engineRef.current?.react("happy");
    const quiet = settings.quietHours.enabled
      ? " quiet hours are saved too."
      : "";
    showBubble(
      `water breaks on! ${settings.amountMl} ml every ${formatInterval(settings.intervalMinutes)}. i'll keep you topped up.${quiet}`,
    );
  };

  const stopWaterPlan = async () => {
    await water.stop();
    showBubble("water reminders are off. drink whenever you feel like it.");
  };

  const runWaterAction = (action: () => Promise<void>) =>
    waterAction.run(async () => {
      try {
        await action();
      } catch (error) {
        console.error("Could not update water reminder", error);
        showBubble("could not update your water break. one more try?");
      }
    });

  const drankFromPrompt = () =>
    runWaterAction(async () => {
      const total = await water.drank();
      engineRef.current?.react("happy");
      showBubble(`logged! that's ${total} ml today. proud of you.`);
    });

  const snoozeWater = () =>
    runWaterAction(async () => {
      await water.snooze();
      showBubble("okay, i'll ask again in 10 minutes.");
    });

  const dismissWater = () =>
    runWaterAction(async () => {
      await water.dismiss();
    });

  const turnOffWater = () =>
    runWaterAction(async () => {
      await water.turnOff();
      showBubble("water nudges are off for now.");
    });

  const startWork = async (task: string) => {
    await work.start(task);
    engineRef.current?.react("happy");
    showBubble(`focus mode on: ${task.trim()}. i'll keep time.`, 5000);
  };

  const saveProfile = (result: OnboardingResult) =>
    profileAction.run(async () => {
      setProfileError("");
      const saved: Profile = {
        id: "me",
        petName: result.petName.trim() || "Mochi",
        yourName: result.yourName.trim(),
        petType: result.petType,
      };
      try {
        await db.profiles.put(saved);
      } catch (error) {
        console.error("Could not save profile", error);
        const message = error instanceof Error ? error.message : String(error);
        setProfileError(`Could not save your buddy: ${message}`);
        return;
      }
      // login-item registration is a first-run choice only; renaming never
      // silently re-applies (or ignores) the startup checkbox
      if (result.startWithWindows && window.desktopBuddy?.isPackaged) {
        window.desktopBuddy.setLoginItem(true, result.launchHidden);
      }
      setProfile(saved);
      setRenaming(false);
      announce(saved.petType, saved.petName, saved.yourName);
    });

  const changePet = (nextPet: PetType) => {
    if (!profile) return;
    return petAction.run(async () => {
      setProfileError("");
      const next: Profile = { ...profile, petType: nextPet };
      try {
        await db.profiles.put(next);
      } catch (error) {
        console.error("Could not save pet choice", error);
        const message = error instanceof Error ? error.message : String(error);
        setProfileError(`Could not save your new buddy: ${message}`);
        return;
      }
      setProfile(next);
      setChangingPet(false);
      setMenuOpen(false);
      announce(nextPet, next.petName, next.yourName);
    });
  };

  if (profile === undefined) return null;

  const quitApp = window.desktopBuddy
    ? () => window.desktopBuddy?.exitApp()
    : undefined;

  if (profile === null) {
    return (
      <Onboarding
        mode="welcome"
        initialPet="cat"
        onSave={(result) => void saveProfile(result)}
        onQuit={quitApp}
        saving={profileAction.pending}
        error={profileError}
      />
    );
  }

  if (renaming) {
    return (
      <Onboarding
        mode="rename"
        initialPet={toPetType(profile.petType)}
        initialPetName={profile.petName}
        initialYourName={profile.yourName}
        onSave={(result) => void saveProfile(result)}
        onCancel={() => {
          setProfileError("");
          setRenaming(false);
        }}
        onQuit={quitApp}
        saving={profileAction.pending}
        error={profileError}
      />
    );
  }

  const openPanel = (open: () => void) => {
    open();
    setMenuOpen(false);
  };
  const showBubbles = !menuOpen && (water.prompt || welcome);

  return (
    <div ref={stageRef} className="buddy-stage">
      <canvas ref={canvasRef} className="buddy-canvas" />

      {showBubbles && (
        <div
          className={`buddy-pop buddy-say${water.prompt ? " buddy-say--water" : ""}`}
          role="status"
        >
          {water.prompt ? (
            <>
              <div className="buddy-say__head">
                <span className="buddy-say__tag">
                  <PixelIcon name="water" size={11} /> water break
                </span>
                <span className="buddy-say__meta">
                  {water.prompt.totalMl} ml today
                </span>
                <button
                  type="button"
                  className="buddy-close buddy-say__close"
                  aria-label="Dismiss water nudge"
                  title="Dismiss"
                  disabled={waterAction.pending}
                  onClick={() => void dismissWater()}
                >
                  ×
                </button>
              </div>
              <p className="buddy-say__text">{water.prompt.message}</p>
              {/* A failed water action leaves its prompt up, so its message
                  shows under the nudge instead of replacing it out of sight. */}
              {welcome && <p className="buddy-say__note">{welcome}</p>}
              <div className="buddy-say__actions">
                <button
                  type="button"
                  className="buddy-chip buddy-chip--primary"
                  disabled={waterAction.pending}
                  onClick={() => void drankFromPrompt()}
                >
                  drank {water.prompt.amountMl} ml
                </button>
                <button
                  type="button"
                  className="buddy-chip"
                  disabled={waterAction.pending}
                  onClick={() => void snoozeWater()}
                >
                  in 10 min
                </button>
                <button
                  type="button"
                  className="buddy-chip buddy-chip--quiet"
                  disabled={waterAction.pending}
                  onClick={() => void turnOffWater()}
                >
                  stop nudges
                </button>
              </div>
            </>
          ) : (
            <p className="buddy-say__text">{welcome}</p>
          )}
        </div>
      )}

      {menuOpen && (
        <div className="buddy-pop buddy-menu" role="menu" aria-label={`${profile.petName}'s menu`}>
          {hideError && (
            <p className="buddy-menu__error" role="alert">
              {hideError}
            </p>
          )}
          <div className="buddy-menu__tiles">
            <MenuTile
              icon="water"
              label="Water"
              autoFocus
              onClick={() => openPanel(() => setWaterOpen(true))}
            />
            <MenuTile
              icon="work"
              label={work.active ? "Working" : "Focus"}
              active={work.active !== null}
              onClick={() => openPanel(() => setWorkOpen(true))}
            />
            <MenuTile
              icon="bell"
              label="Reminders"
              onClick={() => openPanel(() => setReminderOpen(true))}
            />
            <MenuTile
              icon="moon"
              label="Sleep"
              onClick={() => openPanel(() => setSleepOpen(true))}
            />
          </div>
          <div className="buddy-menu__more">
            <button
              type="button"
              role="menuitem"
              className="buddy-link"
              onClick={() =>
                openPanel(() => {
                  setProfileError("");
                  setRenaming(true);
                })
              }
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="buddy-link"
              onClick={() =>
                openPanel(() => {
                  setProfileError("");
                  setChangingPet(true);
                })
              }
            >
              Change pet
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              className="buddy-link buddy-link--toggle"
              aria-checked={alwaysOnTop}
              title={
                alwaysOnTop
                  ? "Always on top is on. Turn it off to let full-screen apps and games cover the buddy."
                  : "Always on top is off. Turn it on to keep the buddy above other windows."
              }
              onClick={toggleAlwaysOnTop}
            >
              <span className="buddy-link__dot" aria-hidden="true" />
              On top
            </button>
            <button
              type="button"
              role="menuitem"
              className="buddy-link"
              title="Hide in the system tray. Click the tray icon to bring me back."
              onClick={hideBuddy}
            >
              Hide
            </button>
            <button
              type="button"
              role="menuitem"
              className="buddy-link buddy-link--danger"
              title="Quit Desktop Buddy"
              onClick={() => window.desktopBuddy?.exitApp()}
            >
              Quit
            </button>
          </div>
        </div>
      )}

      {work.active && <WorkTag active={work.active} />}

      {reminderOpen && (
        <ReminderPanel
          reminders={reminders}
          onSave={saveReminder}
          onDelete={removeReminder}
          onSnooze={snoozeReminder}
          onClearFired={clearFiredReminders}
          onClose={() => setReminderOpen(false)}
        />
      )}

      {sleepOpen && (
        <div className="buddy-dialog">
          <div
            className="buddy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sleep-dialog-title"
          >
            <h2 id="sleep-dialog-title" className="buddy-panel__title">
              Put buddy to sleep
            </h2>
            <label className="field">
              <span className="field__label">Wake after</span>
              <select
                className="field__input"
                value={sleepMinutes}
                onChange={(event) => setSleepMinutes(event.target.value)}
              >
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </label>
            <div className="buddy-panel__row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setSleepOpen(false);
                  putBuddyToSleep(Number(sleepMinutes) * 60 * 1000);
                }}
              >
                Sleep
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSleepOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {waterOpen && (
        <WaterPanel
          key={water.plan ? "plan-loaded" : "plan-empty"}
          plan={water.plan}
          todayMl={water.todayMl}
          history={water.history}
          onSave={saveWaterPlan}
          onStop={stopWaterPlan}
          onDrink={water.drank}
          onUndo={water.undoDrink}
          onPreview={water.preview}
          onClose={() => setWaterOpen(false)}
        />
      )}

      {workOpen && (
        <WorkPanel
          active={work.active}
          totals={work.totals}
          recent={work.recent}
          onStart={startWork}
          onStop={work.stop}
          onPause={work.pause}
          onResume={work.resume}
          onEdit={work.editSession}
          onDelete={work.deleteSession}
          onExport={work.exportCsv}
          onClose={() => setWorkOpen(false)}
        />
      )}

      {changingPet && (
        <div className="buddy-dialog">
          <div
            className="buddy-panel buddy-panel--pets"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pet-dialog-title"
          >
            <h2 id="pet-dialog-title" className="buddy-panel__title">
              Who's moving in?
            </h2>
            <div className="pet-picker">
              {PET_TYPES.map((id) => (
                <PetChoice
                  key={id}
                  pet={id}
                  selected={activePet === id}
                  disabled={petAction.pending}
                  onClick={() => void changePet(id)}
                />
              ))}
            </div>
            {profileError && (
              <p className="buddy-panel__error" role="alert">
                {profileError}
              </p>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--block"
              disabled={petAction.pending}
              onClick={() => {
                setProfileError("");
                setChangingPet(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuTile({
  icon,
  label,
  active = false,
  autoFocus = false,
  onClick,
}: {
  icon: "water" | "work" | "bell" | "moon";
  label: string;
  active?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`buddy-tile${active ? " buddy-tile--active" : ""}`}
      autoFocus={autoFocus}
      onClick={onClick}
    >
      <PixelIcon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

/** Name-tag under the buddy's feet; only this tag ticks every second. */
function WorkTag({ active }: { active: ActiveWork }) {
  const paused = active.pausedAt !== undefined;
  const now = useNow(1000, !paused);
  return (
    <div
      className={`buddy-tag${paused ? " buddy-tag--paused" : ""}`}
      title={`${paused ? "paused" : "working"} on ${active.task}`}
    >
      <span className="buddy-tag__dot" aria-hidden="true" />
      <span className="buddy-tag__clock">
        {formatClock(workElapsedAt(active, now))}
      </span>
      <span className="buddy-tag__task">
        {active.task}
        {paused ? " · paused" : ""}
      </span>
    </div>
  );
}

function PetChoice({
  pet,
  selected,
  disabled,
  onClick,
}: {
  pet: PetType;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pet-option"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="pet-option__preview">
        <PetPreview pet={pet} size={PET_PREVIEW_SIZE[pet].card} />
      </span>
      <span>{PETS[pet].label}</span>
      <span className="pet-option__badge" aria-hidden="true">
        with me
      </span>
    </button>
  );
}

function announceWorkReminder(notice: { title: string; body: string }) {
  if (window.desktopBuddy) {
    window.desktopBuddy.notifyWorkReminder(notice);
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(notice.title, { body: notice.body });
  }
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
