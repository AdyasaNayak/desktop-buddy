import Dexie, { type Table } from "dexie";
import type { PetType } from "./pets";
import type { QuietHours } from "./waterOptions";

export interface Profile {
  id: string;
  petName: string;
  yourName: string;
  petType: PetType;
}

export interface WaterEntry {
  id?: number;
  date: string;
  amount: number;
  ts: number;
}

export type ReminderRepeat = "none" | "daily" | "weekly";

export interface Reminder {
  id?: number;
  text: string;
  remindAt: number;
  notified: boolean;
  /** When the reminder fired; missing on rows saved by older versions. */
  notifiedAt?: number;
  /** How the reminder comes back after firing; missing means once. */
  repeat?: ReminderRepeat;
}

/** The user's chosen schedule for water nudges. */
export interface WaterPlan {
  id: string;
  amountMl: number;
  intervalMinutes: number;
  nextReminderAt: number;
  enabled: boolean;
  /** Daily intake goal; missing on plans saved by older versions. */
  dailyGoalMl?: number;
  /** Times when nudges should stay quiet; missing means always allowed. */
  quietHours?: QuietHours;
}

export interface WorkSession {
  id?: number;
  task: string;
  startedAt: number;
  endedAt?: number;
  /** Work time banked through the last checkpoint; the final total once ended. */
  durationMs: number;
  /** Last wall-clock checkpoint for a running or paused timer. */
  heartbeatAt: number;
  /** Time excluded because the timer was paused or the app was closed. */
  pausedMs?: number;
  /** When the user paused the timer; missing while it is running. */
  pausedAt?: number;
  /** When the long-session break reminder was shown. */
  longReminderAt?: number;
}

class BuddyDB extends Dexie {
  profiles!: Table<Profile, string>;
  water!: Table<WaterEntry, number>;
  reminders!: Table<Reminder, number>;
  waterPlans!: Table<WaterPlan, string>;
  workSessions!: Table<WorkSession, number>;

  constructor() {
    super("buddyDB");
    this.version(1).stores({
      profiles: "id",
      water: "++id, date",
    });
    this.version(2).stores({
      profiles: "id",
      water: "++id, date",
      reminders: "++id, remindAt",
    });
    this.version(3).stores({
      profiles: "id",
      water: "++id, date",
      reminders: "++id, remindAt",
      waterPlans: "id",
      workSessions: "++id, startedAt",
    });
    this.version(4).stores({
      profiles: "id",
      water: "++id, date, ts",
      reminders: "++id, remindAt",
      waterPlans: "id",
      workSessions: "++id, startedAt",
    });
  }
}

export const db = new BuddyDB();
