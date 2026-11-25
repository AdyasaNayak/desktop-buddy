import { PetPreview } from "../PetPreview";
import {
  PETS,
  PET_PREVIEW_SIZE,
  PET_TYPES,
  type PetType,
} from "../../pet/pets";

/** Lets the user swap which buddy lives on the desktop. */
export function PetPickerDialog({
  activePet,
  pending,
  error,
  onPick,
  onCancel,
}: {
  activePet: PetType;
  pending: boolean;
  error: string;
  onPick: (pet: PetType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="buddy-dialog">
      <div
        className="buddy-panel buddy-panel--pets"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pet-dialog-title"
      >
        <h2 id="pet-dialog-title" className="buddy-panel__title">
          Who's moving in?
        </h2>
        <div className="pet-picker">
          {PET_TYPES.map((id) => (
            <PetChoice
              key={id}
              pet={id}
              selected={activePet === id}
              disabled={pending}
              onClick={() => onPick(id)}
            />
          ))}
        </div>
        {error && (
          <p className="buddy-panel__error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--block"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PetChoice({
  pet,
  selected,
  disabled,
  onClick,
}: {
  pet: PetType;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pet-option"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="pet-option__preview">
        <PetPreview pet={pet} size={PET_PREVIEW_SIZE[pet].card} />
      </span>
      <span>{PETS[pet].label}</span>
      <span className="pet-option__badge" aria-hidden="true">
        with me
      </span>
    </button>
  );
}
