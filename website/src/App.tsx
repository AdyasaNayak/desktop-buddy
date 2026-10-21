import { useEffect, useState } from "react";
<<<<<<< HEAD
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
=======
import { Pet } from "./Pet";
import "./App.css";

const DOWNLOAD_URL = "https://github.com/AdyasaNayak/desktop-buddy/releases";
const RELEASES_API =
  "https://api.github.com/repos/AdyasaNayak/desktop-buddy/releases?per_page=10";
const ISSUES_URL = "https://github.com/AdyasaNayak/desktop-buddy/issues";
const REPO_URL = "https://github.com/AdyasaNayak/desktop-buddy";
const CLONE_CMD =
  "git clone https://github.com/AdyasaNayak/desktop-buddy && cd desktop-buddy && npm install && npm run desktop";

type ReleaseAsset = { name: string; browser_download_url: string };
type GithubRelease = { tag_name?: string; assets?: ReleaseAsset[] };

/** The newest release's Windows installer, if one has been published. */
function findInstaller(releases: GithubRelease[]) {
  for (const release of releases) {
    const installer = (release.assets ?? []).find(
      (asset) => /\.exe$/i.test(asset.name) && !/\.blockmap$/i.test(asset.name),
    );
    if (installer) return { url: installer.browser_download_url, tag: release.tag_name };
  }
  return null;
}

const BUBBLES = [
  "psst… i heard your desktop is very cozy.",
  "i can sit, sip, and purr. professionally.",
  "take me home and i will love you forever.",
  "your cursor looked lonely. i can fix that.",
  "i promise to remind you to drink water.",
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Desktop Buddy really free?",
    a: "Yes. Free and open source, forever. The cat works for head pats and the occasional sip of water.",
  },
  {
    q: "Which platforms does it run on?",
    a: "Windows right now. macOS and Linux versions are on the way — the cat is still learning to walk on other roofs.",
  },
  {
    q: "Will it slow my computer down?",
    a: "Nope. It is a tiny app that naps quietly in a corner of your screen. Your CPU will not even notice it moved in.",
  },
  {
    q: "What can the little cat actually do?",
    a: "It keeps you company while you work, takes adorable drink breaks, pins gentle reminders to your screen, and showers you with hearts when you pet it.",
  },
  {
    q: "Can I give the cat a name?",
    a: "Of course. Once it moves in, you can name it — and name yourself too. Cats forget nothing, except maybe Tuesdays.",
  },
  {
    q: "How do I report a bug or ask something?",
    a: "Use the form below, or open an issue on GitHub. The cat reads every single one (with supervision).",
  },
];

const FLOATIES: {
  icon: "heart" | "sparkle" | "flower" | "moon";
  left: string;
  top: string;
  size: string;
  color: string;
  delay: string;
  dur: string;
}[] = [
  { icon: "heart", left: "6%", top: "18%", size: "1.2rem", color: "var(--sky)", delay: "0s", dur: "7s" },
  { icon: "sparkle", left: "15%", top: "56%", size: "0.9rem", color: "var(--lilac)", delay: "1.2s", dur: "8s" },
  { icon: "flower", left: "25%", top: "28%", size: "1.1rem", color: "var(--sky)", delay: "2.1s", dur: "6.5s" },
  { icon: "moon", left: "82%", top: "20%", size: "1.1rem", color: "var(--lilac)", delay: "0.6s", dur: "7.5s" },
  { icon: "sparkle", left: "90%", top: "50%", size: "1rem", color: "var(--sun)", delay: "1.8s", dur: "6s" },
  { icon: "heart", left: "73%", top: "64%", size: "1rem", color: "var(--sky)", delay: "2.8s", dur: "8.5s" },
  { icon: "flower", left: "45%", top: "10%", size: "1.2rem", color: "var(--sky)", delay: "3.2s", dur: "7s" },
  { icon: "sparkle", left: "58%", top: "72%", size: "0.9rem", color: "var(--lilac)", delay: "0.9s", dur: "9s" },
];

function PawIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="15.8" rx="5.4" ry="4.4" />
      <ellipse cx="4.9" cy="10" rx="2.2" ry="2.9" transform="rotate(-20 4.9 10)" />
      <ellipse cx="9.6" cy="6.8" rx="2.2" ry="3" />
      <ellipse cx="14.4" cy="6.8" rx="2.2" ry="3" />
      <ellipse cx="19.1" cy="10" rx="2.2" ry="2.9" transform="rotate(20 19.1 10)" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 21.3C7.4 18 1.6 13.6 1.6 8.7 1.6 5.6 4 3.4 6.8 3.4c1.9 0 3.7 1 5.2 3.1 1.5-2.1 3.3-3.1 5.2-3.1 2.8 0 5.2 2.2 5.2 5.3 0 4.9-5.8 9.3-10.4 12.6Z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6Z" />
    </svg>
  );
}

function FlowerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      <g fill="var(--sky)">
        <circle cx="12" cy="5.5" r="4" />
        <circle cx="5.5" cy="10.2" r="4" />
        <circle cx="18.5" cy="10.2" r="4" />
        <circle cx="8" cy="17.5" r="4" />
        <circle cx="16" cy="17.5" r="4" />
      </g>
      <circle cx="12" cy="12" r="3.4" fill="var(--sun)" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M20.7 14.9A9.2 9.2 0 0 1 9.1 3.3 9.2 9.2 0 1 0 20.7 14.9Z" />
    </svg>
  );
}

const FLOATY_ICONS = { heart: HeartIcon, sparkle: SparkleIcon, flower: FlowerIcon, moon: MoonIcon };

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
      { threshold: 0.2 },
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

