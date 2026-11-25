import { useNow } from "../../hooks/useNow";
import { workElapsedAt, type ActiveWork } from "../../hooks/useWorkLog";
import { formatClock } from "../../lib/time";

/** Name-tag under the buddy's feet; only this tag ticks every second. */
export function WorkTag({ active }: { active: ActiveWork }) {
  const paused = active.pausedAt !== undefined;
  const now = useNow(1000, !paused);
  return (
    <div
      className={`buddy-tag${paused ? " buddy-tag--paused" : ""}`}
      title={`${paused ? "paused" : "working"} on ${active.task}`}
    >
      <span className="buddy-tag__dot" aria-hidden="true" />
      <span className="buddy-tag__clock">
        {formatClock(workElapsedAt(active, now))}
      </span>
      <span className="buddy-tag__task">
        {active.task}
        {paused ? " · paused" : ""}
      </span>
    </div>
  );
}
