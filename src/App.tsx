import { useEffect, useRef, useState } from "react";
import { db, type Reminder } from "./db";
import idleSheet from "./assets/cat.png";
import heartSheet from "./assets/catheart.png";
import drinkSheet from "./assets/catdrink.png";
import workSheet from "./assets/catwork.png";

declare global {
  interface Window {
    desktopBuddy?: {
      getWindowPosition: () => [number, number];
      moveWindow: (x: number, y: number) => void;
      sleepWindow: (duration: number) => void;
      exitApp: () => void;
    };
  }
}

type PetState = "idle" | "heart" | "drink" | "work";

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
    new Date(Date.now() + 60000).toISOString().slice(0, 16),
  );
  const [sleepMinutes, setSleepMinutes] = useState("15");

  useEffect(() => {
    let active = true;
    const loadReminders = async () => {
      const saved = await db.reminders.orderBy("remindAt").toArray();
      if (active) setReminders(saved);
    };
    void loadReminders();

    const checkReminders = window.setInterval(async () => {
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
      window.clearInterval(checkReminders);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const images: Record<PetState, HTMLImageElement> = {
      idle: new Image(),
      heart: new Image(),
      drink: new Image(),
      work: new Image(),
    };
    images.idle.src = idleSheet;
    images.heart.src = heartSheet;
    images.drink.src = drinkSheet;
    images.work.src = workSheet;

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
    let petTimeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      groundY = canvas.height - SIZE - 10;
      y = Math.min(y, groundY);
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = images[state];
      if (img.complete) {
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
  }, []);

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
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    await db.reminders.add({ text: reminderText.trim(), remindAt, notified: false });
    setReminders(await db.reminders.orderBy("remindAt").toArray());
    setReminderText("");
    setReminderAt("");
    setReminderError("");
    setReminderOpen(false);
  };

  const removeReminder = async (id: number) => {
    await db.reminders.delete(id);
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

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
              controlRef.current.drinkLeft = 2000;
              setMenuOpen(false);
            }}>💧 Drink water</button>
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
            <button onClick={() => window.desktopBuddy?.exitApp()}>✕ Exit</button>
            <button onClick={() => setMenuOpen(false)}>× Close</button>
          </div>
        )}
      </div>

      {reminderOpen && (
        <div style={dialogStyle}>
          <div style={panelStyle}>
            <strong>New reminder</strong>
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
              <button onClick={() => void addReminder()}>Add</button>
              <button onClick={() => setReminderOpen(false)}>Cancel</button>
            </div>
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
