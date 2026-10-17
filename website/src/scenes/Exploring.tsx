import { useEffect, useState } from "react";
import Pet, { type PetMood } from "../components/Pet";
import type { Names } from "../names";

interface ExploringProps {
  names: Names;
  onContinue: () => void;
}

const FEATURE_LABELS: Array<{ mood: PetMood; title: string; text: string }> = [
  {
    mood: "drink",
    title: "Drink breaks",
    text: "I will remind you to take little sips of water. Staying hydrated keeps tails swishy.",
  },
  {
    mood: "work",
    title: "Work mode",
    text: "I sit quietly in your corner while you work. When you need company, click me twice.",
  },
  {
    mood: "idle",
    title: "Reminders",
    text: "Pin a note on my wall and I will tap your screen gently when it is time.",
  },
  {
    mood: "idle",
    title: "Sleep mode",
    text: "When the day feels long, I curl up in my moonlit nook until you wake me.",
  },
];

export default function Exploring({ names, onContinue }: ExploringProps) {
  const [moodIndex, setMoodIndex] = useState(0);
  const mood = FEATURE_LABELS[moodIndex].mood;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setMoodIndex((index) => (index + 1) % FEATURE_LABELS.length),
      mood === "idle" ? 3000 : 2500,
    );
    return () => window.clearTimeout(timer);
  }, [moodIndex, mood]);

  return (
    <section className="stage" aria-labelledby="exploring-title">
      <h1 id="exploring-title" className="scene-title">
        A peek around my room
      </h1>
      <div className="treehouse">
        <div className="treehouse-roof" />
        <Pet mood={mood} />
        <div className="treehouse-floor" />
      </div>
      <div className="dialogue" role="status">
        <p>
          This is where I live, {names.yourName}. I can keep you company, remind
          you to look after yourself, and rest beside you when the day feels
          long. Have a look at what I do all day.
        </p>
      </div>
      <div className="features">
        {FEATURE_LABELS.map((feature) => (
          <div key={feature.title} className="feature-card">
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>
      <button type="button" className="story-btn" onClick={onContinue}>
        I think I am ready
      </button>
    </section>
  );
}
