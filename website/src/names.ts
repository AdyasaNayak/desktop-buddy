export interface Names {
  petName: string;
  yourName: string;
}

export const DEFAULT_NAMES: Names = {
  petName: "Buddy",
  yourName: "friend",
};

const STORAGE_KEY = "desktop-buddy-names";
const MAX_NAME_LENGTH = 24;

export function sanitizeName(value: string, fallback: string): string {
  const trimmed = value.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : fallback;
}

export function loadNames(): Names {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NAMES;
    const parsed = JSON.parse(raw) as Partial<Names>;
    return {
      petName: sanitizeName(parsed.petName ?? "", DEFAULT_NAMES.petName),
      yourName: sanitizeName(parsed.yourName ?? "", DEFAULT_NAMES.yourName),
    };
  } catch {
    return DEFAULT_NAMES;
  }
}

export function saveNames(names: Names): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Personalization is a nice-to-have; the story works without storage.
  }
}
