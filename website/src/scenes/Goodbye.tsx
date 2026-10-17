import Pet from "../components/Pet";
import type { Names } from "../names";

interface GoodbyeProps {
  names: Names;
  onRestart: () => void;
}

const WINDOWS_RELEASE_URL =
  "https://github.com/AdyasaNayak/desktop-buddy/releases";

export default function Goodbye({ names, onRestart }: GoodbyeProps) {
  return (
    <section className="stage" aria-labelledby="goodbye-title">
      <h1 id="goodbye-title" className="scene-title">
        Until next time
      </h1>
      <div className="treehouse">
        <div className="treehouse-roof" />
        <Pet mood="idle" turnedAway />
        <div className="treehouse-floor" />
      </div>
      <div className="dialogue" role="status">
        <p>
          I will be waiting in your corner of the world, {names.yourName}. Come
          visit me whenever you need a little company.
        </p>
      </div>
      <div className="story-actions">
        <a
          className="story-btn story-btn--primary"
          href={WINDOWS_RELEASE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Invite {names.petName} home
        </a>
        <button type="button" className="story-btn" onClick={onRestart}>
          Walk the path again
        </button>
      </div>
    </section>
  );
}
