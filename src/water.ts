/**
 * Little nudges, in the buddy's voice. They are deliberately short: the pet
 * window is tiny, and the point is to get someone to the kitchen, not to read
 * an essay about hydration.
 */
export const WATER_MESSAGES = [
  "water break! one glass now, and future-you says thank you.",
  "sip sip! a tiny pause, a fresher brain.",
  "hey — your brain is mostly water. top it up?",
  "a glass of water now beats a headache later.",
  "hydrate first, conquer later. one glass?",
  "your plants get water. you deserve some too.",
  "small sip, fresh start. you've got this.",
  "water break! stretch, sip, breathe.",
  "one glass of water counts as taking care of yourself.",
  "refill, reset, carry on. water time.",
];

let lastMessage = -1;

/** Avoid the same nudge twice in a row; it makes the pet feel alive. */
export function pickWaterMessage() {
  let next = Math.floor(Math.random() * WATER_MESSAGES.length);
  if (WATER_MESSAGES.length > 1 && next === lastMessage) {
    next = (next + 1) % WATER_MESSAGES.length;
  }
  lastMessage = next;
  return WATER_MESSAGES[next];
}
