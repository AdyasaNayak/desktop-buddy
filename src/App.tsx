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
  type PetState,
  type PetType,
} from "./pets";

declare global {
  interface Window {
    desktopBuddy?: {
      getWindowPosition: () => [number, number];
      setWindowMode: (mode: "setup" | "pet") => void;
      moveWindow: (x: number, y: number) => void;
      sleepWindow: (duration: number) => void;
      hideApp: () => Promise<boolean>;
      setClickThrough: (ignore: boolean) => void;
      exitApp: () => void;
      scheduleReminder: (id: number, text: string, remindAt: number) => void;
      cancelReminder: (id: number) => void;
      notifyMissedReminders: (notice: MissedReminderNotice) => void;
      notifyWaterReminder: (notice: WaterNudgeNotice) => void;
      notifyWorkReminder: (notice: { title: string; body: string }) => void;
      onReminder: (callback: (id: number) => void) => () => void;
      onWindowHidden: (callback: () => void) => () => void;
      setLoginItem: (openAtLogin: boolean) => boolean;
      isPackaged: boolean;
    };
  }
}

const SIZE = 160; // draw size - bigger = larger buddy

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef({ drinkLeft: 0, work: false });
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
  const {
    active: activeWork,
    longBreakDue,
    elapsedMs: workElapsedMs,
    acknowledgeLongReminder,
  } = work;
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

  useEffect(() => {
    return () => {
      if (welcomeTimer.current !== null)
        window.clearTimeout(welcomeTimer.current);
    };
  }, []);

  useEffect(() => {
    controlRef.current.work = work.active !== null;
  }, [work.active]);

  // a water nudge takes over the bubble and plays the drinking animation
  useEffect(() => {
    if (!water.prompt) return;
    controlRef.current.drinkLeft = 2600;
  }, [water.prompt]);

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pet = PETS[activePet];

    const images: Record<PetState, HTMLImageElement> = {
      idle: new Image(),
      heart: new Image(),
      drink: new Image(),
      work: new Image(),
    };
    images.idle.src = pet.sheets.idle;
    images.heart.src = pet.sheets.heart;
    images.drink.src = pet.sheets.drink;
    images.work.src = pet.sheets.work;
    // a sheet finishing after an earlier empty paint must invalidate the cache
    images.heart.onload = () => {
      lastPaintKey = "";
    };
    images.drink.onload = () => {
      lastPaintKey = "";
    };
    images.work.onload = () => {
      lastPaintKey = "";
    };

    let groundY = window.innerHeight - SIZE - 10;
    const savedPosition = positionRef.current;
    let x = savedPosition
      ? Math.max(0, Math.min(savedPosition.x, window.innerWidth - SIZE))
      : window.innerWidth / 2 - SIZE / 2;
    let y = savedPosition ? Math.min(savedPosition.y, groundY) : groundY;
    petBoxRef.current = { x, y, width: SIZE, height: SIZE };
    let targetX = x;
    let isWalking = false;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let dragMoved = false;
    let stateTimer = 0;
    let frame = 0;
    let lastAnimTime = 0;
    let prevTime = 0;
    let raf = 0;
    let isHovering = false;
    let lastState: PetState = "idle";
    let lastPaintKey = "";
    let petTimeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      groundY = canvas.height - SIZE - 10;
      y = Math.min(y, groundY);
      lastPaintKey = ""; // resizing clears the canvas, force a repaint
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      isHovering = mx >= x && mx <= x + SIZE && my >= y && my <= y + SIZE;
      canvas.style.cursor = isHovering ? "pointer" : "default";
    };
    const handleMouseLeave = () => {
      isHovering = false;
      canvas.style.cursor = "default";
    };
    const handleDoubleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx >= x && mx <= x + SIZE && my >= y && my <= y + SIZE) {
        console.log("petted 💜");
        y = groundY - 20;
        if (petTimeout) clearTimeout(petTimeout);
        petTimeout = setTimeout(() => (y = groundY), 150);
      }
    };
    const isPetAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      return mx >= x && mx <= x + SIZE && my >= y && my <= y + SIZE;
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (!isPetAt(e.clientX, e.clientY)) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      isDragging = true;
      dragMoved = false;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      isWalking = false;
      stateTimer = 0;
      dragOffsetX = mx - x;
      dragOffsetY = my - y;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;

      if (
        Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY) > 5
      ) {
        dragMoved = true;
      }
      if (!dragMoved) return;

      const nextWindowX = e.screenX - (x + dragOffsetX);
      const nextWindowY = e.screenY - (y + dragOffsetY);
      if (window.desktopBuddy) {
        window.desktopBuddy.moveWindow(nextWindowX, nextWindowY);
      } else {
        const rect = canvas.getBoundingClientRect();
        x = Math.max(
          0,
          Math.min(e.clientX - rect.left - dragOffsetX, canvas.width - SIZE),
        );
        y = Math.max(
          0,
          Math.min(e.clientY - rect.top - dragOffsetY, canvas.height - SIZE),
        );
      }
      e.preventDefault();
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;

      isDragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (!dragMoved) {
        // a stale hide error should not greet the next menu opening
        setHideError("");
        setMenuOpen((open) => !open);
      }
      canvas.style.cursor = isHovering ? "pointer" : "default";
      stateTimer = 0;
    };
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("dblclick", handleDoubleClick);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    const shownState = (): PetState => {
      if (controlRef.current.drinkLeft > 0) return "drink";
      if (controlRef.current.work) return "work";
      if (isHovering) return "heart";
      return "idle";
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const dt = prevTime ? Math.min(time - prevTime, 100) : 16;
      prevTime = time;

      const state = shownState();

      if (state !== lastState) {
        frame = 0;
        lastState = state;
      }
      if (time - lastAnimTime > pet.frameMs[state]) {
        frame = (frame + 1) % pet.frameCount[state];
        lastAnimTime = time;
      }

      if (controlRef.current.drinkLeft > 0) {
        controlRef.current.drinkLeft -= dt;
        if (controlRef.current.drinkLeft <= 0) controlRef.current.drinkLeft = 0;
      }

      stateTimer += dt;
      if (state === "idle" && !isHovering && !isDragging) {
        if (isWalking) {
          const dir = targetX > x ? 1 : -1;
          x += dir * 0.4;
          if (Math.abs(x - targetX) < 2 || stateTimer > 4000) {
            isWalking = false;
            stateTimer = 0;
          }
          x = Math.max(0, Math.min(x, canvas.width - SIZE));
        } else {
          if (stateTimer > 5000 + Math.random() * 4000) {
            isWalking = true;
            stateTimer = 0;
            targetX = Math.random() * (canvas.width - SIZE - 20) + 10;
            if (Math.abs(targetX - x) < 80) {
              isWalking = false;
              stateTimer = 0;
            }
          }
        }
      }

      // safety clamp: never let the buddy go below screen
      y = Math.max(0, Math.min(y, groundY));
      positionRef.current = { x, y };
      const previousBox = petBoxRef.current;
      if (!previousBox || previousBox.x !== x || previousBox.y !== y) {
        petBoxRef.current = { x, y, width: SIZE, height: SIZE };
        // the buddy may have walked under a pointer that is not moving
        refreshClickThrough();
      }

      // repaint only when pixels can actually change - constant repainting
      // of a transparent window keeps the compositor busy and feels laggy
      const paintKey = `${state}:${frame}:${Math.round(x)}:${Math.round(y)}`;
      if (paintKey === lastPaintKey) return;
      lastPaintKey = paintKey;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = images[state];
      if (img.complete) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, frame * 64, 0, 64, 64, x, y, SIZE, SIZE);
      }
    };

    images.idle.onload = () => {
      if (!disposed) raf = requestAnimationFrame(loop);
    };

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      if (petTimeout) clearTimeout(petTimeout);
      cancelAnimationFrame(raf);
      petBoxRef.current = null;
    };
    // re-run when the pet view mounts or the chosen buddy changes;
    // positionRef keeps a switch from teleporting the pet
  }, [petReady, activePet, refreshClickThrough]);

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

  const showBubble = (message: string, ms = 6000) => {
    setWelcome(message);
    if (welcomeTimer.current !== null)
      window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), ms);
  };

  // One break nudge per long session. The acknowledgement is saved with the
  // session so reopening the app does not repeat it for the same stretch.
  useEffect(() => {
    if (!activeWork || !longBreakDue) {
      if (!activeWork) longBreakNotified.current = null;
      return;
    }
    if (longBreakNotified.current === activeWork.id) return;
    longBreakNotified.current = activeWork.id;

    const elapsed = formatDuration(workElapsedMs);
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
  }, [
    activeWork,
    longBreakDue,
    workElapsedMs,
    acknowledgeLongReminder,
  ]);

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
    controlRef.current.drinkLeft = 1600;
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
        window.desktopBuddy.setLoginItem(true);
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

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {(water.prompt || welcome) && (
        <div
          style={{
            position: "absolute",
            // keep a scheduled nudge below an open menu instead of covering it
            top: menuOpen ? 106 : 8,
            left: 8,
            zIndex: 15,
            maxWidth: "calc(100% - 16px)",
            display: "grid",
            justifyItems: "start",
            gap: 6,
          }}
        >
          {water.prompt && (
            <div className="buddy-bubble buddy-bubble--water">
              <div className="buddy-bubble__head">
                <span className="buddy-bubble__tag">water break</span>
                <button
                  type="button"
                  className="buddy-close buddy-bubble__close"
                  aria-label="Dismiss water nudge"
                  title="Dismiss"
                  disabled={waterAction.pending}
                  onClick={() => void dismissWater()}
                >
                  ×
                </button>
              </div>
              <p className="buddy-bubble__text">{water.prompt.message}</p>
              <p className="buddy-bubble__meta">
                {water.prompt.amountMl} ml now · {water.prompt.totalMl} ml today
              </p>
              <div className="buddy-bubble__actions">
                <button
                  type="button"
                  className="buddy-mini-btn"
                  disabled={waterAction.pending}
                  onClick={() => void drankFromPrompt()}
                >
                  drank it
                </button>
                <button
                  type="button"
                  className="buddy-mini-btn"
                  disabled={waterAction.pending}
                  onClick={() => void snoozeWater()}
                >
                  10 min
                </button>
                <button
                  type="button"
                  className="buddy-mini-btn buddy-mini-btn--quiet"
                  disabled={waterAction.pending}
                  onClick={() => void turnOffWater()}
                >
                  stop nudges
                </button>
              </div>
            </div>
          )}
          {/* A failed water action leaves its prompt up, so the message has to
              sit under that bubble instead of replacing it out of sight. */}
          {welcome && <div className="buddy-bubble">{welcome}</div>}
        </div>
      )}

      {work.active && (
        <div
          className={`buddy-timer${work.active.pausedAt !== undefined ? " buddy-timer--paused" : ""}`}
          title={`${work.active.pausedAt !== undefined ? "paused" : "working"} on ${work.active.task}`}
        >
          <span className="buddy-timer__clock">
            {formatClock(work.elapsedMs)}
          </span>
          <span className="buddy-timer__task">
            {work.active.task}
            {work.active.pausedAt !== undefined ? " · paused" : ""}
          </span>
        </div>
      )}

      <div
        style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 10 }}
      >
        {menuOpen && (
          <div className="buddy-menu">
            {hideError && (
              <p className="buddy-menu__error" role="alert">
                {hideError}
              </p>
            )}
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setWaterOpen(true);
                setMenuOpen(false);
              }}
            >
              Drink water
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setWorkOpen(true);
                setMenuOpen(false);
              }}
            >
              {work.active ? "Working…" : "Work mode"}
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setReminderOpen(true);
                setMenuOpen(false);
              }}
            >
              Reminders
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setSleepOpen(true);
                setMenuOpen(false);
              }}
            >
              Sleep
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setProfileError("");
                setRenaming(true);
                setMenuOpen(false);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                setProfileError("");
                setChangingPet(true);
                setMenuOpen(false);
              }}
            >
              Change pet
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              title="Hide in the system tray. Click the tray icon to bring me back."
              onClick={hideBuddy}
            >
              Hide buddy
            </button>
            <button
              type="button"
              className="buddy-menu__button buddy-menu__button--exit"
              title="Quit Desktop Buddy"
              onClick={() => window.desktopBuddy?.exitApp()}
            >
              Quit
            </button>
          </div>
        )}
      </div>

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
                  window.desktopBuddy?.sleepWindow(
                    Number(sleepMinutes) * 60 * 1000,
                  );
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
          elapsedMs={work.elapsedMs}
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
