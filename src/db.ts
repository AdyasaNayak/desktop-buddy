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

class BuddyDB extends Dexie {
  profiles!: Table<Profile, string>;
  water!: Table<WaterEntry, number>;
  reminders!: Table<Reminder, number>;

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
  }
}

export const db = new BuddyDB();
