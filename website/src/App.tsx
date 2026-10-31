import { useEffect, useState } from "react";
import { Pet, type PetType } from "./Pet";
import "./App.css";

const DOWNLOAD_URL = "https://github.com/AdyasaNayak/desktop-buddy/releases";
const RELEASES_API =
  "https://api.github.com/repos/AdyasaNayak/desktop-buddy/releases?per_page=10";
const REPO_URL = "https://github.com/AdyasaNayak/desktop-buddy";
const CLONE_CMD =
  "git clone https://github.com/AdyasaNayak/desktop-buddy &&\ncd desktop-buddy && npm install && npm run desktop";

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

const BUBBLES: Record<PetType, string[]> = {
  cat: [
    "psst… i heard your desktop is very cozy.",
    "i can sit, sip, and purr. professionally.",
    "take me home and i will love you forever.",
    "your cursor looked lonely. i can fix that.",
    "i promise to remind you to drink water.",
  ],
  star: [
    "twinkle! your desktop looked dark from up here.",
    "i can glow, sip tea, and keep you company.",
    "take me home. i will bring the stardust.",
    "your cursor looked lonely. i can fix that.",
    "i promise to remind you to drink water.",
  ],
  hamster: [
    "squeak! your desktop smells like snacks.",
    "i can nibble, nap, and keep you company.",
    "take me home. i will bring the sunflower seeds.",
    "your cursor looked lonely. i can fix that.",
    "i promise to remind you to drink water.",
  ],
};

const PET_CHOICES: { id: PetType; label: string }[] = [
  { id: "cat", label: "Cat" },
  { id: "star", label: "Star" },
  { id: "hamster", label: "Hamster" },
];

/** Each pet keeps its own scale so their real-world size stays consistent. */
const NAV_SIZE: Record<PetType, number> = { cat: 25, star: 20, hamster: 20 };
const HERO_SIZE: Record<PetType, number> = { cat: 128, star: 90, hamster: 90 };
const CHIP_SIZE: Record<PetType, number> = { cat: 26, star: 18, hamster: 18 };
const FOOTER_SIZE: Record<PetType, number> = { cat: 82, star: 62, hamster: 62 };

const PERKS = [
  {
    icon: "moon",
    tone: "sky",
    title: "Naps in your corner",
    text: "A tiny, quiet companion. Your CPU won't even notice.",
  },
  {
    icon: "drop",
    tone: "sun",
    title: "Takes water breaks",
    text: "Sips away while nudging you to drink some too.",
  },
  {
    icon: "bell",
    tone: "pink",
    title: "Holds your reminders",
    text: "Little notes that turn up right when you need them.",
  },
  {
    icon: "heart",
    tone: "mint",
    title: "Gives out hearts",
    text: "Pet your buddy whenever the day needs softening.",
  },
] as const;

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Desktop Buddy really free?",
    a: "Yes. Free and open source, forever. The cat works for head pats, the star runs on tea and compliments, and the hamster accepts sunflower seeds.",
  },
  {
    q: "Which platforms does it run on?",
    a: "Windows right now. macOS and Linux versions are on the way — the buddies are still learning to walk on other roofs.",
  },
  {
    q: "Will it slow my computer down?",
    a: "Nope. It is a tiny app that naps quietly in a corner of your screen. Your CPU will not even notice it moved in.",
  },
  {
    q: "What can my buddy actually do?",
    a: "It keeps you company while you work, takes adorable drink breaks, pins gentle reminders to your screen, and showers you with hearts when you pet it.",
  },
  {
    q: "Can I choose between the cat, star, and hamster?",
    a: "Yes. All three come in the same download. Pick one when you first set up Desktop Buddy, and switch pets anytime from the menu — your names and reminders stay put.",
  },
  {
    q: "Can I give my buddy a name?",
    a: "Of course. Once it moves in, you can name it — and name yourself too. Cats forget nothing, except maybe Tuesdays. The star remembers everything, and the hamster is already writing it down.",
  },
  {
    q: "How do I report a bug or ask something?",
    a: "Open an issue on GitHub — your buddy reads every single one (with supervision).",
  },
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

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M20.7 14.9A9.2 9.2 0 0 1 9.1 3.3 9.2 9.2 0 1 0 20.7 14.9Z" />
    </svg>
  );
}

function DropIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 1.8c3.5 4.7 7.2 9 7.2 13a7.2 7.2 0 0 1-14.4 0c0-4 3.7-8.3 7.2-13Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.2a2 2 0 0 1 2 2v.5a6.5 6.5 0 0 1 4.5 6.2v3.7l1.7 2.6a1 1 0 0 1-.8 1.6H4.6a1 1 0 0 1-.8-1.6l1.7-2.6v-3.7A6.5 6.5 0 0 1 10 4.7v-.5a2 2 0 0 1 2-2Z" />
      <path d="M9.6 20.2h4.8a2.4 2.4 0 0 1-4.8 0Z" />
    </svg>
  );
}

const PERK_ICONS = {
  moon: MoonIcon,
  drop: DropIcon,
  bell: BellIcon,
  heart: HeartIcon,
};

function Speech({ children }: { children: React.ReactNode }) {
  return (
    <div className="speech">
      <p>{children}</p>
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

function BranchArt() {
  return (
    <svg className="branch-art" viewBox="0 0 280 130" aria-hidden="true" focusable="false">
      <path
        d="M-8 104c62 0 96-42 162-32 42 6 76 0 134-30"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M63 88c-4-19-19-26-34-23 4 17 16 24 34 23Z"
        fill="var(--leaf-deep)"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M152 71c10-16 26-18 38-10-7 15-22 19-38 10Z"
        fill="var(--leaf)"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M207 64c-8-16-4-30 8-37 9 13 7 28-8 37Z"
        fill="var(--leaf-deep)"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M115 72c-10-13-24-14-34-6 8 12 21 14 34 6Z"
        fill="var(--leaf)"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="235" cy="32" r="9" fill="var(--sun)" stroke="var(--ink)" strokeWidth="3.5" />
    </svg>
  );
}

function AdoptStamp() {
  return (
    <div className="adopt-stamp" aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false">
        <circle cx="60" cy="60" r="56" fill="var(--sun)" stroke="var(--ink)" strokeWidth="3.5" />
        <defs>
          <path id="stamp-arc" d="M60 60m-42 0a42 42 0 1 1 84 0a42 42 0 1 1-84 0" />
        </defs>
        <text>
          <textPath href="#stamp-arc" startOffset="1.5%" textLength="252" lengthAdjust="spacing">
            TAKE ME HOME ✦ TAKE ME HOME ✦
          </textPath>
        </text>
      </svg>
      <span className="adopt-stamp__paw">
        <PawIcon />
      </span>
    </div>
  );
}

export default function App() {
  const [pet, setPet] = useState<PetType>("cat");
  const [bubble, setBubble] = useState(0);
  const [installer, setInstaller] = useState<{ url: string; tag?: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

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
      () => setBubble((b) => (b + 1) % BUBBLES[pet].length),
      5000,
    );
    return () => clearInterval(timer);
  }, [pet]);

  const handleDownload = () => {
    // only a real installer download gets the setup guide
    if (installer) setShowGuide(true);
  };

  return (
    <main className="world" id="top">
      <nav className="topnav" aria-label="Site">
        <a className="nav-logo" href="#top" aria-label="Desktop Buddy home">
          <span className="nav-logo__mark">
            <Pet pet={pet} mode="idle" size={NAV_SIZE[pet]} />
          </span>
          <span className="nav-logo__text">desktop-buddy</span>
        </a>

        <div className="nav-links">
          <a href="#faq">FAQ</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>

        <a
          className="nav-cta"
          href={installer?.url ?? DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
        >
          Download
        </a>
      </nav>

      <header id="download" className="hero">
        <div className="hero-copy">
          <h1>
            <span>Desktop</span>
            <span>Buddy</span>
          </h1>

          <p className="hero-lead">A tiny pixel friend for your desktop.</p>
          <p className="hero-sub">
            It naps in the corner of your screen, sips water, remembers the
            things you forget, and loves you forever. No account. No cloud.
            Just a buddy.
          </p>

          <div className="hero-cta">
            <a
              className="btn btn--big"
              href={installer?.url ?? DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleDownload}
            >
              <svg
                className="btn-arrow"
                viewBox="0 0 16 16"
                width="0.85em"
                height="0.85em"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M8 2v9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M3.8 7.6 8 11.8l4.2-4.2"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Download for Windows
            </a>
            <span className="cta-sticker">Cat + star + hamster inside</span>
          </div>

          {installer ? (
            <p className="cta-note">
              Desktop Buddy {installer.tag ?? ""} · Windows installer · free
              and open source
            </p>
          ) : (
            <p className="cta-note">
              The first installer is still baking. It will land right on this
              button the moment a release ships.
            </p>
          )}

          {!installer && (
            <p className="cta-note cta-note--source">
              Can&rsquo;t wait? Run me from source:
              <code>{CLONE_CMD}</code>
            </p>
          )}

          <p className="cta-note cta-note--soon">
            Mac and Linux are still learning to walk. Coming soon.
          </p>

          <p className="sr-only" aria-live="polite">
            {showGuide && installer
              ? "Setup guide added below the download button."
              : ""}
          </p>

          {showGuide && installer && (
            <div className="download-guide" role="note">
              <p className="download-guide__title">
                <SparkleIcon /> The installer is on its way!
              </p>
              <ol>
                <li>
                  <strong>Find it in your downloads.</strong> Every browser keeps
                  it in one place — the downloads bubble next to the address bar,
                  the downloads bar at the bottom, or <kbd>ctrl</kbd>+<kbd>j</kbd>.
                </li>
                <li>
                  <strong>Click it to start setup.</strong> Browsers never run
                  downloads by themselves (that keeps you safe), so one click
                  from you does it. If Windows shows an &ldquo;unknown
                  publisher&rdquo; warning, choose <em>more info → run anyway</em>.
                  The app is new, not scary.
                </li>
                <li>
                  <strong>Say hi to your buddy.</strong> The setup wizard asks
                  who&rsquo;s moving in — cat, star, or hamster — then their name and yours.
                  With &ldquo;run Desktop Buddy&rdquo; left checked on the last
                  step, your buddy pops onto your screen the moment it finishes
                  installing.
                </li>
              </ol>
            </div>
          )}
        </div>

        <aside className="pet-card" aria-label="Preview a buddy">
          <AdoptStamp />

          <Speech key={`${pet}-${bubble}`}>
            {BUBBLES[pet][bubble % BUBBLES[pet].length]}
          </Speech>

          <div className="pet-window">
            <BranchArt />
            <div className="hero-pet-stage">
              <Pet
                pet={pet}
                mode={pet === "cat" ? "happy" : "idle"}
                size={HERO_SIZE[pet]}
                bob
              />
            </div>
          </div>

          <div className="pet-switch">
            <div className="pet-switch__buttons" role="group" aria-label="Preview a buddy">
              {PET_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`pet-chip${pet === choice.id ? " is-active" : ""}`}
                  aria-pressed={pet === choice.id}
                  onClick={() => {
                    setPet(choice.id);
                    setBubble(0);
                  }}
                >
                  <Pet
                    pet={choice.id}
                    mode="idle"
                    size={CHIP_SIZE[choice.id]}
                  />
                  <span>{choice.label}</span>
                </button>
              ))}
            </div>
            <p className="pet-switch__note">
              One download. Pick a buddy on first launch, switch anytime.
            </p>
          </div>
        </aside>
      </header>

      <section className="perks">
        <h2 className="sr-only">What a Desktop Buddy does</h2>
        {PERKS.map((perk) => {
          const Icon = PERK_ICONS[perk.icon];
          return (
            <article className={`perk perk--${perk.tone}`} key={perk.title}>
              <span className="perk__icon">
                <Icon />
              </span>
              <div>
                <h3>{perk.title}</h3>
                <p>{perk.text}</p>
              </div>
            </article>
          );
        })}
      </section>

      <PawTrail />

      <section id="faq" className="faq-section">
        <div className="faq-head">
          <h2>Before you adopt</h2>
          <p>
            Everything people ask before letting a tiny buddy move in.
          </p>
        </div>

        <div className="faq-list">
          {FAQS.map((item, index) => (
            <details className={`faq-item faq-item--${index % 3}`} key={item.q}>
              <summary>
                <span className="faq-q">{item.q}</span>
                <span className="faq-mark" aria-hidden="true">
                  <span />
                </span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="footer-copy">
          <h2>See you in the corner.</h2>
          <p className="footer-line">
            Made with love, cat naps, a little stardust, and a pocket of
            seeds.{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Visit Desktop Buddy on GitHub
            </a>
            .
          </p>
          <p className="footer-note">
            No cats, stars, or hamsters were overworked in the making of this
            website.
          </p>
        </div>

        <div className="footer-pet" aria-hidden="true">
          <span className="footer-bubble">bye for now!</span>
          <Pet pet={pet} mode="happy" size={FOOTER_SIZE[pet]} bob />
        </div>
      </footer>

      <div className="world-foot" aria-hidden="true">
        <PawIcon />
        <PawIcon />
        <PawIcon />
      </div>
    </main>
  );
}
