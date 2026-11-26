import type { MissedReminderNotice } from "../lib/reminders";
import type { WaterNudgeNotice } from "../lib/waterMessages";

/**
 * The API the Electron preload (`electron/preload.cjs`) exposes on
 * `window.desktopBuddy`. It is missing when the renderer runs in a plain
 * browser (`npm run dev`), so every caller must handle `undefined`.
 */
export interface DesktopBuddyBridge {
  getWindowPosition: () => [number, number];
  getPointerPosition: () => { x: number; y: number; inside: boolean };
  getAlwaysOnTop: () => boolean;
  setAlwaysOnTop: (enabled: boolean) => void;
  onAlwaysOnTopChanged: (callback: (enabled: boolean) => void) => () => void;
  onPointerPosition: (
    callback: (point: { x: number; y: number; inside: boolean }) => void,
  ) => () => void;
  setWindowMode: (mode: "setup" | "pet") => void;
  moveWindow: (x: number, y: number) => void;
  sleepWindow: (duration: number) => void;
  hideApp: () => Promise<boolean>;
  setWorkStatus: (
    status: { task: string; elapsedMs: number; paused: boolean } | null,
  ) => void;
  setClickThrough: (ignore: boolean) => void;
  exitApp: () => void;
  scheduleReminder: (id: number, text: string, remindAt: number) => void;
  cancelReminder: (id: number) => void;
  notifyMissedReminders: (notice: MissedReminderNotice) => void;
  notifyWaterReminder: (notice: WaterNudgeNotice) => void;
  notifyWorkReminder: (notice: { title: string; body: string }) => void;
  onReminder: (callback: (id: number) => void) => () => void;
  onWindowHidden: (callback: () => void) => () => void;
  onWindowWake: (callback: () => void) => () => void;
  onWindowShown: (callback: () => void) => () => void;
  setLoginItem: (openAtLogin: boolean, launchHidden: boolean) => boolean;
  isPackaged: boolean;
}

declare global {
  interface Window {
    desktopBuddy?: DesktopBuddyBridge;
  }
}
