import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  db,
  type Profile,
  type Reminder,
  type WaterPlan,
  type WorkSession,
} from "./db";
import { Onboarding, type OnboardingResult } from "./Onboarding";
import { PetPreview } from "./PetPreview";
import { WaterPanel } from "./WaterPanel";
import { WorkPanel } from "./WorkPanel";
import {
  PETS,
  PET_PREVIEW_SIZE,
  PET_TYPES,
  toPetType,
  type PetState,
  type PetType,
} from "./pets";
import {
  formatClock,
  formatDuration,
  formatInterval,
  minutesFromNow,
  nowMs,
  todayKey,
} from "./time";
import { pickWaterMessage } from "./water";

declare global {
  interface Window {
    desktopBuddy?: {
      getWindowPosition: () => [number, number];
      setWindowMode: (mode: "setup" | "pet") => void;
      moveWindow: (x: number, y: number) => void;
      sleepWindow: (duration: number) => void;
      exitApp: () => void;
      scheduleReminder: (id: number, text: string, remindAt: number) => void;
      cancelReminder: (id: number) => void;
      onReminder: (callback: (id: number) => void) => () => void;
      setLoginItem: (openAtLogin: boolean) => boolean;
      isPackaged: boolean;
    };
  }
}

const SIZE = 160; // draw size - bigger = larger buddy

