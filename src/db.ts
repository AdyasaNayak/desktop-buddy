import Dexie, {type Table} from "dexie";

export interface Profile {
    id: string;
    petName: string;
    yourName: string;
    petType: string;
}

export interface Profile {
  id?: number;
  date: string;
  amount: number;
  ts: number;
}

class BuddyDB extends Dexie{
    profiles!: Table<Profile, string>;
    water!: Table<WaterEntry, number>;

    constructor(){
        super("buddyDB");
        this.version(1).stores({
            profiles: "id",
            water: "++id, date",
        });
    }
}

export const db = new BuddyDB();