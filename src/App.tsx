import { useEffect, useRef, useState } from "react";
import { db, type Profile, type Reminder } from "./db";
import catIdle from "./assets/cat.png";
import catHeart from "./assets/catheart.png";
import catDrink from "./assets/catdrink.png";
import catWork from "./assets/catwork.png";
import dogIdle from "./assets/dog.png";
import dogHeart from "./assets/dogheart.png";
import dogDrink from "./assets/dogdrink.png";
import dogWork from "./assets/dogwork.png";
import starIdle from "./assets/star.png";
import starHeart from "./assets/starheart.png";
import starDrink from "./assets/stardrink.png";
import starWork from "./assets/starwork.png";
import hamsterIdle from "./assets/hamster.png";
import hamsterHeart from "./assets/hamsterheart.png";
import hamsterDrink from "./assets/hamsterdrink.png";
import hamsterWork from "./assets/hamsterwork.png";
import jellyIdle from "./assets/jelly.png";
import jellyHeart from "./assets/jellyheart.png";
import jellyDrink from "./assets/jellydrink.png";
import jellyWork from "./assets/jellywork.png";

declare global {
  interface Window {
    desktopBuddy?: {
      getWindowPosition: () => [number, number];
      moveWindow: (x: number, y: number) => void;
      sleepWindow: (duration: number) => void;
      exitApp: () => void;
      scheduleReminder: (id: number, text: string, remindAt: number) => void;
      cancelReminder: (id: number) => void;
      onReminder: (callback: (id: number) => void) => () => void;
      setLoginItem: (openAtLogin: boolean) => boolean;
      isPackaged: boolean;
      notify: (title: string, body: string) => void;
    };
  }
}

type PetState = "idle" | "heart" | "drink" | "work";
type PetType = "cat" | "dog" | "star" | "hamster" | "jelly";

// every buddy shares the same sheet layout: idle 3 frames, heart/drink 2, work 3
const PET_SHEETS: Record<PetType, Record<PetState, string>> = {
  cat: { idle: catIdle, heart: catHeart, drink: catDrink, work: catWork },
  dog: { idle: dogIdle, heart: dogHeart, drink: dogDrink, work: dogWork },
  star: { idle: starIdle, heart: starHeart, drink: starDrink, work: starWork },
  hamster: { idle: hamsterIdle, heart: hamsterHeart, drink: hamsterDrink, work: hamsterWork },
  jelly: { idle: jellyIdle, heart: jellyHeart, drink: jellyDrink, work: jellyWork },
};

const PET_TYPES = Object.keys(PET_SHEETS) as PetType[];

const PET_GREETING: Record<PetType, string> = {
  cat: "meow",
  dog: "woof",
  star: "twinkle",
  hamster: "squeak",
  jelly: "blub",
};

const PET_DEFAULT_NAME: Record<PetType, string> = {
  cat: "Mochi",
  dog: "Biscuit",
  star: "Twinkle",
  hamster: "Peanut",
  jelly: "Bloopy",
};

// ---------- water intake ----------
const WATER_NUDGE_MS = 45 * 60 * 1000;
const DEFAULT_WATER_GOAL_ML = 2000;
const WATER_CHEERS = [
  "sip sip hooray! 💧",
  "glug glug~ that's the sound of you being awesome!",
  "splish splash! every sip makes your fur shinier!",
  "hydration level: rising! keep it up! ⬆",
  "yaaay! your body just did a little happy dance!",
  "one small sip for you, one giant leap for feeling great!",
  "*paw five!* that's the way! 💪",
];
const WATER_GOAL_CHEERS = [
  "GOAL SMASHED! 🏆 i'm doing a happy dance right now!",
  "you did it! fully hydrated and fabulous! 💙",
  "daily goal complete! i'm telling EVERYONE in the treehouse!",
];
const WATER_NUDGES = [
  "psst… it's been 45 minutes. sip sip time! 💧",
  "drip drip… your water glass misses you!",
  "hydration check! grab your glass — i'll wait! 🥤",
  "even cacti drink water. just saying~",
  "a wild glass of water appears! what will you do?",
  "quick! a sip for you, a smile for me! 😊",
  "your buddy refilled your glass. no excuses now!",
];

