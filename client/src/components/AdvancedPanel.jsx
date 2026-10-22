import KeywordPicker from './KeywordPicker.jsx';
import SettingsView from './SettingsView.jsx';
import { providerLabel } from '../labels.js';

// Everything a first run does not need, now on its own Settings screen reached
// from the sidebar: the SEO keyword tick list, the brand, the PDF colours, the
// Etsy shop defaults, the listing prompts and the password. The model and its
// access keys live on their own "Keys" tab.
export default function AdvancedPanel({
  productName,
  busy,
  picked,
  onPicked,
  settings,
  prompts,
  canManagePrompts,
  etsy,
  canManageEtsy,
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
    <section className="card advanced-open">
      <div className="advanced-head">
        <h2>Advanced Settings</h2>
        <em className="drop-meta">{meta}</em>
      </div>

      <h3>SEO keywords</h3>
      <p className="muted small">
        Optional. Left alone, the listing is written from live search data. Tick phrases here to force the
        words you want, and the first tick becomes the main keyword.
      </p>
      <KeywordPicker productName={productName} busy={busy} picked={picked} onPicked={onPicked} />

      <h3>Brand, colours, prompts and access</h3>
      {settings ? (
        <SettingsView
          settings={settings}
          busy={busy}
          prompts={prompts}
          canManagePrompts={canManagePrompts}
          etsy={etsy}
          canManageEtsy={canManageEtsy}
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
    </section>
  );
}
