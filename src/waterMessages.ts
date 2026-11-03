export interface WaterMessageContext {
  petName: string;
  yourName: string;
  amountMl: number;
}

type WaterMessage = (context: WaterMessageContext) => string;

const WATER_MESSAGES: WaterMessage[] = [
  ({ amountMl }) =>
    `water break! ${amountMl} ml now keeps the afternoon fog away.`,
  ({ petName }) => `psst… your water is waiting. ${petName} believes in you.`,
  () => "tiny sip, big save. your brain runs on water.",
  () => "refill o'clock! take a breath and a sip.",
  ({ yourName }) =>
    `${yourName ? `${yourName}, ` : ""}hydrate like someone who has it together.`,
  () => "your plants get water. so should you.",
  () => "one glass now beats three later.",
  () => "this is your friendly neighborhood water reminder.",
  () => "water first, then the next thing.",
  () => "a little water, a little reset. you've earned both.",
  () => "sip, stretch, smile. repeat as needed.",
  ({ petName }) => `${petName} says: drink up, champion.`,
];

/** Pick a fresh nudge, avoiding an immediate repeat. */
export function pickWaterMessage(
  context: WaterMessageContext,
  previous: string | null,
): string {
  let index = Math.floor(Math.random() * WATER_MESSAGES.length);
  if (
    WATER_MESSAGES.length > 1 &&
    WATER_MESSAGES[index](context) === previous
  ) {
    index = (index + 1) % WATER_MESSAGES.length;
  }
  return WATER_MESSAGES[index](context);
}