function randomOf<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function todayKey(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toPetType(value: string): PetType {
  return (PET_TYPES as string[]).includes(value) ? (value as PetType) : "cat";
}

const SIZE = 160; // draw size - bigger = larger cat

const FRAME_COUNT: Record<PetState, number> = {
  idle: 3,
  heart: 2,
  drink: 2,
  work: 3,
};
const FRAME_MS: Record<PetState, number> = {
  idle: 500,
  heart: 400,
  drink: 600,
  work: 300,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef({ drinkLeft: 0, work: false });
  const [workOn, setWorkOn] = useState(false);
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
  const [petName, setPetName] = useState("");
  const [yourName, setYourName] = useState("");
  const [petType, setPetType] = useState<PetType>("cat");
  const [startWithWindows, setStartWithWindows] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  // water log
  const [waterOpen, setWaterOpen] = useState(false);
  const [waterMl, setWaterMl] = useState(0);
  const [waterLast, setWaterLast] = useState<{ id: number; amount: number } | null>(null);
  const [goalInput, setGoalInput] = useState(String(DEFAULT_WATER_GOAL_ML));
  const speechTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waterAnchorRef = useRef<number | undefined>(undefined);
  const showSetup = profile === null;
  // true once a profile exists (or is created), no form is shown, and the pet view can mount
  const petReady = profile !== undefined && !showSetup && !renaming;
  const waterGoal = profile?.waterGoalMl ?? DEFAULT_WATER_GOAL_ML;
  const waterNudgeOn = profile?.waterNudge ?? true;

  // one speech bubble at a time; new lines replace the old one
  const say = (line: string, ms = 6000) => {
    setSpeech(line);
    if (speechTimeout.current) clearTimeout(speechTimeout.current);
    speechTimeout.current = setTimeout(() => setSpeech(null), ms);
  };

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        await db.open();
        const saved = await db.profiles.get("me");
        if (active) setProfile(saved ?? null);
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
    let active = true;
    const loadReminders = async () => {
      const saved = await db.reminders.orderBy("remindAt").toArray();
      if (active) {
        setReminders(saved);
        for (const reminder of saved) {
          if (reminder.id !== undefined && !reminder.notified) {
            window.desktopBuddy?.scheduleReminder(reminder.id, reminder.text, reminder.remindAt);
          }
        }
      }
    };
    void loadReminders();

    const unsubscribe = window.desktopBuddy?.onReminder((id) => {
      void db.reminders.update(id, { notified: true }).then(() => loadReminders());
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
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Desktop Buddy reminder", { body: reminder.text });
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

  // today's water entries (date-keyed, so the log resets at midnight)
  const readTodayWater = async () => {
    const entries = await db.water.where("date").equals(todayKey()).sortBy("ts");
    return {
      total: entries.reduce((sum, entry) => sum + entry.amount, 0),
      last: entries.at(-1),
    };
  };

  const applyTodayWater = (today: Awaited<ReturnType<typeof readTodayWater>>) => {
    setWaterMl(today.total);
    setWaterLast(today.last?.id !== undefined ? { id: today.last.id, amount: today.last.amount } : null);
  };

  // the log resets at midnight: watch the calendar day and refresh on rollover
  const [waterDay, setWaterDay] = useState(() => todayKey());
  useEffect(() => {
    const watchDay = window.setInterval(() => {
      const now = todayKey();
      setWaterDay((day) => (day === now ? day : now));
    }, 30000);
    return () => window.clearInterval(watchDay);
  }, []);

  useEffect(() => {
    const loadWater = async () => {
      applyTodayWater(await readTodayWater());
    };
    void loadWater();
  }, [waterDay]);

  const notify = (title: string, body: string) => {
    if (window.desktopBuddy) {
      window.desktopBuddy.notify(title, body);
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  const logWater = async (amount: number) => {
    try {
      await db.open();
      await db.water.add({ date: todayKey(), amount, ts: Date.now() });
      const before = waterMl;
      applyTodayWater(await readTodayWater());
      waterAnchorRef.current = Date.now(); // a fresh sip also restarts the nudge timer
      controlRef.current.drinkLeft = 2200; // buddy drinks along with you
      say(waterMl + amount >= waterGoal && before < waterGoal ? randomOf(WATER_GOAL_CHEERS) : randomOf(WATER_CHEERS));
    } catch (error) {
      console.error("Could not save water entry", error);
    }
  };

  const undoWater = async () => {
    if (!waterLast) return;
    await db.water.delete(waterLast.id);
    applyTodayWater(await readTodayWater());
  };

  const saveGoal = async () => {
    const goal = Number.parseInt(goalInput, 10);
    if (!Number.isFinite(goal) || goal < 500 || goal > 10000) {
      say("hmm, pick a goal between 500 and 10000 ml! 💧");
      return;
    }
    if (!profile) return;
    const saved = { ...profile, waterGoalMl: goal };
    try {
      await db.profiles.put(saved);
      setProfile(saved);
      say(`goal set to ${goal} ml! we've got this! 💪`);
    } catch (error) {
      console.error("Could not save water goal", error);
    }
  };

  const toggleNudge = async (checked: boolean) => {
    if (!profile) return;
    const saved = { ...profile, waterNudge: checked };
    try {
      await db.profiles.put(saved);
      setProfile(saved);
    } catch (error) {
      console.error("Could not save water nudge setting", error);
    }
    if (checked && !window.desktopBuddy && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
    if (checked) say("okay! i'll remind you every 45 minutes! ⏰💧");
  };

  // gentle water nudges every 45 minutes while the buddy is awake
  useEffect(() => {
    if (!petReady || !waterNudgeOn) return;
    waterAnchorRef.current ??= Date.now();
    const tick = window.setInterval(() => {
      if (Date.now() - (waterAnchorRef.current ?? 0) < WATER_NUDGE_MS) return;
      waterAnchorRef.current = Date.now();
      const line = randomOf(WATER_NUDGES);
      say(line, 8000);
      controlRef.current.drinkLeft = 2500;
      notify("Desktop Buddy", line);
    }, 30000);
    return () => window.clearInterval(tick);
  }, [petReady, waterNudgeOn]);

  useEffect(() => {
    // the canvas only exists once a profile is loaded/created
    if (!petReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const images: Record<PetState, HTMLImageElement> = {
      idle: new Image(),
      heart: new Image(),
      drink: new Image(),
      work: new Image(),
    };
    const sheets = PET_SHEETS[toPetType(profile.petType)];
    images.idle.src = sheets.idle;
    images.heart.src = sheets.heart;
    images.drink.src = sheets.drink;
    images.work.src = sheets.work;
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
    let x = window.innerWidth / 2 - SIZE / 2;
    let y = groundY;
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

      if (Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY) > 5) {
        dragMoved = true;
      }
      if (!dragMoved) return;

      const nextWindowX = e.screenX - (x + dragOffsetX);
      const nextWindowY = e.screenY - (y + dragOffsetY);
      if (window.desktopBuddy) {
        window.desktopBuddy.moveWindow(nextWindowX, nextWindowY);
      } else {
        const rect = canvas.getBoundingClientRect();
        x = Math.max(0, Math.min(e.clientX - rect.left - dragOffsetX, canvas.width - SIZE));
        y = Math.max(0, Math.min(e.clientY - rect.top - dragOffsetY, canvas.height - SIZE));
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
      if (time - lastAnimTime > FRAME_MS[state]) {
        frame = (frame + 1) % FRAME_COUNT[state];
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

      // safety clamp: never let cat go below screen
      y = Math.max(0, Math.min(y, groundY));

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
    // re-run when the pet view mounts (profile load / first-run setup handoff)
  }, [petReady, profile?.petType]);

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
      const id = await db.reminders.add({ text: reminderText.trim(), remindAt, notified: false });
      const savedReminder = { id, text: reminderText.trim(), remindAt };
      window.desktopBuddy?.scheduleReminder(savedReminder.id, savedReminder.text, savedReminder.remindAt);
      setReminders(await db.reminders.orderBy("remindAt").toArray());
      if (!window.desktopBuddy && "Notification" in window && Notification.permission === "default") {
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

  const finishSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved: Profile = {
      ...(profile ?? {}),
      id: "me",
      petName: petName.trim() || PET_DEFAULT_NAME[petType],
      yourName: yourName.trim(),
      petType,
    };
    try {
      await db.profiles.put(saved);
    } catch (error) {
      console.error("Could not save profile", error);
    }
    // login-item registration is a first-run choice only; renaming never
    // silently re-applies (or ignores) the startup checkbox
    if (!renaming && window.desktopBuddy?.isPackaged && startWithWindows) {
      window.desktopBuddy.setLoginItem(true);
    }
    setProfile(saved);
    setRenaming(false);
    const greeting = PET_GREETING[petType];
    say(
      saved.yourName
        ? `${greeting}! i'm ${saved.petName}. hi, ${saved.yourName}!`
        : `${greeting}! i'm ${saved.petName}. i live here now.`,
    );
  };

  if (profile === undefined) return null;

  if (profile === null || renaming) {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "grid", placeItems: "center" }}>
        <form style={onboardingStyle} onSubmit={(event) => void finishSetup(event)}>
          <strong>{renaming ? "✏️ let's tweak me" : "🐾 hi! i'm your new buddy"}</strong>
          <PetTypePicker value={petType} onChange={setPetType} />
          <label>
            name me
            <input
              autoFocus
              placeholder={`e.g. ${PET_DEFAULT_NAME[petType]}`}
              maxLength={20}
              value={petName}
              onChange={(event) => setPetName(event.target.value)}
            />
          </label>
          <label>
            and what should i call you?
            <input
              placeholder="your name (optional)"
              maxLength={20}
              value={yourName}
              onChange={(event) => setYourName(event.target.value)}
            />
          </label>
          {window.desktopBuddy?.isPackaged && !renaming && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={startWithWindows}
                onChange={(event) => setStartWithWindows(event.target.checked)}
              />
              start me when my computer turns on
            </label>
          )}
          <button type="submit">{renaming ? "save ✨" : "let's go ✨"}</button>
          {renaming && (
            <button type="button" onClick={() => setRenaming(false)}>
              cancel
            </button>
          )}
        </form>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {speech && (
        <div style={{ position: "absolute", top: 8, left: 8, maxWidth: 250 }}>
          <div style={welcomeStyle}>{speech}</div>
        </div>
      )}

      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
        {menuOpen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              minWidth: 230,
              padding: 8,
              borderRadius: 12,
              background: "rgba(255, 248, 231, 0.96)",
              boxShadow: "0 4px 16px rgba(50, 35, 20, 0.2)",
            }}
          >
            <button onClick={() => {
              setGoalInput(String(profile.waterGoalMl ?? DEFAULT_WATER_GOAL_ML));
              setWaterOpen(true);
              setMenuOpen(false);
            }}>💧 Water log</button>
            <button
              onClick={() => {
                controlRef.current.work = !controlRef.current.work;
                setWorkOn((prev) => !prev);
                setMenuOpen(false);
              }}
            >
              {workOn ? "💻 Stop work" : "💻 Work mode"}
            </button>
            <button onClick={() => {
              setReminderOpen(true);
              setMenuOpen(false);
            }}>🔔 Reminders</button>
            <button onClick={() => {
              setSleepOpen(true);
              setMenuOpen(false);
            }}>🌙 Sleep</button>
            <button onClick={() => {
              setPetName(profile.petName);
              setYourName(profile.yourName);
              setPetType(toPetType(profile.petType));
              setRenaming(true);
              setMenuOpen(false);
            }}>✏️ Rename</button>
            <button onClick={() => window.desktopBuddy?.exitApp()}>✕ Exit</button>
            <button onClick={() => setMenuOpen(false)}>× Close</button>
          </div>
        )}
      </div>

      {reminderOpen && (
        <div style={dialogStyle}>
          <div style={panelStyle}>
            <strong>New reminder</strong>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addReminder();
              }}
              style={{ display: "grid", gap: 8 }}
            >
              <input
                autoFocus
                placeholder="Reminder text"
                value={reminderText}
                onChange={(event) => setReminderText(event.target.value)}
              />
              <input
                type="datetime-local"
                min={minReminderAt}
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
              {reminderError && <small style={{ color: "#a33" }}>{reminderError}</small>}
              <div style={buttonRowStyle}>
                <button type="submit">Add</button>
                <button type="button" onClick={() => setReminderOpen(false)}>Cancel</button>
              </div>
            </form>
            {reminders.length > 0 && (
              <div style={{ maxHeight: 70, overflowY: "auto", fontSize: 12 }}>
                {reminders.map((reminder) => (
                  <div key={reminder.id} style={reminderStyle}>
                    <span>{reminder.text}</span>
                    <button onClick={() => void removeReminder(reminder.id!)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {waterOpen && (() => {
        const pct = Math.min(100, Math.round((waterMl / waterGoal) * 100));
        const glasses = Math.round(waterMl / 250);
        const goalGlasses = Math.max(1, Math.round(waterGoal / 250));
        const status =
          waterMl === 0
            ? "not a single sip yet! your glass is feeling lonely…"
            : pct < 50
              ? "every sip counts — keep going! 💧"
              : pct < 100
                ? "so close! i believe in you!"
                : "goal smashed! i'm SO proud of you! 🏆";
        return (
          <div style={dialogStyle}>
            <div style={{ ...panelStyle, width: 252, boxSizing: "border-box", maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}>
              <strong>💧 water log</strong>
              <small style={waterStatusStyle}>{status}</small>
              <div style={waterTrackStyle} role="progressbar" aria-valuenow={waterMl} aria-valuemin={0} aria-valuemax={waterGoal} aria-label="today's water intake">
                <div style={{ ...waterFillStyle, width: `${pct}%` }} />
              </div>
              <small style={{ textAlign: "center" }}>
                {waterMl} / {waterGoal} ml · {glasses} of {goalGlasses} glasses today
              </small>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => void logWater(100)}>+100 ml</button>
                <button onClick={() => void logWater(250)}>+250 ml</button>
                <button onClick={() => void logWater(500)}>+500 ml</button>
              </div>
              {waterLast && (
                <button onClick={() => void undoWater()}>↩ undo last sip</button>
              )}
              <label>
                my daily goal (ml)
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    inputMode="numeric"
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <button type="button" onClick={() => void saveGoal()}>save</button>
                </div>
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={waterNudgeOn}
                  onChange={(event) => void toggleNudge(event.target.checked)}
                />
                nudge me every 45 minutes
              </label>
              <button onClick={() => setWaterOpen(false)}>close</button>
            </div>
          </div>
        );
      })()}

      {sleepOpen && (
        <div style={dialogStyle}>
          <div style={panelStyle}>
            <strong>Put buddy to sleep</strong>
            <label>
              Wake after
              <select value={sleepMinutes} onChange={(event) => setSleepMinutes(event.target.value)}>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </label>
            <div style={buttonRowStyle}>
              <button
                onClick={() => window.desktopBuddy?.sleepWindow(Number(sleepMinutes) * 60 * 1000)}
              >
                Sleep
              </button>
              <button onClick={() => setSleepOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const onboardingStyle = {
  display: "grid",
  gap: 8,
  width: 280,
  padding: 16,
  borderRadius: 14,
  background: "rgba(255, 248, 231, 0.98)",
  boxShadow: "0 5px 20px rgba(50, 35, 20, 0.24)",
  fontSize: 13,
};
const welcomeStyle = {
  padding: "8px 12px",
  borderRadius: 12,
  background: "rgba(255, 248, 231, 0.96)",
  boxShadow: "0 4px 16px rgba(50, 35, 20, 0.2)",
  fontSize: 12,
};
const dialogStyle = {
  position: "absolute" as const,
  inset: 0,
  display: "grid",
  placeItems: "center",
  zIndex: 20,
};
const panelStyle = {
  display: "grid",
  gap: 8,
  width: 220,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255, 248, 231, 0.98)",
  boxShadow: "0 5px 20px rgba(50, 35, 20, 0.24)",
};
const buttonRowStyle = { display: "flex", gap: 6 };
const reminderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "3px 0",
};
const waterStatusStyle = { textAlign: "center" as const, lineHeight: 1.4 };
const waterTrackStyle = {
  height: 12,
  borderRadius: 6,
  background: "#dfe9f6",
  overflow: "hidden" as const,
};
const waterFillStyle = {
  height: "100%",
  borderRadius: 6,
  background: "linear-gradient(180deg, #7db4f0, #4a8fe0)",
  transition: "width 240ms ease",
};

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

// draws frame 0 of a pet's idle sheet, cropped to the sprite, scaled up crisply
function PetSprite({ type, size }: { type: PetType; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.src = PET_SHEETS[type].idle;
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // all buddies live in roughly the same 36x32 window of the 64px frame
      ctx.drawImage(img, 6, 22, 36, 32, 0, 0, canvas.width, canvas.height);
    };
  }, [type]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={Math.round((size * 32) / 36)}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function PetTypePicker({
  value,
  onChange,
}: {
  value: PetType;
  onChange: (type: PetType) => void;
}) {
  return (
    <div role="radiogroup" aria-label="pick your buddy" style={{ display: "flex", gap: 4 }}>
      {PET_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          onClick={() => onChange(type)}
          style={{
            flex: 1,
            display: "grid",
            justifyItems: "center",
            gap: 2,
            padding: "4px 2px",
            fontSize: 11,
            cursor: "pointer",
            border: value === type ? "2px solid #5b7da3" : "2px solid transparent",
            borderRadius: 8,
            background: value === type ? "#eef4fb" : "transparent",
          }}
        >
          <PetSprite type={type} size={34} />
          {type}
        </button>
      ))}
    </div>
  );
}
