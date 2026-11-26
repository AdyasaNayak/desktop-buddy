import { PixelIcon, type PixelIconName } from "../PixelIcon";

/**
 * The menu that opens when the buddy is clicked: four big actions as icon
 * tiles, and the housekeeping actions in a quieter row underneath.
 */
export function BuddyMenu({
  petName,
  error,
  working,
  alwaysOnTop,
  onWater,
  onWork,
  onReminders,
  onSleep,
  onRename,
  onChangePet,
  onToggleOnTop,
  onHide,
  onQuit,
}: {
  petName: string;
  error: string;
  working: boolean;
  alwaysOnTop: boolean;
  onWater: () => void;
  onWork: () => void;
  onReminders: () => void;
  onSleep: () => void;
  onRename: () => void;
  onChangePet: () => void;
  onToggleOnTop: () => void;
  onHide: () => void;
  onQuit: () => void;
}) {
  return (
    <div
      className="buddy-pop buddy-menu"
      role="menu"
      aria-label={`${petName}'s menu`}
    >
      {error && (
        <p className="buddy-menu__error" role="alert">
          {error}
        </p>
      )}
      <div className="buddy-menu__tiles">
        <MenuTile icon="water" label="Water" autoFocus onClick={onWater} />
        <MenuTile
          icon="work"
          label={working ? "Working" : "Focus"}
          active={working}
          onClick={onWork}
        />
        <MenuTile icon="bell" label="Reminders" onClick={onReminders} />
        <MenuTile icon="moon" label="Sleep" onClick={onSleep} />
      </div>
      <div className="buddy-menu__more">
        <button
          type="button"
          role="menuitem"
          className="buddy-link"
          onClick={onRename}
        >
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          className="buddy-link"
          onClick={onChangePet}
        >
          Change pet
        </button>
        <button
          type="button"
          role="menuitemcheckbox"
          className="buddy-link buddy-link--toggle"
          aria-checked={alwaysOnTop}
          title={
            alwaysOnTop
              ? "Always on top is on. Turn it off to let full-screen apps and games cover the buddy."
              : "Always on top is off. Turn it on to keep the buddy above other windows."
          }
          onClick={onToggleOnTop}
        >
          <span className="buddy-link__dot" aria-hidden="true" />
          On top
        </button>
        <button
          type="button"
          role="menuitem"
          className="buddy-link"
          title="Hide in the system tray. Click the tray icon to bring me back."
          onClick={onHide}
        >
          Hide
        </button>
        <button
          type="button"
          role="menuitem"
          className="buddy-link buddy-link--danger"
          title="Quit Desktop Buddy"
          onClick={onQuit}
        >
          Quit
        </button>
      </div>
    </div>
  );
}

function MenuTile({
  icon,
  label,
  active = false,
  autoFocus = false,
  onClick,
}: {
  icon: PixelIconName;
  label: string;
  active?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`buddy-tile${active ? " buddy-tile--active" : ""}`}
      autoFocus={autoFocus}
      onClick={onClick}
    >
      <PixelIcon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}
