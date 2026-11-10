import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { db, type Profile, type Reminder } from "./db";
import { Onboarding, type OnboardingResult } from "./Onboarding";
import { PetPreview } from "./PetPreview";
import { WaterPanel } from "./WaterPanel";
import { WorkPanel } from "./WorkPanel";
import { formatClock, formatInterval, formatWhen, MAX_REMINDER_AHEAD_MS } from "./time";
import {
  missedReminderNotice,
  planRemindersAtLaunch,
  sortRemindersForList,
  type MissedReminderNotice,
} from "./reminders";
import { useWaterReminder } from "./useWaterReminder";
import { useWorkLog } from "./useWorkLog";
import type { WaterNudgeNotice } from "./waterMessages";
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
      onReminder: (callback: (id: number) => void) => () => void;
      onWindowHidden: (callback: () => void) => () => void;
      setLoginItem: (openAtLogin: boolean) => boolean;
      isPackaged: boolean;
      appStartedAt?: number;
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
  const [reminderText, setReminderText] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [minReminderAt] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 60000)),
  );
  const [maxReminderAt] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + MAX_REMINDER_AHEAD_MS)),
  );
  const [sleepMinutes, setSleepMinutes] = useState("15");
  // undefined = still loading, null = first run (show setup)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [hideError, setHideError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [changingPet, setChangingPet] = useState(false);
  const waterAction = usePendingAction();
  const reminderAction = usePendingAction();
  const profileAction = usePendingAction();
  const petAction = usePendingAction();
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const petBoxRef = useRef<Rect | null>(null);
  const welcomeTimer = useRef<number | null>(null);
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
    // Anything un-notified and due before this run was missed while the app
    // was closed; timers only exist while the app is running. The main process
    // supplies its start time so a renderer reload keeps the same boundary.
    const launchedAt = window.desktopBuddy?.appStartedAt ?? Date.now();
    const loadReminders = async () => {
      const saved = await db.reminders.orderBy("remindAt").toArray();
      if (!active) return;
      setReminders(saved);

      const { missed, pending } = planRemindersAtLaunch(saved, launchedAt);
      if (missed.length > 0) {
        try {
          // Mark the backlog handled before showing it, so a reload cannot
          // deliver the same missed reminders twice.
          await db.reminders.bulkPut(
            missed.map((reminder) => ({ ...reminder, notified: true })),
          );
          const notice = missedReminderNotice(missed);
          if (notice) announceMissedReminders(notice);
          if (!active) return;
          setReminders(await db.reminders.orderBy("remindAt").toArray());
        } catch (error) {
          console.error("Could not catch up on missed reminders", error);
        }
      }
      if (!active) return;

      for (const reminder of pending) {
        if (reminder.id === undefined) continue;
        window.desktopBuddy?.scheduleReminder(
          reminder.id,
          reminder.text,
          reminder.remindAt,
        );
      }
    };
    void loadReminders();

    const unsubscribe = window.desktopBuddy?.onReminder((id) => {
      void db.reminders
        .update(id, { notified: true })
        .then(() => loadReminders());
    });
    const checkReminders = window.desktopBuddy
      ? undefined
      : window.setInterval(async () => {
          const due = await db.reminders
            .where("remindAt")
            .belowOrEqual(Date.now())
            .and((reminder) => !reminder.notified)
            .toArray();
          for (const reminder of due) {
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
            await db.reminders.update(reminder.id!, { notified: true });
          }
          if (due.length > 0) void loadReminders();
        }, 30000);

    return () => {
      active = false;
      if (checkReminders) window.clearInterval(checkReminders);
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

  const addReminder = () => {
    const remindAt = new Date(reminderAt).getTime();
    if (!reminderText.trim()) {
      setReminderError("Enter a reminder message.");
      return;
    }
    if (!Number.isFinite(remindAt) || remindAt <= Date.now()) {
      setReminderError("Choose a future date and time.");
      return;
    }
    if (remindAt > Date.now() + MAX_REMINDER_AHEAD_MS) {
      setReminderError("Choose a date within a year from now.");
      return;
    }
    return reminderAction.run(async () => {
      setReminderError("");
      try {
        await db.open();
        const id = await db.reminders.add({
          text: reminderText.trim(),
          remindAt,
          notified: false,
        });
        const savedReminder = { id, text: reminderText.trim(), remindAt };
        window.desktopBuddy?.scheduleReminder(
          savedReminder.id,
          savedReminder.text,
          savedReminder.remindAt,
        );
        setReminders(await db.reminders.orderBy("remindAt").toArray());
        if (
          !window.desktopBuddy &&
          "Notification" in window &&
          Notification.permission === "default"
        ) {
          void Notification.requestPermission().catch(() => undefined);
        }
        setReminderText("");
        setReminderAt("");
        setReminderError("");
        setReminderOpen(false);
      } catch (error) {
        console.error("Could not save reminder", error);
        const message = error instanceof Error ? error.message : String(error);
        setReminderError(`Could not save reminder: ${message}`);
      }
    });
  };

  const removeReminder = async (id: number) => {
    window.desktopBuddy?.cancelReminder(id);
    await db.reminders.delete(id);
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  };

  const showBubble = (message: string, ms = 6000) => {
    setWelcome(message);
    if (welcomeTimer.current !== null)
      window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), ms);
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

  const announce = (pet: PetType, name: string, humanName: string) => {
    const greeting = PETS[pet].greeting;
    showBubble(
      humanName
        ? `${greeting} i'm ${name}. hi, ${humanName}! click me for my menu.`
        : `${greeting} i'm ${name}. i live here now. click me for my menu.`,
    );
  };

  const saveWaterPlan = async (amountMl: number, intervalMinutes: number) => {
    await water.savePlan(amountMl, intervalMinutes);
    controlRef.current.drinkLeft = 1600;
    showBubble(
      `water breaks on! ${amountMl} ml every ${formatInterval(intervalMinutes)}. i'll keep you topped up.`,
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
              <span className="buddy-bubble__tag">water break</span>
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
          className="buddy-timer"
          title={`working on ${work.active.task}`}
        >
          <span className="buddy-timer__clock">
            {formatClock(work.elapsedMs)}
          </span>
          <span className="buddy-timer__task">{work.active.task}</span>
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
        <div className="buddy-dialog">
          <div
            className="buddy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-dialog-title"
          >
            <h2 id="reminder-dialog-title" className="buddy-panel__title">
              New reminder
            </h2>
            <form
              className="buddy-panel__form"
              onSubmit={(event) => {
                event.preventDefault();
                void addReminder();
              }}
            >
              <input
                className="field__input"
                autoFocus
                aria-label="Reminder text"
                placeholder="Remind me to…"
                value={reminderText}
                onChange={(event) => setReminderText(event.target.value)}
              />
              <input
                className="field__input"
                type="datetime-local"
                aria-label="Reminder time"
                min={minReminderAt}
                max={maxReminderAt}
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
              <p className="buddy-panel__hint">
                Reminders only fire while Desktop Buddy is running. If I&apos;m
                closed, missed ones arrive together next time you open me.
              </p>
              {reminderError && (
                <p className="buddy-panel__error">{reminderError}</p>
              )}
              <div className="buddy-panel__row">
                <button className="btn btn--primary" type="submit" disabled={reminderAction.pending}>
                  {reminderAction.pending ? "Adding…" : "Add reminder"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setReminderOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
            {reminders.length > 0 && (
              <div className="reminder-list">
                {sortRemindersForList(reminders).map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`reminder-row${reminder.notified ? " reminder-row--fired" : ""}`}
                  >
                    <span className="reminder-row__body">
                      <span className="reminder-row__text">
                        {reminder.text}
                      </span>
                      <span className="reminder-row__meta">
                        {reminder.notified ? "fired" : "scheduled"}{" "}
                        {formatWhen(reminder.remindAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="reminder-row__delete"
                      aria-label={`Delete reminder: ${reminder.text}`}
                      onClick={() => void removeReminder(reminder.id!)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
          onSave={saveWaterPlan}
          onStop={stopWaterPlan}
          onDrink={water.drank}
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

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}
