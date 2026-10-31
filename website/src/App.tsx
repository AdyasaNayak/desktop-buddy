import { useEffect, useState } from "react";
import { Pet, type PetType } from "./Pet";
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
    "take me home. my cheeks are full of sunshine.",
    "your cursor looked lonely. i can fix that.",
    "i promise to remind you to drink water.",
  ],
};

const PET_CHOICES: { id: PetType; label: string }[] = [
  { id: "cat", label: "cat" },
  { id: "star", label: "star" },
  { id: "hamster", label: "hamster" },
];

/** Each pet keeps its own scale so their real-world size stays consistent. */
const NAV_SIZE: Record<PetType, number> = { cat: 30, star: 24, hamster: 26 };
const HERO_SIZE: Record<PetType, number> = { cat: 132, star: 92, hamster: 96 };
const CHIP_SIZE: Record<PetType, number> = { cat: 28, star: 18, hamster: 20 };
const PEEK_SIZE: Record<PetType, number> = { cat: 62, star: 46, hamster: 52 };

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Desktop Buddy really free?",
    a: "Yes. Free and open source, forever. The cat works for head pats, the star runs on tea and compliments, and the hamster accepts payment in sunflower seeds.",
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
    a: "Of course. Once it moves in, you can name it — and name yourself too. Cats forget nothing, except maybe Tuesdays. The star remembers everything. The hamster remembers where the snacks are.",
  },
  {
    q: "How do I report a bug or ask something?",
    a: "Use the form below, or open an issue on GitHub. Your buddy reads every single one (with supervision).",
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
  const [pet, setPet] = useState<PetType>("cat");
  const [bubble, setBubble] = useState(0);
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [installer, setInstaller] = useState<{ url: string; tag?: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

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
      () => setBubble((b) => (b + 1) % BUBBLES[pet].length),
      5000,
    );
    return () => clearInterval(timer);
  }, [pet]);

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
          <Pet pet={pet} mode="idle" size={NAV_SIZE[pet]} />
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
            <Speech key={`${pet}-${bubble}`}>
              {BUBBLES[pet][bubble % BUBBLES[pet].length]}
            </Speech>
            <div className="hero-pet-stage">
              <Pet
                pet={pet}
                mode={pet === "cat" ? "happy" : "idle"}
                size={HERO_SIZE[pet]}
                bob
              />
            </div>
            <div className="pet-switch" role="group" aria-label="Preview a buddy">
              <div className="pet-switch__buttons">
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
                    <Pet pet={choice.id} mode="idle" size={CHIP_SIZE[choice.id]} />
                    <span>{choice.label}</span>
                  </button>
                ))}
              </div>
              <p className="pet-switch__note">
                same download. pick a buddy on first launch, switch anytime.
              </p>
            </div>
          </div>
          <h1>
            a tiny pixel {pet}<br />
            for your desktop
          </h1>
          <p className="hero-sub">
            Desktop Buddy is a small, free, open-source companion who naps in
            a corner of your screen, sips water, reminds you of things, and
            loves you forever. No account. No cloud. Just a buddy.
          </p>
          <div className="hero-cta">
            <a
              className="btn btn--big"
              href={installer?.url ?? DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                // only a real installer download gets the setup guide
                if (installer) setShowGuide(true);
              }}
            >
              <svg className="btn-arrow" viewBox="0 0 16 16" width="0.85em" height="0.85em" aria-hidden="true" focusable="false">
                <path d="M8 2v9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M3.8 7.6 8 11.8l4.2-4.2" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              download for windows
            </a>
            {installer ? (
              <p className="cta-note">
                desktop buddy {installer.tag ?? ""} · windows installer · cat + star + hamster · free and open source
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
            {showGuide && installer && (
              <div className="download-guide" role="note">
                <p className="download-guide__title">
                  <SparkleIcon /> the installer is on its way!
                </p>
                <ol>
                  <li>
                    <strong>find it in your downloads.</strong> every browser keeps it in one
                    place — the downloads bubble next to the address bar, the downloads bar at
                    the bottom, or <kbd>ctrl</kbd>+<kbd>j</kbd>.
                  </li>
                  <li>
                    <strong>click it to start setup.</strong> browsers never run downloads by
                    themselves (that keeps you safe) — one click from you does it. if windows
                    shows a “unknown publisher” warning, choose <em>more info → run anyway</em>
                    — the app is new, not scary.
                  </li>
                  <li>
                    <strong>say hi to your buddy.</strong> the setup wizard asks
                    who&rsquo;s moving in — cat, star, or hamster — then their name and yours.
                    with &ldquo;run desktop buddy&rdquo; left checked on the last
                    step, your buddy pops onto your screen the moment it finishes
                    installing.
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </header>

      <PawTrail />

      {/* FAQ */}
      <section id="faq" className="section" data-reveal>
        <div className="section-head">
          <h2>curious? so is your buddy</h2>
          <p className="section-sub">
            the questions everyone asks before adopting a desktop buddy.
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
          <h2>questions? your buddy is listening</h2>
          <p className="section-sub">
            bugs, ideas, or just a hello — everything lands with your
            buddy&rsquo;s human.
          </p>
        </div>
        <div className="contact-card">
          <div className="peek" aria-hidden="true">
            <Pet pet={pet} mode="idle" size={PEEK_SIZE[pet]} bob />
          </div>
          <form className="query-form" onSubmit={sendQuery}>
            <label>
              your name (optional)
              <input
                type="text"
                value={sender}
                maxLength={40}
                placeholder="what should your buddy call you?"
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
                placeholder="tell us what is on your mind…"
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
          made with love, cat naps, stardust, and sunflower seeds —{" "}
          <a href={REPO_URL}>desktop-buddy on GitHub</a>
        </p>
        <p className="footer-note">
          no cats, stars, or hamsters were overworked in the making of this website.
        </p>
      </footer>
    </main>
  );
}
