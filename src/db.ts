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

/** The user's chosen schedule for water nudges. */
export interface WaterPlan {
  id: string;
  amountMl: number;
  intervalMinutes: number;
  nextReminderAt: number;
  enabled: boolean;
}

export interface WorkSession {
  id?: number;
  task: string;
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  heartbeatAt: number;
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
  }
}

export const db = new BuddyDB();
