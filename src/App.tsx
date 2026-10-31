import { useEffect, useRef, useState } from "react";
import "./App.css";
import { db, type Profile, type Reminder } from "./db";
import { Onboarding, type OnboardingResult } from "./Onboarding";
import { PetPreview } from "./PetPreview";
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
  const [renaming, setRenaming] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [changingPet, setChangingPet] = useState(false);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const welcomeTimer = useRef<number | null>(null);
  const showSetup = profile === null;
  // true once a profile exists (or is created), no form is shown, and the pet view can mount
  const petReady = profile !== undefined && !showSetup && !renaming;
  const activePet = profile ? toPetType(profile.petType) : "cat";
  const windowMode =
    profile === undefined ? null : showSetup || renaming ? "setup" : "pet";

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

  const announce = (pet: PetType, name: string, humanName: string) => {
    const greeting = PETS[pet].greeting;
    setWelcome(
      humanName
        ? `${greeting} i'm ${name}. hi, ${humanName}! click me for my menu.`
        : `${greeting} i'm ${name}. i live here now. click me for my menu.`,
    );
    if (welcomeTimer.current !== null)
      window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), 6000);
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

  if (profile === null || renaming) {
    if (!renaming && choosingPet) {
      return (
        <div style={centerStyle}>
          <form
            style={onboardingStyle}
            onSubmit={(event) => {
              event.preventDefault();
              setChoosingPet(false);
            }}
          >
            <strong>🐾 who's moving in?</strong>
            <div style={{ display: "flex", gap: 8 }}>
              {PET_TYPES.map((id) => (
                <PetChoice
                  key={id}
                  pet={id}
                  selected={petType === id}
                  onClick={() => setPetType(id)}
                />
              ))}
            </div>
            <small style={{ color: "#7a6650", fontSize: 11, lineHeight: 1.3 }}>
              all three buddies live in the same app. you can switch anytime
              from the menu.
            </small>
            <button type="submit">meet {PETS[petType].label} →</button>
          </form>
        </div>
      );
    }

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

      {welcome && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5 }}>
          <div className="buddy-bubble">{welcome}</div>
        </div>
      )}

      <div
        style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 10 }}
      >
        {menuOpen && (
          <div className="buddy-menu">
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                controlRef.current.drinkLeft = 2000;
                setMenuOpen(false);
              }}
            >
              Drink water
            </button>
            <button
              type="button"
              className="buddy-menu__button"
              onClick={() => {
                controlRef.current.work = !controlRef.current.work;
                setWorkOn((prev) => !prev);
                setMenuOpen(false);
              }}
            >
              {workOn ? "Stop work" : "Work mode"}
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

      {changingPet && (
        <div style={dialogStyle}>
          <div style={{ ...panelStyle, width: 260 }}>
            <strong>who's moving in?</strong>
            <div style={{ display: "flex", gap: 8 }}>
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

function PetPreview({ pet, size = 52 }: { pet: PetType; size?: number }) {
  const definition = PETS[pet];
  const frames = definition.frameCount.idle;
  const win = definition.preview;
  const scale = size / win.h;
  return (
    <div
      style={{
        width: win.w * scale,
        height: size,
        overflow: "hidden",
        flex: "none",
      }}
    >
      <div
        className="pet-preview"
        aria-hidden="true"
        style={{
          width: 64 * scale,
          height: 64 * scale,
          marginLeft: -win.x * scale,
          marginTop: -win.y * scale,
          backgroundImage: `url(${definition.sheets.idle})`,
          backgroundSize: `${64 * scale * frames}px ${64 * scale}px`,
          ["--pet-preview-frame-width" as string]: `${64 * scale}px`,
          ["--pet-preview-frames" as string]: frames,
          ["--pet-preview-duration" as string]: `${(frames * definition.frameMs.idle) / 1000}s`,
        }}
      />
    </div>
  );
}

const PET_CARD_PREVIEW: Record<PetType, number> = {
  cat: 52,
  star: 40,
  hamster: 46,
};

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
