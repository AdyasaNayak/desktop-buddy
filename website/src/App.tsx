import { useEffect, useState } from "react";
import { Pet, type PetMode } from "./Pet";
import "./App.css";

const DOWNLOAD_URL = "https://github.com/AdyasaNayak/desktop-buddy/releases";

type Os = "windows" | "mac" | "linux" | "unknown";

function detectOs(): Os {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.25 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function Speech({ children }: { children: React.ReactNode }) {
  return (
    <div className="speech">
      <p>{children}</p>
    </div>
  );
}

function Scene({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scene ${className}`.trim()} data-reveal>
      <div className="scene-inner">{children}</div>
    </section>
  );
}

const MOMENTS: {
  key: string;
  title: string;
  text: string;
  tip: string;
  mode: PetMode;
  badge: string;
}[] = [
  {
    key: "drink",
    title: "Drink breaks",
    text: "I sip my water from a little cup, and nudge you when you forget yours.",
    tip: "Tap my cup and I will pop out for a sip.",
    mode: "drink",
    badge: "",
  },
  {
    key: "work",
    title: "Work mode",
    text: "Sit me beside you while you work. I keep quiet and think warm thoughts.",
    tip: "Double-click me for a happy bounce when you need a tiny break.",
    mode: "work",
    badge: "",
  },
  {
    key: "sleep",
    title: "Sleep mode",
    text: "When the day is done, I curl into my moonlit nook and let you rest.",
    tip: "My nook dims the room, so I never glow at you at night.",
    mode: "idle",
    badge: "z z z",
  },
  {
    key: "notes",
    title: "Reminders",
    text: "I pin gentle notes to your screen, so nothing important slips away.",
    tip: "You write the note, I deliver it right on time.",
    mode: "idle",
    badge: "!",
  },
];

function loadNames() {
  try {
    const raw = localStorage.getItem("desktop-buddy-names");
    if (raw) {
      const names = JSON.parse(raw) as { pet?: string; human?: string };
      return {
        pet: typeof names.pet === "string" ? names.pet : "",
        human: typeof names.human === "string" ? names.human : "",
        named: Boolean(names.pet && names.human),
      };
    }
  } catch {
    /* first visit or blocked storage */
  }
  return { pet: "", human: "", named: false };
}

export default function App() {
  const [initial] = useState(loadNames);
  const [petName, setPetName] = useState(initial.pet);
  const [humanName, setHumanName] = useState(initial.human);
  const [named, setNamed] = useState(initial.named);
  const [os, setOs] = useState<Os>(detectOs);

  useReveal();

  const confirmNames = () => {
    setNamed(true);
    try {
      localStorage.setItem(
        "desktop-buddy-names",
        JSON.stringify({ pet: petName.trim(), human: humanName.trim() }),
      );
    } catch {
      /* storage unavailable; names still work for this visit */
    }
  };

  const me = humanName.trim() || "traveler";
  const buddy = petName.trim() || "little friend";
  const canConfirm = petName.trim().length > 0 && humanName.trim().length > 0;

  return (
    <main className="world">
      <div className="sun" aria-hidden="true" />
      <div className="canopy canopy--top" aria-hidden="true" />
      <div className="canopy canopy--left" aria-hidden="true" />
      <div className="canopy canopy--right" aria-hidden="true" />
      <div className="motes" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>

      {/* 1. Arrival */}
      <header className="scene scene--arrival" data-reveal>
        <svg
          className="village"
          viewBox="0 0 1200 170"
          preserveAspectRatio="xMidYMax meet"
          aria-hidden="true"
        >
          <g fill="#6e9e57">
            <rect x="150" y="70" width="16" height="100" rx="4" />
            <circle cx="158" cy="62" r="46" />
            <rect x="900" y="90" width="14" height="80" rx="4" />
            <circle cx="907" cy="84" r="40" />
          </g>
          <g fill="#4a7c3f">
            <rect x="540" y="50" width="20" height="120" rx="5" />
            <circle cx="550" cy="40" r="56" />
          </g>
          <g>
            <polygon points="118,52 198,52 158,26" fill="#8a5a33" />
            <rect x="124" y="52" width="68" height="44" rx="6" fill="#9c6b3f" />
            <rect x="146" y="66" width="24" height="20" rx="3" fill="#f5c453" />
            <polygon points="508,34 592,34 550,6" fill="#8a5a33" />
            <rect x="514" y="34" width="72" height="48" rx="6" fill="#9c6b3f" />
            <rect x="536" y="48" width="26" height="22" rx="3" fill="#f5c453" />
            <polygon points="872,72 942,72 907,48" fill="#8a5a33" />
            <rect x="877" y="72" width="60" height="38" rx="6" fill="#9c6b3f" />
            <rect x="896" y="84" width="22" height="16" rx="3" fill="#f5c453" />
          </g>
        </svg>
        <div className="scene-inner">
          <Pet mode="idle" size={110} bob className="arrival-pet" />
          <h1>Oh! There you are.</h1>
          <Speech>
            I was hoping you would find your way here. Come in &mdash; my
            little treehouse is your little treehouse.
          </Speech>
          <a className="path-hint" href="#meet">
            follow the path
            <span className="path-hint-arrow" aria-hidden="true">↓</span>
          </a>
        </div>
      </header>

      <div className="path" aria-hidden="true" />

      {/* 2. Meeting */}
      <Scene id="meet" className="scene--meet">
        <div className="meet-stage">
          <div className="meet-pet">
            <Pet mode={named ? "happy" : "idle"} size={92} bob />
          </div>
          <div className="sign">
            <div className="sign-board">
              {named ? (
                <>
                  <Speech>
                    {buddy}! I love it. And I will call you {me} &mdash; I
                    promise to remember both.
                  </Speech>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => setNamed(false)}
                  >
                    change our names
                  </button>
                </>
              ) : (
                <>
                  <h2>I don&rsquo;t have a name yet.</h2>
                  <p>Perhaps you could give me one?</p>
                  <form
                    className="name-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (canConfirm) confirmNames();
                    }}
                  >
                    <label>
                      <span>What should I be called?</span>
                      <input
                        type="text"
                        value={petName}
                        maxLength={24}
                        placeholder="a name for me"
                        onChange={(e) => setPetName(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      <span>And what should I call you?</span>
                      <input
                        type="text"
                        value={humanName}
                        maxLength={24}
                        placeholder="your name, or anything warm"
                        onChange={(e) => setHumanName(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="btn" disabled={!canConfirm}>
                      Nice to meet you
                    </button>
                  </form>
                </>
              )}
            </div>
            <div className="sign-post" aria-hidden="true" />
          </div>
        </div>
      </Scene>

      {/* 3. Exploring */}
      <Scene className="scene--moments">
        <h2 className="scene-title">
          This is how we&rsquo;ll live together, {me}.
        </h2>
        <p className="scene-lead">
          I can keep you company, remind you to look after yourself, and rest
          beside you when the day feels long.
        </p>
        <div className="shelves">
          {MOMENTS.map((m) => (
            <div className="shelf" key={m.key}>
              <div className="shelf-sprite">
                <Pet mode={m.mode} size={78} />
                {m.badge && (
                  <span className="mood" aria-hidden="true">
                    {m.badge}
                  </span>
                )}
              </div>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
              <p className="shelf-tip">{m.tip}</p>
              <div className="shelf-wood" aria-hidden="true" />
            </div>
          ))}
        </div>
      </Scene>

      {/* 4. Taking home */}
      <Scene id="home" className="scene--chest">
        <div className="chest">
          <div className="chest-lid" aria-hidden="true" />
          <div className="chest-body">
            <h2>My room is ready.</h2>
            <p>
              Would you like to invite me home? I fit in one small download.
            </p>
            <div className="os-row" role="group" aria-label="Your computer">
              <button
                type="button"
                className={`os-chip ${os === "windows" ? "os-chip--active" : ""}`}
                onClick={() => setOs("windows")}
                aria-pressed={os === "windows"}
              >
                Windows
              </button>
              <span className="os-chip os-chip--waiting" aria-disabled="true">
                macOS — still napping in the forest
              </span>
              <span className="os-chip os-chip--waiting" aria-disabled="true">
                Linux — still napping in the forest
              </span>
            </div>
            <a className="btn btn--glow" href={DOWNLOAD_URL}>
              Invite me home
            </a>
            <p className="chest-note">
              A Windows installer is the first little door. macOS and Linux
              will open theirs soon &mdash; I would never send you to an empty
              room.
            </p>
          </div>
        </div>
      </Scene>

      {/* 5. Getting started */}
      <Scene className="scene--steps">
        <div className="instruction-card">
          <h2>Once I arrive&hellip;</h2>
          <p>
            open the installer and follow the little trail of steps. Then I
            will find a cozy corner on your desktop.
          </p>
          <ol className="steps">
            <li>
              <h3>Bring me down</h3>
              <p>Download the installer from the chest above.</p>
            </li>
            <li>
              <h3>Open the trail</h3>
              <p>Run it and follow the installation prompts.</p>
            </li>
            <li>
              <h3>Find me</h3>
              <p>
                Launch Desktop Buddy. I will hop onto your desktop, and you can
                move me, pet me, and remind me of our names.
              </p>
            </li>
          </ol>
        </div>
      </Scene>

      {/* 6. Goodbye */}
      <footer className="scene scene--goodbye" data-reveal>
        <div className="scene-inner">
          <div className="goodbye-light" aria-hidden="true" />
          <Pet mode="idle" size={100} bob />
          <Speech>
            I&rsquo;ll be waiting in your corner of the world, {me}. Come visit
            me whenever you need a little company.
          </Speech>
          <a className="btn" href={DOWNLOAD_URL}>Take me with you</a>
          <p className="goodbye-revisit">
            <a href="#meet">Start the story again</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
