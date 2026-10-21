import KeywordPicker from './KeywordPicker.jsx';
import SettingsView from './SettingsView.jsx';
import { providerLabel } from '../labels.js';

// Everything a first run does not need, folded away until asked for: the SEO
// keyword tick list, the model, the saved keys, the brand and the password.
export default function AdvancedPanel({
  open,
  onToggle,
  productName,
  busy,
  picked,
  onPicked,
  settings,
  prompts,
  canManagePrompts,
  etsy,
  canManageEtsy,
  onSaveKey,
  onRemoveKey,
  onSaveModel,
  onSaveBrand,
  onSaveTheme,
  onRemoveTheme,
  onSavePrompt,
  onRemovePrompt,
  onSaveEtsyDefaults,
  onChangePassword,
}) {
  const selected = settings?.selected || {};
  const meta = [
    picked.length ? `${picked.length} keyword${picked.length === 1 ? '' : 's'} picked` : 'keywords not picked',
    selected.model ? `${providerLabel(selected.provider)} · ${selected.model}` : 'no model connected',
  ].join(' · ');

  return (
    <details className="drop advanced" open={open} onToggle={(event) => onToggle(event.target.open)}>
      <summary>
        <span>Advanced Settings</span>
        <em className="drop-meta">{meta}</em>
      </summary>

      <h3>SEO keywords</h3>
      <p className="muted small">
        Optional. Left alone, the listing is written from live search data. Tick phrases here to force the
        words you want, and the first tick becomes the main keyword.
      </p>
      <KeywordPicker productName={productName} busy={busy} picked={picked} onPicked={onPicked} />

      <h3>Model, keys, colours and access</h3>
      {settings ? (
        <SettingsView
          settings={settings}
          busy={busy}
          prompts={prompts}
          canManagePrompts={canManagePrompts}
          etsy={etsy}
          canManageEtsy={canManageEtsy}
          onSave={onSaveKey}
          onRemove={onRemoveKey}
          onSaveModel={onSaveModel}
          onSaveBrand={onSaveBrand}
          onSaveTheme={onSaveTheme}
          onRemoveTheme={onRemoveTheme}
          onSavePrompt={onSavePrompt}
          onRemovePrompt={onRemovePrompt}
          onSaveEtsyDefaults={onSaveEtsyDefaults}
          onChangePassword={onChangePassword}
        />
      ) : (
        <p className="muted small">Loading settings…</p>
      )}
    </details>
  );
}
