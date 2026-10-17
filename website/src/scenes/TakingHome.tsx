import { useEffect, useState } from "react";
import Pet from "../components/Pet";
import type { Names } from "../names";

interface TakingHomeProps {
  names: Names;
  onContinue: () => void;
}

/** The only platform with a downloadable build today. */
const WINDOWS_RELEASE_URL =
  "https://github.com/AdyasaNayak/desktop-buddy/releases";

function detectPlatform(): "windows" | "mac" | "linux" | "other" {
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "other";
}

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
  other: "your device",
};

export default function TakingHome({ names, onContinue }: TakingHomeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [platform] = useState(detectPlatform);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="stage" aria-labelledby="taking-home-title">
      <h1 id="taking-home-title" className="scene-title">
        The little wooden chest
      </h1>
      <div className="treehouse">
        <div className={`chest ${isOpen ? "is-open" : ""}`}>
          <div className="chest-lid" />
          <div className="chest-body">
            <div className="chest-glow" />
          </div>
        </div>
        <Pet mood="idle" />
      </div>
      <div className="dialogue" role="status">
        <p>
          My room is packed and my satchel carries your names,{" "}
          {names.yourName}. Would you like to invite me home?
        </p>
      </div>
      <div className="panel">
        <h2>Choose your door</h2>
        <div className="os-options">
          <a
            className="story-btn story-btn--primary"
            href={WINDOWS_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Invite me home — Windows
          </a>
          <button type="button" className="os-option" disabled>
            macOS — not yet
          </button>
          <button type="button" className="os-option" disabled>
            Linux — not yet
          </button>
        </div>
        <p className="os-note">
          {platform === "windows"
            ? "I think I spotted a Windows window over there — that is the door for you."
            : `Right now my little paws only open the Windows door. I do not have a door for ${PLATFORM_LABELS[platform]} yet, but I am practicing every day.`}
        </p>
      </div>
      <button type="button" className="story-btn" onClick={onContinue}>
        I brought you home — what now?
      </button>
    </section>
  );
}
