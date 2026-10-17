import { useEffect, useState } from "react";
import Pet from "../components/Pet";
import type { Names } from "../names";

interface ArrivalProps {
  names: Names;
  onContinue: () => void;
}

export default function Arrival({ names, onContinue }: ArrivalProps) {
  const [hasTurned, setHasTurned] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasTurned(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="stage" aria-labelledby="arrival-title">
      <h1 id="arrival-title" className="scene-title">
        A treehouse in the canopy
      </h1>
      <div className="treehouse">
        <div className="treehouse-roof" />
        <Pet mood="idle" turnedAway={!hasTurned} />
        <div className="treehouse-floor" />
      </div>
      <div className="dialogue" role="status">
        {hasTurned ? (
          <p>
            Oh! There you are, {names.yourName}. I was hoping you would find
            your way here.
          </p>
        ) : (
          <p>...somewhere above the leaves, a little tail flicks.</p>
        )}
      </div>
      {hasTurned && (
        <button type="button" className="story-btn" onClick={onContinue}>
          Say hello
        </button>
      )}
    </section>
  );
}
