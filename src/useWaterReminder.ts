import { useCallback, useEffect, useRef, useState } from "react";
import { db, type WaterPlan } from "./db";
import { dayKey } from "./time";
import { pickWaterMessage } from "./waterMessages";

export interface WaterPrompt {
  message: string;
  amountMl: number;
  totalMl: number;
}

const CHECK_MS = 15_000;
const SNOOZE_MINUTES = 10;
const DEFAULT_AMOUNT_ML = 250;
const DEFAULT_INTERVAL_MINUTES = 60;

async function readTodayMl(): Promise<number> {
  const entries = await db.water.where("date").equals(dayKey()).toArray();
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

/**
 * Owns the saved water schedule, today's intake, and the in-app nudge.
 * The nudge reappears until the user logs a glass, snoozes, or turns it off.
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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [savedPlan, savedToday] = await Promise.all([
          db.waterPlans.get("me"),
          readTodayMl(),
        ]);
        if (!active) return;
        setPlan(savedPlan ?? null);
        setTodayMl(savedToday);
      } catch (error) {
        console.error("Could not load water reminders", error);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

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
      setPrompt({ message, amountMl: plan.amountMl, totalMl: todayMl });
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [ready, plan, prompt, todayMl, petName, yourName]);

  const scheduleNext = useCallback(
    async (minutes: number) => {
      if (!plan) return;
      const next: WaterPlan = {
        ...plan,
        nextReminderAt: Date.now() + minutes * 60_000,
      };
      await db.waterPlans.put(next);
      setPlan(next);
    },
    [plan],
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
      const total = await readTodayMl();
      setTodayMl(total);
      return total;
    },
    [plan?.amountMl],
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
    turnOff,
    preview,
  };
}
