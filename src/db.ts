import Dexie, { type Table } from "dexie";
import type { PetType } from "./pets";

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

export interface Reminder {
  id?: number;
  text: string;
  remindAt: number;
  notified: boolean;
}

/** How much water to aim for, and how often to be nudged. */
export interface WaterPlan {
  id: "me";
  glassesPerDay: number;
  intervalMinutes: number;
  enabled: boolean;
  nextReminderAt: number;
}

/** A focus session; `endedAt` is missing while the timer is running. */
export interface WorkSession {
  id?: number;
  task: string;
  startedAt: number;
  /** Last heartbeat from the running app, so a restart can't count closed time. */
  lastActiveAt?: number;
  endedAt?: number;
}

class BuddyDB extends Dexie {
  profiles!: Table<Profile, string>;
  water!: Table<WaterEntry, number>;
  reminders!: Table<Reminder, number>;
  waterPlan!: Table<WaterPlan, string>;
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
      waterPlan: "id",
      workSessions: "++id, startedAt",
    });
  }
}

export const db = new BuddyDB();
