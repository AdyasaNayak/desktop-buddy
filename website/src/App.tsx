import { useState } from "react";
import "./App.css";
import cat from "./assets/cat.png";
import catheart from "./assets/catheart.png";

function App() {
  const [happy, setHappy] = useState(false);

  return (
    <main className="world">
      <h1>Oh! There you are.</h1>
      <p>I was hoping you would find your way here.</p>
      <div className="pet-wrap">
        <div
          className={happy ? "pet pet--happy" : "pet pet--idle"}
          style={{ backgroundImage: `url(${happy ? catheart : cat})` }}
          role="img"
          aria-label="A small pixel cat, idling softly"
          onMouseEnter={() => setHappy(true)}
          onMouseLeave={() => setHappy(false)}
        />
      </div>
    </main>
  );
}

export default App;
