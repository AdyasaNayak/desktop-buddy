import type { WaterPrompt } from "../../hooks/useWaterReminder";
import { PixelIcon } from "../PixelIcon";

/**
 * The buddy's speech bubble, anchored above its head. A water nudge shows its
 * actions; any other message (greetings, confirmations, errors) is plain text
 * and, while a nudge is open, sits under it so neither hides the other.
 */
export function SpeechBubble({
  prompt,
  message,
  pending,
  onDismiss,
  onDrank,
  onSnooze,
  onStop,
}: {
  prompt: WaterPrompt | null;
  message: string | null;
  pending: boolean;
  onDismiss: () => void;
  onDrank: () => void;
  onSnooze: () => void;
  onStop: () => void;
}) {
  return (
    <div
      className={`buddy-pop buddy-say${prompt ? " buddy-say--water" : ""}`}
      role="status"
    >
      {prompt ? (
        <>
          <div className="buddy-say__head">
            <span className="buddy-say__tag">
              <PixelIcon name="water" size={11} /> water break
            </span>
            <span className="buddy-say__meta">{prompt.totalMl} ml today</span>
            <button
              type="button"
              className="buddy-close buddy-say__close"
              aria-label="Dismiss water nudge"
              title="Dismiss"
              disabled={pending}
              onClick={onDismiss}
            >
              ×
            </button>
          </div>
          <p className="buddy-say__text">{prompt.message}</p>
          {/* A failed water action leaves its prompt up, so its message
              shows under the nudge instead of replacing it out of sight. */}
          {message && <p className="buddy-say__note">{message}</p>}
          <div className="buddy-say__actions">
            <button
              type="button"
              className="buddy-chip buddy-chip--primary"
              disabled={pending}
              onClick={onDrank}
            >
              drank {prompt.amountMl} ml
            </button>
            <button
              type="button"
              className="buddy-chip"
              disabled={pending}
              onClick={onSnooze}
            >
              in 10 min
            </button>
            <button
              type="button"
              className="buddy-chip buddy-chip--quiet"
              disabled={pending}
              onClick={onStop}
            >
              stop nudges
            </button>
          </div>
        </>
      ) : (
        <p className="buddy-say__text">{message}</p>
      )}
    </div>
  );
}