// A running timer heartbeats every 30s. Three missed beats mean the machine
// slept or the renderer froze, so the session stops at the last beat instead
// of counting the gap as work.
const WORK_HEARTBEAT_MS = 30 * 1000;
const WORK_GAP_MS = 3 * WORK_HEARTBEAT_MS;
// A reload or quick restart should keep the timer going; longer downtime is
// saved at the last heartbeat instead of counting time the app was closed.
const WORK_RESUME_GRACE_MS = 60 * 1000;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef({ drinkLeft: 0, work: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderText, setReminderText] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [minReminderAt] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 60000)),
  );
  const [sleepMinutes, setSleepMinutes] = useState("15");
  // undefined = still loading, null = first run (show setup)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [changingPet, setChangingPet] = useState(false);
  const [waterPlan, setWaterPlan] = useState<WaterPlan | null>(null);
  const [todayGlasses, setTodayGlasses] = useState(0);
  const [waterOpen, setWaterOpen] = useState(false);
  const [waterError, setWaterError] = useState("");
  const [waterBreak, setWaterBreak] = useState<string | null>(null);
  const [workOpen, setWorkOpen] = useState(false);
  const [workSession, setWorkSession] = useState<WorkSession | null>(null);
  const [workLog, setWorkLog] = useState<WorkSession[]>([]);
  const [workError, setWorkError] = useState("");
  const [now, setNow] = useState(() => nowMs());
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const welcomeTimer = useRef<number | null>(null);
  const waterBreakTimer = useRef<number | null>(null);
  const waterDayRef = useRef(todayKey());
  const workHeartbeatRef = useRef(0);
  const showSetup = profile === null;
  // true once a profile exists (or is created), no form is shown, and the pet view can mount
  const petReady = profile !== undefined && !showSetup && !renaming;
  const activePet = profile ? toPetType(profile.petType) : "cat";
  const windowMode =
    profile === undefined ? null : showSetup || renaming ? "setup" : "pet";

  const say = (text: string, ms = 6000) => {
    setWelcome(text);
    if (welcomeTimer.current !== null)
      window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), ms);
  };

  /** Persist the end of a focus session and take the pet out of work mode. */
  const finishWork = async (session: WorkSession, endedAt: number) => {
    if (!session.id) return false;
    try {
      await db.workSessions.update(session.id, {
        endedAt,
        lastActiveAt: endedAt,
      });
    } catch (error) {
      console.error("Could not save the work session", error);
      return false;
    }

    setWorkLog((current) =>
      current.map((item) =>
        item.id === session.id
          ? { ...item, endedAt, lastActiveAt: endedAt }
          : item,
      ),
    );
    setWorkSession(null);
    controlRef.current.work = false;
    setWorkError("");
    setWorkOpen(false);
    workHeartbeatRef.current = 0;
    return true;
  };

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
    return () => {
      if (welcomeTimer.current !== null)
        window.clearTimeout(welcomeTimer.current);
      if (waterBreakTimer.current !== null)
        window.clearTimeout(waterBreakTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadWater = async () => {
      try {
        await db.open();
        const [savedPlan, entries] = await Promise.all([
          db.waterPlan.get("me"),
          db.water.where("date").equals(todayKey()).toArray(),
        ]);
        if (!active) return;
        setTodayGlasses(
          entries.reduce((total, entry) => total + entry.amount, 0),
        );
        if (!savedPlan) {
          setWaterPlan(null);
          return;
        }
        if (savedPlan.enabled && savedPlan.nextReminderAt <= nowMs()) {
          // don't ambush someone the moment the app opens after a long break
          const next = {
            ...savedPlan,
            nextReminderAt: minutesFromNow(savedPlan.intervalMinutes),
          };
          setWaterPlan(next);
          try {
            await db.waterPlan.put(next);
          } catch (error) {
            console.error("Could not reschedule water reminder", error);
          }
        } else {
          setWaterPlan(savedPlan);
        }
      } catch (error) {
        console.error("Could not load water plan", error);
        if (active) setWaterPlan(null);
      }
    };
    void loadWater();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // a daily glass counter has to start over when the date rolls over,
    // even if the app has been sitting open all night
    const timer = window.setInterval(() => {
      const key = todayKey();
      if (key === waterDayRef.current) return;
      waterDayRef.current = key;
      void db.water
        .where("date")
        .equals(key)
        .toArray()
        .then((entries) =>
          setTodayGlasses(
            entries.reduce((total, entry) => total + entry.amount, 0),
          ),
        )
        .catch((error) => console.error("Could not refresh water log", error));
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!petReady || !waterPlan?.enabled) return;

    const fire = async () => {
      const next = {
        ...waterPlan,
        nextReminderAt: minutesFromNow(waterPlan.intervalMinutes),
      };
      setWaterPlan(next);
      setMenuOpen(false);
      setWelcome(null);
      if (welcomeTimer.current !== null) {
        window.clearTimeout(welcomeTimer.current);
        welcomeTimer.current = null;
      }
      setWaterBreak(pickWaterMessage());
      if (waterBreakTimer.current !== null)
        window.clearTimeout(waterBreakTimer.current);
      waterBreakTimer.current = window.setTimeout(
        () => setWaterBreak(null),
        30000,
      );
      controlRef.current.drinkLeft = 3000;
      try {
        await db.waterPlan.put(next);
      } catch (error) {
        console.error("Could not save next water reminder", error);
      }
    };

    const timer = window.setInterval(() => {
      if (nowMs() >= waterPlan.nextReminderAt) void fire();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [petReady, waterPlan]);

  useEffect(() => {
    let active = true;
    const loadWork = async () => {
      try {
        await db.open();
        const sessions = await db.workSessions.orderBy("startedAt").toArray();
        if (!active) return;

        const openSessions = sessions.filter(
          (session) => session.endedAt === undefined,
        );
        const latest = openSessions[openSessions.length - 1];
        const lastSeen = latest
          ? (latest.lastActiveAt ?? latest.startedAt)
          : 0;

        if (latest && nowMs() - lastSeen < WORK_RESUME_GRACE_MS) {
          workHeartbeatRef.current = lastSeen;
          setWorkSession(latest);
          controlRef.current.work = true;
          setNow(nowMs());
          setWorkLog(sessions);
          return;
        }

        if (openSessions.length > 0) {
          // the app was closed for a while: end the session at its last
          // heartbeat, not hours later when the app happened to reopen
          for (const session of openSessions) {
            if (session.id === undefined) continue;
            const endedAt = Math.max(
              session.startedAt,
              session.lastActiveAt ?? session.startedAt,
            );
            try {
              await db.workSessions.update(session.id, { endedAt });
            } catch (error) {
              console.error("Could not save interrupted work session", error);
            }
          }
          if (!active) return;
          setWorkLog(await db.workSessions.orderBy("startedAt").toArray());
          return;
        }

        setWorkLog(sessions);
      } catch (error) {
        console.error("Could not load work log", error);
      }
    };
    void loadWork();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!workSession?.id) return;
    const id = workSession.id;
    const timer = window.setInterval(() => {
      const current = nowMs();
      // don't erase a suspend gap; the watchdog below will close the session
      if (current - workHeartbeatRef.current > WORK_GAP_MS) return;
      workHeartbeatRef.current = current;
      void db.workSessions
        .update(id, { lastActiveAt: current })
        .catch((error) =>
          console.error("Could not update work heartbeat", error),
        );
    }, WORK_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [workSession?.id]);

  useEffect(() => {
    if (!workSession) return;
    const timer = window.setInterval(() => {
      const current = nowMs();
      if (current - workHeartbeatRef.current <= WORK_GAP_MS) {
        setNow(current);
        return;
      }

      // the machine slept or the renderer was frozen: end at the last beat
      const endedAt = Math.max(
        workSession.startedAt,
        workHeartbeatRef.current,
      );
      workHeartbeatRef.current = current;
      void finishWork(workSession, endedAt).then((saved) => {
        if (!saved) return;
        const duration = endedAt - workSession.startedAt;
        say(
          `saved ${duration < 60000 ? "under a minute" : formatDuration(duration)} on "${workSession.task}". i paused the timer while you were away.`,
          8000,
        );
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [workSession]);

  useEffect(() => {
    let active = true;
    const loadReminders = async () => {
      const saved = await db.reminders.orderBy("remindAt").toArray();
      if (active) {
        setReminders(saved);
        for (const reminder of saved) {
          if (reminder.id !== undefined && !reminder.notified) {
            window.desktopBuddy?.scheduleReminder(
              reminder.id,
              reminder.text,
              reminder.remindAt,
            );
          }
        }
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
      if (!dragMoved) setMenuOpen((open) => !open);
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
    };
    // re-run when the pet view mounts or the chosen buddy changes;
    // positionRef keeps a switch from teleporting the pet
  }, [petReady, activePet]);

  const addReminder = async () => {
    const remindAt = new Date(reminderAt).getTime();
    if (!reminderText.trim()) {
      setReminderError("Enter a reminder message.");
      return;
    }
    if (!Number.isFinite(remindAt) || remindAt <= Date.now()) {
      setReminderError("Choose a future date and time.");
      return;
    }
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
  };

  const removeReminder = async (id: number) => {
    window.desktopBuddy?.cancelReminder(id);
    await db.reminders.delete(id);
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  };

  const dismissWaterBreak = () => {
    setWaterBreak(null);
    if (waterBreakTimer.current !== null) {
      window.clearTimeout(waterBreakTimer.current);
      waterBreakTimer.current = null;
    }
  };

  const saveWaterPlan = async (
    glassesPerDay: number,
    intervalMinutes: number,
    enabled: boolean,
  ) => {
    const next: WaterPlan = {
      id: "me",
      glassesPerDay,
      intervalMinutes,
      enabled,
      nextReminderAt: enabled ? minutesFromNow(intervalMinutes) : 0,
    };
    try {
      await db.open();
      await db.waterPlan.put(next);
      setWaterPlan(next);
      setWaterError("");
      setWaterOpen(false);
      dismissWaterBreak();
      if (enabled) controlRef.current.drinkLeft = 1600;
      say(
        enabled
          ? `okay! i'll nudge you every ${formatInterval(intervalMinutes)} toward ${glassesPerDay} glasses a day.`
          : "water reminders paused. i'll wait.",
        8000,
      );
    } catch (error) {
      console.error("Could not save water plan", error);
      const message = error instanceof Error ? error.message : String(error);
      setWaterError(`Could not save your water plan: ${message}`);
    }
  };

  const logGlass = async () => {
    const goal = waterPlan?.glassesPerDay ?? 8;
    try {
      await db.open();
      await db.water.add({ date: todayKey(), amount: 1, ts: nowMs() });
    } catch (error) {
      console.error("Could not log a glass of water", error);
      const message = error instanceof Error ? error.message : String(error);
      setWaterError(`Could not log your glass: ${message}`);
      return;
    }

    setTodayGlasses((current) => current + 1);
    controlRef.current.drinkLeft = 1600;
    setWaterError("");

    if (waterPlan?.enabled) {
      const next = {
        ...waterPlan,
        nextReminderAt: minutesFromNow(waterPlan.intervalMinutes),
      };
      setWaterPlan(next);
      try {
        await db.waterPlan.put(next);
      } catch (error) {
        console.error("Could not reset the water reminder", error);
      }
    }

    dismissWaterBreak();
    if (!waterOpen)
      say(`glug glug! ${todayGlasses + 1} of ${goal} glasses today.`);
  };

  const startWork = async (task: string) => {
    try {
      await db.open();
      const startedAt = nowMs();
      const session: WorkSession = {
        task,
        startedAt,
        lastActiveAt: startedAt,
      };
      const id = await db.workSessions.add(session);
      const saved = { ...session, id };
      workHeartbeatRef.current = startedAt;
      setWorkSession(saved);
      setWorkLog((current) => [...current, saved]);
      controlRef.current.work = true;
      setNow(nowMs());
      setWorkError("");
      setWorkOpen(false);
    } catch (error) {
      console.error("Could not start the work timer", error);
      const message = error instanceof Error ? error.message : String(error);
      setWorkError(`Could not start the timer: ${message}`);
    }
  };

  const stopWork = async () => {
    const session = workSession;
    if (!session?.id) return;

    const endedAt = nowMs();
    if (!(await finishWork(session, endedAt))) {
      setWorkError("Could not save this session. Try stopping again.");
      return;
    }

    const duration = endedAt - session.startedAt;
    say(
      `saved ${duration < 60000 ? "under a minute" : formatDuration(duration)} on "${session.task}". nice work!`,
      8000,
    );
  };

  const openWater = () => {
    setWaterError("");
    setMenuOpen(false);
    setWaterOpen(true);
  };

  const openWork = () => {
    setWorkError("");
    setMenuOpen(false);
    setWorkOpen(true);
  };

  const announce = (pet: PetType, name: string, humanName: string) => {
    const greeting = PETS[pet].greeting;
    say(
      humanName
        ? `${greeting} i'm ${name}. hi, ${humanName}! click me for my menu.`
        : `${greeting} i'm ${name}. i live here now. click me for my menu.`,
    );
  };

  const saveProfile = async (result: OnboardingResult) => {
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
    }
    // login-item registration is a first-run choice only; renaming never
    // silently re-applies (or ignores) the startup checkbox
    if (result.startWithWindows && window.desktopBuddy?.isPackaged) {
      window.desktopBuddy.setLoginItem(true);
    }
    setProfile(saved);
    setRenaming(false);
    announce(saved.petType, saved.petName, saved.yourName);
  };

  const changePet = async (nextPet: PetType) => {
    if (!profile) return;
    const next: Profile = { ...profile, petType: nextPet };
    try {
      await db.profiles.put(next);
    } catch (error) {
      console.error("Could not save pet choice", error);
    }
    setProfile(next);
    setChangingPet(false);
    setMenuOpen(false);
    announce(nextPet, next.petName, next.yourName);
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
        onCancel={() => setRenaming(false)}
        onQuit={quitApp}
      />
    );
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

      <div className="buddy-overlay">
        {waterBreak ? (
          <div className="buddy-bubble buddy-bubble--water" aria-live="polite">
            <p className="buddy-bubble__text">{waterBreak}</p>
            <div className="buddy-bubble__footer">
              <p className="buddy-bubble__meta">
                {todayGlasses} of {waterPlan?.glassesPerDay ?? 8} glasses
                today
              </p>
              <div className="buddy-bubble__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--compact"
                  onClick={() => void logGlass()}
                >
                  Drank one
                </button>
                <button
                  type="button"
                  className="btn btn--compact"
                  onClick={dismissWaterBreak}
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        ) : (
          welcome && <div className="buddy-bubble">{welcome}</div>
        )}

        {workSession && (
          <button
            type="button"
            className="work-pill"
            onClick={openWork}
            title={`Working on ${workSession.task}`}
            aria-label={`Open work timer for ${workSession.task}`}
          >
            <span className="work-pill__clock">
              {formatClock(now - workSession.startedAt)}
            </span>
            <span className="work-pill__task">{workSession.task}</span>
          </button>
        )}
      </div>

      <div
        style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 10 }}
      >
        {menuOpen && (
          <div className="buddy-menu">
            <button
              type="button"
              className="buddy-menu__button"
              onClick={openWater}
            >
              Drink water
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={openWork}
            >
              {workSession ? "Work (on)" : "Work mode"}
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
                setChangingPet(true);
                setMenuOpen(false);
              }}
            >
              Change pet
            </button>
            <button
              type="button"
              className="buddy-menu__button buddy-menu__button--exit"
              onClick={() => window.desktopBuddy?.exitApp()}
            >
              Exit
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => setMenuOpen(false)}
            >
              Close
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
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
              {reminderError && (
                <p className="buddy-panel__error">{reminderError}</p>
              )}
              <div className="buddy-panel__row">
                <button className="btn btn--primary" type="submit">
                  Add reminder
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
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="reminder-row">
                    <span>{reminder.text}</span>
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
                onClick={() =>
                  window.desktopBuddy?.sleepWindow(
                    Number(sleepMinutes) * 60 * 1000,
                  )
                }
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
        <div className="buddy-dialog">
          <WaterPanel
            plan={waterPlan}
            todayGlasses={todayGlasses}
            error={waterError}
            onSave={(glassesPerDay, intervalMinutes, enabled) =>
              void saveWaterPlan(glassesPerDay, intervalMinutes, enabled)
            }
            onLogGlass={() => void logGlass()}
            onClose={() => setWaterOpen(false)}
          />
        </div>
      )}

      {workOpen && (
        <div className="buddy-dialog">
          <WorkPanel
            session={workSession}
            sessions={workLog}
            now={now}
            error={workError}
            onStart={(task) => void startWork(task)}
            onStop={() => void stopWork()}
            onClose={() => setWorkOpen(false)}
          />
        </div>
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
                  onClick={() => void changePet(id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => setChangingPet(false)}
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
  onClick,
}: {
  pet: PetType;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pet-option"
      aria-pressed={selected}
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

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}
