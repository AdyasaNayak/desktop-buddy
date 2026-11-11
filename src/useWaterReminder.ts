import { useCallback, useEffect, useRef, useState } from "react";
import { db, type WaterPlan } from "./db";
import { dayKey } from "./time";
import { pickWaterMessage, waterNudgeNotice } from "./waterMessages";
import { nextReminderAfterDismiss } from "./waterSchedule";

export interface WaterPrompt {
  message: string;
  amountMl: number;
  totalMl: number;
}

const CHECK_MS = 15_000;
const SNOOZE_MINUTES = 10;
const DEFAULT_AMOUNT_ML = 250;
const DEFAULT_INTERVAL_MINUTES = 60;

async function readTodayMl(date: string): Promise<number> {
  const entries = await db.water.where("date").equals(date).toArray();
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

/**
 * A hidden buddy draws its nudge bubble out of sight. The main process turns
 * the notice into an OS notification when the window is hidden, so the nudge
 * still reaches the user. In browser preview a hidden tab gets the same
 * fallback through the browser's Notification API.
 */
function announceNudge(prompt: WaterPrompt) {
  const notice = waterNudgeNotice(prompt);
  if (window.desktopBuddy) {
    window.desktopBuddy.notifyWaterReminder(notice);
    return;
  }
  if (!document.hidden) return;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(notice.title, { body: notice.body });
  }
}

/**
 * Owns the saved water schedule, today's intake, and the in-app nudge.
 * The nudge stays open until the user dismisses it, logs a glass, snoozes,
 * or turns it off.
 */
export function useWaterReminder(
  petName: string,
  yourName: string,
  ready: boolean,
) {
  const [plan, setPlan] = useState<WaterPlan | null>(null);
  const [todayMl, setTodayMl] = useState(0);
  const [prompt, setPrompt] = useState<WaterPrompt | null>(null);
  const lastMessage = useRef<string | null>(null);
  const loadedDay = useRef(dayKey());
  const totalRequest = useRef(0);

  /**
   * Re-read today's intake. A slower, older read never overwrites a newer
   * total, which matters when a drink is logged just as the day changes.
   */
  const refreshTodayMl = useCallback(async () => {
    const request = ++totalRequest.current;
    const key = dayKey();
    const total = await readTodayMl(key);
    if (request !== totalRequest.current) return total;
    // Midnight can pass while the query runs; the day check will read again.
    if (key !== dayKey()) return total;
    loadedDay.current = key;
    setTodayMl(total);
    setPrompt((current) =>
      current ? { ...current, totalMl: total } : current,
    );
    return total;
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [savedPlan] = await Promise.all([
          db.waterPlans.get("me"),
          refreshTodayMl(),
        ]);
        if (!active) return;
        setPlan(savedPlan ?? null);
      } catch (error) {
        console.error("Could not load water reminders", error);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [refreshTodayMl]);

  // The buddy can stay open for days, so refresh when the local day changes.
  // A sleeping machine can stall the timer, hence the focus checks too.
  useEffect(() => {
    const checkDay = () => {
      if (dayKey() === loadedDay.current) return;
      void refreshTodayMl().catch((error) => {
        console.error("Could not refresh today's water", error);
      });
    };
    const timer = window.setInterval(checkDay, CHECK_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) checkDay();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkDay);
    };
  }, [refreshTodayMl]);

  useEffect(() => {
    if (!ready || !plan?.enabled) return;
    const check = () => {
      if (prompt) return;
      if (plan.nextReminderAt > Date.now()) return;
      const message = pickWaterMessage(
        { petName, yourName, amountMl: plan.amountMl },
        lastMessage.current,
      );
      lastMessage.current = message;
      const nudge = { message, amountMl: plan.amountMl, totalMl: todayMl };
      setPrompt(nudge);
      announceNudge(nudge);
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [ready, plan, prompt, todayMl, petName, yourName]);

  // Hiding the buddy with a nudge still waiting takes its bubble off screen,
  // so pass that pending nudge to the OS notification path too.
  useEffect(() => {
    const bridge = window.desktopBuddy;
    if (!bridge || !prompt) return;
    return bridge.onWindowHidden(() => announceNudge(prompt));
  }, [prompt]);

  const scheduleAt = useCallback(
    async (nextReminderAt: number) => {
      if (!plan) return;
      const next: WaterPlan = { ...plan, nextReminderAt };
      await db.waterPlans.put(next);
      setPlan(next);
    },
    [plan],
  );

  const scheduleNext = useCallback(
    (minutes: number) => scheduleAt(Date.now() + minutes * 60_000),
    [scheduleAt],
  );

  const savePlan = useCallback(
    async (amountMl: number, intervalMinutes: number) => {
      const next: WaterPlan = {
        id: "me",
        amountMl,
        intervalMinutes,
        nextReminderAt: Date.now() + intervalMinutes * 60_000,
        enabled: true,
      };
      await db.waterPlans.put(next);
      setPlan(next);
      setPrompt(null);
    },
    [],
  );

  const stop = useCallback(async () => {
    if (!plan) return;
    const next: WaterPlan = { ...plan, enabled: false };
    await db.waterPlans.put(next);
    setPlan(next);
    setPrompt(null);
  }, [plan]);

  const logDrink = useCallback(
    async (amountMl?: number) => {
      const ml = amountMl ?? plan?.amountMl ?? DEFAULT_AMOUNT_ML;
      await db.water.add({ date: dayKey(), amount: ml, ts: Date.now() });
      return refreshTodayMl();
    },
    [plan?.amountMl, refreshTodayMl],
  );

  /** Log the glass from the nudge and push the next reminder out. */
  const drank = useCallback(async () => {
    const total = await logDrink(prompt?.amountMl);
    await scheduleNext(plan?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES);
    setPrompt(null);
    return total;
  }, [prompt?.amountMl, logDrink, scheduleNext, plan?.intervalMinutes]);

  const snooze = useCallback(async () => {
    await scheduleNext(SNOOZE_MINUTES);
    setPrompt(null);
  }, [scheduleNext]);

  /**
   * Close the nudge without logging a glass or changing the water settings.
   * A preview leaves the schedule alone, while a nudge that is already due is
   * pushed out by one interval so the check does not reopen it immediately.
   */
  const dismiss = useCallback(async () => {
    const nextAt = plan ? nextReminderAfterDismiss(plan, Date.now()) : null;
    if (nextAt !== null) await scheduleAt(nextAt);
    setPrompt(null);
  }, [plan, scheduleAt]);

  const turnOff = useCallback(async () => {
    await stop();
  }, [stop]);

  /** Show a nudge right away so the user can preview the messages. */
  const preview = useCallback(() => {
    if (!plan) return;
    const message = pickWaterMessage(
      { petName, yourName, amountMl: plan.amountMl },
      lastMessage.current,
    );
    lastMessage.current = message;
    setPrompt({ message, amountMl: plan.amountMl, totalMl: todayMl });
  }, [plan, todayMl, petName, yourName]);

  return {
    plan,
    todayMl,
    prompt,
    savePlan,
    stop,
    drank,
    snooze,
    dismiss,
    turnOff,
    preview,
  };
}