function Floaties() {
  return (
    <div className="floaties" aria-hidden="true">
      {FLOATIES.map((f, i) => {
        const Icon = FLOATY_ICONS[f.icon];
        return (
          <span
            key={i}
            style={{
              left: f.left,
              top: f.top,
              fontSize: f.size,
              color: f.color,
              animationDelay: f.delay,
              animationDuration: f.dur,
            }}
          >
            <Icon />
          </span>
        );
      })}
    </div>
  );
}

function PawTrail() {
  return (
    <div className="paw-trail" aria-hidden="true">
      <PawIcon />
      <PawIcon />
      <PawIcon />
      <PawIcon />
      <PawIcon />
    </div>
  );
}

export default function App() {
  const [bubble, setBubble] = useState(0);
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [installer, setInstaller] = useState<{ url: string; tag?: string } | null>(null);

  useReveal();

  useEffect(() => {
    let cancelled = false;
    fetch(RELEASES_API)
      .then((res) => (res.ok ? res.json() : null))
      .then((releases: GithubRelease[] | null) => {
        if (!cancelled && Array.isArray(releases)) setInstaller(findInstaller(releases));
      })
      .catch(() => {
        // offline or rate-limited — keep pointing at the releases page
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(
      () => setBubble((b) => (b + 1) % BUBBLES.length),
      5000,
    );
    return () => clearInterval(timer);
  }, []);

  const sendQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    const title = text.length > 70 ? `${text.slice(0, 70)}…` : text;
    const body = `${text}${sender.trim() ? `\n\n— ${sender.trim()}` : ""}\n\n(sent from the desktop-buddy website)`;
    const url = `${ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="world">
      {/* sticky sticker nav */}
      <nav className="topnav" aria-label="Site">
        <a className="nav-logo" href="#" aria-label="desktop-buddy">
          <Pet mode="idle" size={30} />
          <span>desktop-buddy</span>
        </a>
        <a href="#download">download</a>
        <a href="#faq">faq</a>
        <a href="#contact">contact</a>
      </nav>

      {/* hero: the cat itself */}
      <header id="download" className="hero">
        <Floaties />
        <div className="hero-inner">
          <div className="hero-pet">
            <Speech key={bubble}>{BUBBLES[bubble]}</Speech>
            <Pet mode="happy" size={132} bob />
          </div>
          <h1>
            a tiny pixel cat<br />
            for your desktop
          </h1>
          <p className="hero-sub">
            Desktop Buddy is a small, free, open-source cat who naps in a
            corner of your screen, sips water, reminds you of things, and
            loves you forever. No account. No cloud. Just a cat.
          </p>
          <div className="hero-cta">
            <a className="btn btn--big" href={installer?.url ?? DOWNLOAD_URL}>
              <svg className="btn-arrow" viewBox="0 0 16 16" width="0.85em" height="0.85em" aria-hidden="true" focusable="false">
                <path d="M8 2v9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M3.8 7.6 8 11.8l4.2-4.2" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              download for windows
            </a>
            {installer ? (
              <p className="cta-note">
                desktop buddy {installer.tag ?? ""} · windows installer · free and open source
              </p>
            ) : (
              <p className="cta-note">
                the first installer is still baking — it will land right on this button the
                moment a release ships
              </p>
            )}
            {!installer && (
              <p className="cta-note">
                can&rsquo;t wait? run me from source: <code>{CLONE_CMD}</code>
              </p>
            )}
            <p className="cta-note cta-note--soon">
              mac and linux are still learning to walk — coming soon!
            </p>
          </div>
        </div>
      </header>

      <PawTrail />

      {/* FAQ */}
      <section id="faq" className="section" data-reveal>
        <div className="section-head">
          <h2>curious? so is the cat</h2>
          <p className="section-sub">
            the questions everyone asks before adopting a desktop cat.
          </p>
        </div>
        <div className="faq-list">
          {FAQS.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>
                <span>{item.q}</span>
                <span className="faq-mark" aria-hidden="true">+</span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <PawTrail />

      {/* contact */}
      <section id="contact" className="section" data-reveal>
        <div className="section-head">
          <h2>questions? the cat is listening</h2>
          <p className="section-sub">
            bugs, ideas, or just a hello — everything lands with the cat&rsquo;s
            human.
          </p>
        </div>
        <div className="contact-card">
          <div className="peek" aria-hidden="true">
            <Pet mode="idle" size={62} bob />
          </div>
          <form className="query-form" onSubmit={sendQuery}>
            <label>
              your name (optional)
              <input
                type="text"
                value={sender}
                maxLength={40}
                placeholder="what should the cat call you?"
                onChange={(e) => setSender(e.target.value)}
              />
            </label>
            <label>
              your question, idea, or hello
              <textarea
                value={message}
                required
                rows={5}
                maxLength={2000}
                placeholder="purr what is on your mind…"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <button type="submit" className="btn">
              <PawIcon /> send my question
            </button>
            <p className="form-note">
              this opens a prefilled GitHub issue — nothing is sent until you
              press the final button there.
            </p>
          </form>
          <p className="contact-alt">
            prefer to look around first?{" "}
            <a href={ISSUES_URL}>browse existing questions and issues</a>.
          </p>
        </div>
      </section>

      <footer className="footer">
        <p className="footer-paws" aria-hidden="true">
          <PawIcon /> <HeartIcon /> <PawIcon />
        </p>
        <p className="footer-line">
          made with love and far too many cat naps —{" "}
          <a href={REPO_URL}>desktop-buddy on GitHub</a>
        </p>
        <p className="footer-note">
          no cats were overworked in the making of this website.
        </p>
>>>>>>> origin/buildful/in-the-website-folder-can-you-create-my--838000
      </footer>
    </main>
  );
}
