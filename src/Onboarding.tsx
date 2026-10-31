import { useState, type FormEvent } from "react";
import { PetPreview } from "./PetPreview";
import { PETS, PET_PREVIEW_SIZE, PET_TYPES, type PetType } from "./pets";

export interface OnboardingResult {
  petType: PetType;
  petName: string;
  yourName: string;
  startWithWindows: boolean;
}

/**
 * First-run setup and the rename form. The window is resized by App to match
 * whichever mode this is in, so everything here must fit without scrolling.
 */
export function Onboarding({
  mode,
  initialPet,
  initialPetName = "",
  initialYourName = "",
  onSave,
  onCancel,
  onQuit,
}: {
  mode: "welcome" | "rename";
  initialPet: PetType;
  initialPetName?: string;
  initialYourName?: string;
  onSave: (result: OnboardingResult) => void;
  onCancel?: () => void;
  onQuit?: () => void;
}) {
  const [step, setStep] = useState<"pick" | "names">(mode === "rename" ? "names" : "pick");
  const [petType, setPetType] = useState(initialPet);
  const [petName, setPetName] = useState(initialPetName);
  const [yourName, setYourName] = useState(initialYourName);
  const [startWithWindows, setStartWithWindows] = useState(true);

  const shownPet = mode === "rename" ? initialPet : petType;
  const showLaunchOption = mode === "welcome" && Boolean(window.desktopBuddy?.isPackaged);

  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      petType: shownPet,
      petName,
      yourName,
      startWithWindows: showLaunchOption && startWithWindows,
    });
  };

  return (
    <div className="setup">
      <div className="setup__bar">
        <span className="setup__wordmark">Desktop Buddy</span>
        <div className="setup__bar-end">
          {mode === "welcome" && (
            <span className="setup__step">step {step === "pick" ? "1" : "2"} of 2</span>
          )}
          {onQuit && (
            <button
              type="button"
              className="setup__quit"
              onClick={onQuit}
              aria-label="Quit Desktop Buddy"
              title="Quit Desktop Buddy"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="setup__main">
        {step === "pick" ? (
          <form
            className="setup__card"
            onSubmit={(event) => {
              event.preventDefault();
              setStep("names");
            }}
          >
            <div className="setup__stage" aria-hidden="true">
              <PetPreview
                pet={petType}
                size={PET_PREVIEW_SIZE[petType].stage}
                className="setup__pet"
              />
            </div>

            <h1 className="setup__title">Who's moving in?</h1>
            <p className="setup__lede">Pick the little buddy who'll keep you company.</p>

            <div className="pet-picker" role="group" aria-label="Choose your buddy">
              {PET_TYPES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="pet-option"
                  aria-pressed={petType === id}
                  onClick={() => setPetType(id)}
                >
                  <span className="pet-option__preview">
                    <PetPreview pet={id} size={PET_PREVIEW_SIZE[id].card} />
                  </span>
                  <span>{PETS[id].label}</span>
                  <span className="pet-option__badge" aria-hidden="true">
                    with me
                  </span>
                </button>
              ))}
            </div>

            <p className="setup__note">You can switch buddies any time from my menu.</p>

            <button className="btn btn--primary btn--block" type="submit">
              Name my buddy
            </button>
            <p className="setup__foot">A tiny friend on your desktop. No account needed.</p>
          </form>
        ) : (
          <form className="setup__card" onSubmit={save}>
            <div className="setup__stage">
              <p className="setup__say">
                {mode === "rename" ? "let's fix my name" : "hi! i'm your new buddy"}
              </p>
              <PetPreview
                pet={shownPet}
                size={PET_PREVIEW_SIZE[shownPet].stage}
                className="setup__pet"
              />
            </div>

            <h1 className="setup__title">
              {mode === "rename" ? "What should I be called?" : "Give us both a name."}
            </h1>

            <div className="field">
              <label className="field__label" htmlFor="buddy-pet-name">
                {mode === "rename" ? "My name" : "Your buddy's name"}
              </label>
              <input
                id="buddy-pet-name"
                className="field__input"
                autoFocus
                placeholder="Mochi"
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="buddy-pet-name-help"
                value={petName}
                onChange={(event) => setPetName(event.target.value)}
              />
              <span id="buddy-pet-name-help" className="field__help">
                Leave it blank and I'll go by Mochi.
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="buddy-human-name">
                What should I call you?
              </label>
              <input
                id="buddy-human-name"
                className="field__input"
                placeholder="Your name (optional)"
                maxLength={20}
                autoComplete="nickname"
                value={yourName}
                onChange={(event) => setYourName(event.target.value)}
              />
            </div>

            {showLaunchOption && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={startWithWindows}
                  onChange={(event) => setStartWithWindows(event.target.checked)}
                />
                start me when my computer turns on
              </label>
            )}

            <div className="setup__actions">
              <button className="btn btn--primary btn--block" type="submit">
                {mode === "rename" ? "Save name" : "Move in"}
              </button>
              {mode === "welcome" ? (
                <button
                  className="btn btn--ghost btn--block"
                  type="button"
                  onClick={() => setStep("pick")}
                >
                  Choose a different buddy
                </button>
              ) : (
                <button className="btn btn--ghost btn--block" type="button" onClick={onCancel}>
                  Cancel
                </button>
              )}
            </div>

            <p className="setup__foot">You can change your names later from my menu.</p>
          </form>
        )}
      </div>
    </div>
  );
}
