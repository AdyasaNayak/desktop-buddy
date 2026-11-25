import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/app.css";
import { BuddyMenu } from "../components/buddy/BuddyMenu";
import { SpeechBubble } from "../components/buddy/SpeechBubble";
import { WorkTag } from "../components/buddy/WorkTag";
import { PetPickerDialog } from "../components/dialogs/PetPickerDialog";
import { SleepDialog } from "../components/dialogs/SleepDialog";
import { Onboarding, type OnboardingResult } from "../components/Onboarding";
import { ReminderPanel } from "../components/panels/ReminderPanel";
import { WaterPanel } from "../components/panels/WaterPanel";
import { WorkPanel } from "../components/panels/WorkPanel";
import { useClickThrough } from "../hooks/useClickThrough";
import { usePendingAction } from "../hooks/usePendingAction";
import { useReminders } from "../hooks/useReminders";
import { useWaterReminder } from "../hooks/useWaterReminder";
import { useWorkLog, workElapsedAt } from "../hooks/useWorkLog";
import type { Rect } from "../lib/clickThrough";
import { formatDuration, formatInterval } from "../lib/time";
import type { WaterSettings } from "../lib/waterOptions";
import {
  startPetEngine,
  type PetEngine,
  type PetEntrance,
} from "../pet/petEngine";
import { PETS, toPetType, type PetType } from "../pet/pets";
import { db, type Profile } from "../storage/db";

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
  const {
    reminders,
    saveReminder,
    removeReminder,
    snoozeReminder,
    clearFiredReminders,
  } = useReminders();
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
        <SpeechBubble
          prompt={water.prompt}
          message={welcome}
          pending={waterAction.pending}
          onDismiss={() => void dismissWater()}
          onDrank={() => void drankFromPrompt()}
          onSnooze={() => void snoozeWater()}
          onStop={() => void turnOffWater()}
        />
      )}

      {menuOpen && (
        <BuddyMenu
          petName={profile.petName}
          error={hideError}
          working={work.active !== null}
          alwaysOnTop={alwaysOnTop}
          onWater={() => openPanel(() => setWaterOpen(true))}
          onWork={() => openPanel(() => setWorkOpen(true))}
          onReminders={() => openPanel(() => setReminderOpen(true))}
          onSleep={() => openPanel(() => setSleepOpen(true))}
          onRename={() =>
            openPanel(() => {
              setProfileError("");
              setRenaming(true);
            })
          }
          onChangePet={() =>
            openPanel(() => {
              setProfileError("");
              setChangingPet(true);
            })
          }
          onToggleOnTop={toggleAlwaysOnTop}
          onHide={hideBuddy}
          onQuit={() => window.desktopBuddy?.exitApp()}
        />
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
        <SleepDialog
          onSleep={(durationMs) => {
            setSleepOpen(false);
            putBuddyToSleep(durationMs);
          }}
          onCancel={() => setSleepOpen(false)}
        />
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
        <PetPickerDialog
          activePet={activePet}
          pending={petAction.pending}
          error={profileError}
          onPick={(pet) => void changePet(pet)}
          onCancel={() => {
            setProfileError("");
            setChangingPet(false);
          }}
        />
      )}
    </div>
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
