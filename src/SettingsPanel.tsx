export interface StartupSettings {
  enabled: boolean;
  launchHidden: boolean;
}

export interface StartupSettingsResult extends StartupSettings {
  ok: boolean;
  error?: string;
}

export function SettingsPanel({
  settings,
  supported,
  error,
  onChange,
  onClose,
}: {
  settings: StartupSettings;
  supported: boolean;
  error: string;
  onChange: (enabled: boolean, launchHidden: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="buddy-dialog">
      <div
        className="buddy-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="buddy-panel__head">
          <h2 id="settings-dialog-title" className="buddy-panel__title">
            Settings
          </h2>
          <button
            type="button"
            className="buddy-close buddy-panel__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="buddy-setting">
          <label className="check buddy-setting__check">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={!supported}
              aria-describedby="startup-setting-help"
              onChange={(event) =>
                onChange(event.target.checked, settings.launchHidden)
              }
            />
            Start with Windows
          </label>
          <p id="startup-setting-help" className="buddy-panel__hint">
            {supported
              ? "Open Desktop Buddy automatically when you sign in."
              : "Available in the installed app."}
          </p>
          {supported && settings.enabled && (
            <>
              <label className="check check--nested buddy-setting__check">
                <input
                  type="checkbox"
                  checked={settings.launchHidden}
                  aria-describedby="launch-hidden-setting-help"
                  onChange={(event) =>
                    onChange(settings.enabled, event.target.checked)
                  }
                />
                Launch hidden at login
              </label>
              <p
                id="launch-hidden-setting-help"
                className="buddy-panel__hint"
              >
                Wait in the tray instead of opening over your desktop.
              </p>
            </>
          )}
        </div>
        {error && (
          <p className="buddy-panel__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
