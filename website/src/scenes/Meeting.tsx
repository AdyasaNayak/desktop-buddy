import { useState } from "react";
import Pet from "../components/Pet";
import { sanitizeName, type Names } from "../names";

interface MeetingProps {
  names: Names;
  onNames: (names: Names) => void;
  onContinue: () => void;
}

export default function Meeting({ names, onNames, onContinue }: MeetingProps) {
  const [petName, setPetName] = useState(names.petName);
  const [yourName, setYourName] = useState(names.yourName);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextPetName = sanitizeName(petName, "");
    const nextYourName = sanitizeName(yourName, "");
    if (!nextPetName || !nextYourName) {
      setError("Please give us both a name — I will wait, I am patient.");
      return;
    }
    setError("");
    setConfirmed(true);
    onNames({ petName: nextPetName, yourName: nextYourName });
  }

  return (
    <section className="stage" aria-labelledby="meeting-title">
      <h1 id="meeting-title" className="scene-title">
        A name for a small friend
      </h1>
      <div className="treehouse">
        <div className="treehouse-roof" />
        <Pet mood={confirmed ? "happy" : "idle"} />
        <div className="treehouse-floor" />
      </div>
      <div className="dialogue" role="status">
        {confirmed ? (
          <p>
            <span className="pet-name">{names.petName}</span>... I love it! And
            I will call you <span className="pet-name">{names.yourName}</span>.
            Those names are tucked safely into my little satchel for when you
            take me home.
          </p>
        ) : (
          <p>
            I do not have a name yet. Perhaps you could give me one? And tell
            me what I should call you.
          </p>
        )}
      </div>
      {confirmed ? (
        <button type="button" className="story-btn" onClick={onContinue}>
          Show me around
        </button>
      ) : (
        <form className="panel name-form" onSubmit={handleSubmit}>
          <label>
            What should your pet be called?
            <input
              value={petName}
              onChange={(event) => setPetName(event.target.value)}
              maxLength={24}
              placeholder="e.g. Mochi"
              aria-label="Pet name"
            />
          </label>
          <label>
            What should your pet call you?
            <input
              value={yourName}
              onChange={(event) => setYourName(event.target.value)}
              maxLength={24}
              placeholder="e.g. Captain"
              aria-label="Your name"
            />
          </label>
          {error && <p className="name-error" role="alert">{error}</p>}
          <button type="submit" className="story-btn">
            Confirm our names
          </button>
        </form>
      )}
    </section>
  );
}
