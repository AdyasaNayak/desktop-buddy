import { useEffect, useState } from "react";
import "./App.css";
import Arrival from "./scenes/Arrival";
import Exploring from "./scenes/Exploring";
import GettingStarted from "./scenes/GettingStarted";
import Goodbye from "./scenes/Goodbye";
import Meeting from "./scenes/Meeting";
import TakingHome from "./scenes/TakingHome";
import { loadNames, saveNames, type Names } from "./names";

const SCENE_COUNT = 6;

function App() {
  const [scene, setScene] = useState(0);
  const [names, setNames] = useState<Names>(() => loadNames());

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [scene]);

  function handleNames(next: Names) {
    setNames(next);
    saveNames(next);
  }

  function handleRestart() {
    setScene(0);
  }

  return (
    <main className="story">
      <div aria-hidden="true">
        <span className="leaf" />
        <span className="leaf" />
        <span className="leaf" />
        <span className="leaf" />
        <span className="leaf" />
      </div>
      {scene === 0 && (
        <Arrival names={names} onContinue={() => setScene(1)} />
      )}
      {scene === 1 && (
        <Meeting
          names={names}
          onNames={handleNames}
          onContinue={() => setScene(2)}
        />
      )}
      {scene === 2 && (
        <Exploring names={names} onContinue={() => setScene(3)} />
      )}
      {scene === 3 && (
        <TakingHome names={names} onContinue={() => setScene(4)} />
      )}
      {scene === 4 && (
        <GettingStarted names={names} onContinue={() => setScene(5)} />
      )}
      {scene === 5 && <Goodbye names={names} onRestart={handleRestart} />}
      <nav aria-label="Story progress" className="story-dots">
        {Array.from({ length: SCENE_COUNT }, (_, index) => (
          <span
            key={index}
            className={index === scene ? "story-dot is-active" : "story-dot"}
          />
        ))}
      </nav>
    </main>
  );
}

export default App;
