import Pet from "../components/Pet";
import type { Names } from "../names";

interface GettingStartedProps {
  names: Names;
  onContinue: () => void;
}

export default function GettingStarted({ names, onContinue }: GettingStartedProps) {
  return (
    <section className="stage" aria-labelledby="getting-started-title">
      <h1 id="getting-started-title" className="scene-title">
        The trail of little steps
      </h1>
      <div className="treehouse">
        <div className="treehouse-roof" />
        <Pet mood="happy" />
        <div className="treehouse-floor" />
      </div>
      <div className="dialogue" role="status">
        <p>
          Once I arrive, {names.yourName}, open the installer and follow the
          little trail of steps. Then I will find a cozy corner on your desktop.
        </p>
      </div>
      <div className="panel">
        <h2>How I move in</h2>
        <ol className="steps-list">
          <li>Download the Windows installer from the wooden chest.</li>
          <li>Open it and follow the installation prompts.</li>
          <li>Launch Desktop Buddy and meet me on your desktop.</li>
        </ol>
        <p>
          Once I am there, you can drag me anywhere on your screen, pet me for
          a happy bounce, and adjust my reminders, drinks, work and sleep
          whenever you like.
        </p>
      </div>
      <button type="button" className="story-btn" onClick={onContinue}>
        See you in my corner
      </button>
    </section>
  );
}
