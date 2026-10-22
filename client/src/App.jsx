import { useCallback, useEffect, useState } from 'react';
import { api, waitForText } from './api.js';
import { modelLabel, providerLabel } from './labels.js';
import ProductForm from './components/ProductForm.jsx';
import ZipDrop from './components/ZipDrop.jsx';
import AdvancedPanel from './components/AdvancedPanel.jsx';
import Workspace from './components/Workspace.jsx';
import HistoryView from './components/HistoryView.jsx';
import BulkView from './components/BulkView.jsx';
import AdminView from './components/AdminView.jsx';
import EtsyPanel from './components/EtsyPanel.jsx';
import Login from './components/Login.jsx';
import LegalView from './components/LegalView.jsx';

// Anything here means the fix is a fresh API key, so offer the Advanced panel.
const KEY_PROBLEM = /quota|rate limit|429|api key|insufficient|billing/i;
const QUOTA_PROBLEM = /quota|429|rate limit|no free requests/i;

/** What to click next, given who wrote the guide. */
function rewriteHint(quality) {
  if (quality.provider && quality.provider !== 'gemini') return ', or pick a Gemini model under Settings so Gemini writes the guide';
  if (/lite/i.test(quality.model || '')) return ', or choose a full-size model under Settings';
  return '';
}

export default function App() {
  const [view, setView] = useState('studio');
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('listora.nav.collapsed') === '1'; } catch { return false; }
  });
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [prompts, setPrompts] = useState(null);
  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState('general');
  const [productInfo, setProductInfo] = useState({});
  const [picked, setPicked] = useState([]);
  const [slots, setSlots] = useState([]);
  const [staged, setStaged] = useState([]);
  const [etsy, setEtsy] = useState(null);
  const [legal, setLegal] = useState(null);

  // Advanced Settings is now its own sidebar view rather than a fold under the
  // studio. These keep the old open/toggle names the banners and loaders use.
  const advancedOpen = view === 'settings';
  const setAdvancedOpen = (open) => setView(open ? 'settings' : 'studio');

  // The desktop rail can shrink to icons; the choice persists across reloads.
  // The mobile drawer ignores it (its styles are scoped above 900px).
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('listora.nav.collapsed', next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }

  const loadHealth = useCallback(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await api.authStatus();
      setSession(status);
      if (status.signedIn) loadHealth();
      return status;
    } catch (err) {
      setSession({ protected: true, signedIn: false, lockedFor: 0, offline: err.message });
      return null;
    }
  }, [loadHealth]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  /** Any 401 means the cookie died mid-session, so bring the sign-in back. */
  function catch401(err) {
    if (err?.status === 401) refreshAuth();
    setError(err);
  }

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.settings());
    } catch (err) {
      setError(err);
    }
  }, []);

  const refreshPrompts = useCallback(async () => {
    try {
      const data = await api.prompts();
      setPrompts(data.types);
    } catch {
      setPrompts(null);
    }
  }, []);

  // Read once after sign-in so the closed Advanced summary can name the model,
  // then again whenever the panel opens.
  useEffect(() => {
    if (session?.signedIn) refreshSettings();
  }, [session, refreshSettings]);

  // The editable listing briefs are only needed inside the Advanced panel, so
  // they load when it opens rather than on every page.
  useEffect(() => {
    if (session?.signedIn && advancedOpen) refreshPrompts();
  }, [session, advancedOpen, refreshPrompts]);

  // The ZIP box maps files onto slots before any product exists, so the slot
  // names and their rules come from the server on their own.
  useEffect(() => {
    if (!session?.signedIn || slots.length) return;
    api.slots().then((data) => setSlots(data.slots)).catch(catch401);
  }, [session, slots.length]);

  useEffect(() => {
    if (advancedOpen) refreshSettings();
  }, [advancedOpen, refreshSettings]);

  // Whether Etsy is switched on at all is a server answer, so the panel cannot
  // exist before it. A build without the flag simply says "off" and nothing
  // Etsy-shaped is rendered.
  const refreshEtsy = useCallback(async () => {
    try {
      setEtsy(await api.etsyStatus());
    } catch {
      setEtsy(null);
    }
  }, []);

  useEffect(() => {
    if (session?.signedIn) refreshEtsy();
  }, [session, refreshEtsy]);

  // An account verification link (/verify?token=…) is meant to be clicked from
  // email. Confirm it here, then drop the token from the address bar. A reset
  // link (/reset) is handled by the sign-in screen, so it is left alone.
  useEffect(() => {
    if (!window.location.pathname.startsWith('/verify')) return;
    const token = new URLSearchParams(window.location.search).get('token');
    window.history.replaceState({}, '', window.location.pathname);
    if (!token) return;
    api
      .verifyAccount(token)
      .then(() => setNotice('Email confirmed. Your account is fully set up.'))
      .catch((err) => setError(err));
  }, []);

  // Etsy brings the browser back to the studio with the outcome in the address
  // bar. The words there are safe to show — a token never travels this way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('etsy');
    if (!result) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (result === 'connected') {
      setNotice('Etsy shop connected. It will be used for drafts only.');
      refreshEtsy();
    } else {
      setError(new Error(params.get('message') || 'Etsy could not be connected.'));
    }
  }, [refreshEtsy]);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await api.history();
      setHistory(data.products);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (view === 'history') refreshHistory();
  }, [view, refreshHistory]);

  /** Wraps an API call with a loading label and error capture. */
  async function run(label, note, fn) {
    setBusy({ label, note });
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      catch401(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Builds the banner text shown once a generation finishes. */
  function textNotice(product, regenerated) {
    const warnings = product.warnings || {};
    const lines = [];
    if (warnings.cleaningNotes?.length) lines.push(`File 1 was auto-cleaned: ${warnings.cleaningNotes.join(', ')}.`);
    else lines.push(regenerated ? 'Listing text regenerated.' : 'File 1 passed validation with no brackets, citations or footnotes.');
    if (warnings.seoWarnings?.length) {
      lines.push(`Check the SEO limits in File 2: ${warnings.seoWarnings.join(' ')}`);
    }
    const seo = warnings.seoCheck;
    if (seo?.items?.length) {
      const fixes = seo.items.filter((item) => !item.pass).length;
      lines.push(
        fixes
          ? `SEO check: ${seo.score}/100 — ${fixes} item${fixes === 1 ? '' : 's'} to fix in the SEO check panel.`
          : `SEO check: ${seo.score}/100, every check passed.`,
      );
    }
    const quality = warnings.quality;
    if (quality?.model) {
      const busy = quality.skipped?.length ? `, after ${quality.skipped.length} busy model(s) were skipped` : '';
      lines.push(`Written by ${modelLabel(quality)}${busy}.`);
    }
    return lines.join(' ');
  }

  /** Starts the job on the server and waits for the text, without holding one request open. */
  async function generateText(label, note, start) {
    setBusy({ label, note });
    setError(null);
    setNotice(null);
    try {
      const created = await start();
      const id = created.product.id;
      await api.run(id);
      const product = await waitForText(id);
      setProduct(product);
      setNotice(textNotice(product, label === 'Rewriting the listing text'));
      // A generation was charged to today's count, so refresh what is left.
      refreshAuth();
      return product;
    } catch (err) {
      catch401(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate() {
    await generateText(
      'Generating your listing package',
      'The text model is writing File 1, File 2 and 7 image prompts. This takes about 30-60 seconds.',
      () => api.create(productName.trim(), picked, productType === 'general' ? null : productType, productInfo),
    );
  }

  async function handleRegenerateText() {
    await generateText(
      'Rewriting the listing text',
      'Asking the text model for a fresh version.',
      async () => ({ product }),
    );
  }

  async function handlePackage() {
    const data = await run('Building your ZIP', 'Rendering the two PDFs and packing your images.', () =>
      api.packageZip(product.id),
    );
    if (data) {
      setProduct(data.product);
      const size = (data.zip.bytes / 1024 / 1024).toFixed(2);
      const images = data.zip.images ?? 0;
      const pdfs = data.zip.documents ?? 0;
      setNotice(`${data.zip.name} is ready: ${pdfs} PDF${pdfs === 1 ? '' : 's'} and ${images} image${images === 1 ? '' : 's'} (${size} MB).`);
    }
  }

  async function handleSaveListing(fields) {
    const data = await run('Saving your wording', 'Rewriting the listing text and reprinting its PDF.', () =>
      api.saveListing(product.id, fields),
    );
    if (data) {
      setProduct(data.product);
      setNotice('Your wording is saved and the SEO PDF was reprinted with it.');
    }
    return data;
  }

  async function handleSavePrice(price) {
    const data = await run('Saving price', null, () => api.savePrice(product.id, price));
    if (data) {
      setProduct(data.product);
      setNotice(data.product.price ? `Price set to ${data.product.price}.` : 'Price cleared.');
    }
  }

  /** A cropped or compressed file takes the place of the one it was made from. */
  function handleReplaceStaged(key, file) {
    setStaged((current) =>
      current.map((item) =>
        item.key === key ? { ...item, file, name: file.name, bytes: file.size, status: '', message: '' } : item,
      ),
    );
  }

  /** Files straight out of the ZIP, in file-name order, one per slot. */
  async function handleImages(images) {
    let list = slots;
    if (!list.length) {
      const data = await api.slots();
      list = data.slots;
      setSlots(list);
    }
    setStaged(
      images.map((image, index) => ({
        key: `${image.name}-${index}`,
        name: image.name,
        bytes: image.file.size,
        file: image.file,
        slotId: list[index].id,
        status: '',
        message: '',
      })),
    );
  }

  /** Choosing an occupied slot swaps the two images; nothing is dropped. */
  function handleAssign(key, slotId) {
    setStaged((current) => {
      const moving = current.find((item) => item.key === key);
      if (!moving || moving.slotId === slotId) return current;
      const displaced = current.find((item) => item.slotId === slotId);
      return current.map((item) => {
        if (item.key === key) return { ...item, slotId, status: '', message: '' };
        if (displaced && item.key === displaced.key) {
          return { ...item, slotId: moving.slotId, status: '', message: '' };
        }
        return item;
      });
    });
  }

  function handleRemoveStaged(key) {
    setStaged((current) => current.filter((item) => item.key !== key));
  }

  function handleClearStaged() {
    setStaged([]);
  }

  /**
   * Uploads the mapped files one slot at a time through the existing route, so
   * the server's 4:3 and minimum-width rules decide every result.
   */
  async function handleFillSlots() {
    if (!product) {
      setError(new Error('Write the listing text first — these images go into its slots.'));
      return;
    }
    setBusy({ label: 'Checking your images', note: 'Each one has to be 4:3 and at least 2000px wide.' });
    setError(null);
    setNotice(null);
    const results = [];
    let latest = product;
    try {
      for (const item of staged) {
        try {
          const data = await api.uploadImage(product.id, item.slotId, item.file);
          latest = data.product;
          results.push({ ...item, status: 'ok', message: `${data.image.width} × ${data.image.height}px` });
        } catch (err) {
          if (err.status === 401) {
            catch401(err);
            results.push(...staged.slice(results.length).map((rest) => ({ ...rest, status: '', message: '' })));
            break;
          }
          results.push({ ...item, status: 'fail', message: err.message });
        }
      }
      setProduct(latest);
      setStaged(results);
      const refused = results.filter((item) => item.status === 'fail');
      if (!refused.length) {
        setNotice(`${results.length} image${results.length === 1 ? '' : 's'} filled their slots. Build the ZIP again to pack them in.`);
      } else {
        setError(
          new Error(
            `${results.length - refused.length} of ${results.length} images accepted. Refused: ${refused
              .map((item) => `${item.name} — ${item.message}`)
              .join(' | ')}`,
          ),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  /** Your own PDF stands in for the one the portal would print for that file. */
  async function handleUploadPdf(document, file) {
    const data = await run(
      'Checking your PDF',
      `${document.name} has to be a real PDF, and under the size this host accepts.`,
      () => api.uploadDocument(product.id, document.key, file),
    );
    if (data) {
      setProduct(data.product);
      setNotice(`Your PDF now stands in for ${document.name}. Build the ZIP again to pack it in.`);
    }
  }

  async function handleRestorePdf(document) {
    const data = await run('Restoring the portal PDF', null, () => api.removeDocument(product.id, document.key));
    if (data) {
      setProduct(data.product);
      setNotice(`${document.name} will be printed from the listing text again.`);
    }
  }

  /** Etsy owns the sign-in page, so the browser goes there whole. That keeps the
   *  sign-in cookie on the navigation and the callback arrives authenticated. */
  async function handleEtsyConnect() {
    const data = await run('Opening Etsy', 'Etsy will ask you to sign in and allow the listings permission.', () =>
      api.etsyConnect(),
    );
    if (data?.url) window.location.assign(data.url);
  }

  async function handleEtsyDraft(fields) {
    return sendDraftFor(product.id, fields);
  }

  /**
   * Sends one package to Etsy as a draft and reports the outcome. Passing an id
   * rather than reading `product` from state lets the one-click flow use the
   * listing it just generated, before a re-render has landed it in state.
   */
  async function sendDraftFor(productId, fields) {
    const data = await run(
      fields?.resume ? 'Continuing your Etsy draft' : 'Saving your draft in Etsy',
      'Creating the listing, then attaching your images and both PDFs. It is saved as a draft, not published.',
      () => api.etsyDraft(productId, fields),
    );
    if (!data) {
      // A send that reached Etsy but stopped part way is resumable. The error
      // swallowed the product, so reload it and let the panel offer "Continue".
      try {
        const refreshed = await api.get(productId);
        setProduct(refreshed.product);
      } catch {
        /* the panel keeps its last-known state */
      }
      return false;
    }
    setProduct(data.product);
    const { draft } = data;
    setNotice(
      `Draft saved in Etsy: ${draft.images} image${draft.images === 1 ? '' : 's'} and ${draft.files} file${draft.files === 1 ? '' : 's'} attached. `
        + `${draft.url ?? `listing ${draft.listingId}`} — review it there, or use Publish to make it live.`,
    );
    return true;
  }

  // One click from a bare niche: generate the text, then send the draft using the
  // saved shop defaults. Price and an image are per-listing, so a clear nudge is
  // shown if a default is still missing rather than firing a request that must fail.
  async function handleCreateToDraft() {
    const missing = ['category', 'quantity', 'whoMade', 'whenMade'].filter(
      (key) => !String(etsy?.defaults?.[key] ?? '').trim(),
    );
    const created = await generateText(
      'Generating your listing package',
      'The text model is writing File 1, File 2 and 7 image prompts. This takes about 30-60 seconds.',
      () => api.create(productName.trim(), picked, productType === 'general' ? null : productType, productInfo),
    );
    if (!created) return;
    if (missing.length) {
      setError(
        new Error(
          `Your listing is generated, but your Etsy shop defaults are incomplete (missing: ${missing.join(', ')}). `
            + 'Set them under Settings → Etsy shop defaults, or use the Etsy panel under the listing, then create the draft.',
        ),
      );
      return;
    }
    await sendDraftFor(created.id, {});
  }

  // Publishing makes a real listing visible on the shop and available to buyers,
  // so it only ever happens from an explicit click the seller confirms.
  async function handleEtsyPublish() {
    if (!window.confirm('Publish this listing on Etsy? It goes live on your shop and buyers can see and purchase it.')) {
      return false;
    }
    const data = await run('Publishing on Etsy', 'Making your saved draft live on your shop.', () =>
      api.etsyPublish(product.id),
    );
    if (!data) return false;
    setProduct(data.product);
    const { published } = data;
    setNotice(
      `Listing is now ${published.state === 'active' ? 'live' : published.state} on Etsy: ${
        published.url ?? `listing ${published.listingId}`
      }. Manage it there whenever you like.`,
    );
    return true;
  }

  async function handleEtsyDisconnect() {
    if (!window.confirm('Disconnect this Etsy shop? Your listings and files on Etsy are not touched.')) return;
    const data = await run('Disconnecting', null, () => api.etsyDisconnect());
    if (data) {
      setEtsy({ ...data, whoMade: etsy?.whoMade, whenMade: etsy?.whenMade });
      setNotice('Etsy shop disconnected.');
    }
  }

  async function handleUploadImage(slot, file) {
    const data = await run('Checking your image', `${slot.label} needs to be 4:3 and at least 2000px wide.`, () =>
      api.uploadImage(product.id, slot.id, file),
    );
    if (data) {
      setProduct(data.product);
      setNotice(
        `${slot.label} is set (${data.image.width} × ${data.image.height}px). Create the ZIP again to pack it in.`,
      );
    }
  }

  async function handleRemoveImage(slot) {
    const data = await run('Removing image', null, () => api.removeImage(product.id, slot.id));
    if (data) {
      setProduct(data.product);
      setNotice(`${slot.label} removed.`);
    }
  }

  async function handleGenerateImage(slot) {
    const data = await run(
      'Drawing this image',
      `Generating ${slot.label}. This can take a minute.`,
      () => api.generateImage(product.id, slot.id),
    );
    if (data) {
      setProduct(data.product);
      setNotice(
        `${slot.label} drawn (${data.image.width} × ${data.image.height}px). Create the ZIP again to pack it in.`,
      );
    }
  }

  function openFromHistory(id) {
    setView('studio');
    run('Loading product', null, async () => {
      const data = await api.get(id);
      setProduct(data.product);
      setProductName(data.product.productName || '');
      setProductType(data.product.productType || 'general');
      setProductInfo(data.product.productInfo || {});
      setPicked(data.product.keywords || []);
      setStaged([]);
    });
  }

  function startOver() {
    setProduct(null);
    setProductName('');
    setProductType('general');
    setProductInfo({});
    setPicked([]);
    setStaged([]);
    setError(null);
    setNotice(null);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this listing and its PDFs/ZIP?')) return;
    await run('Deleting listing', null, () => api.remove(id));
    if (product?.id === id) startOver();
    refreshHistory();
  }

  async function handleClearHistory() {
    await run('Clearing history', null, () => api.clearHistory());
    startOver();
    setView('studio');
    refreshHistory();
  }

  async function handleSaveKey(provider, key) {
    const data = await run('Saving API key', null, () => api.saveKey(provider, key));
    if (data) {
      setSettings(data);
      setNotice(`${providerLabel(provider)} API key saved. The next generation uses it straight away.`);
      loadHealth();
    }
  }

  async function handleRemoveKey(provider) {
    if (!window.confirm(`Remove the saved ${providerLabel(provider)} key and fall back to server/.env?`)) return;
    const data = await run('Removing API key', null, () => api.removeKey(provider));
    if (data) {
      setSettings(data);
      setNotice(`Saved ${providerLabel(provider)} key removed.`);
      loadHealth();
    }
  }

  async function handleSaveModel(provider, model) {
    const data = await run('Switching model', null, () => api.saveModel(provider, model));
    if (data) {
      setSettings(data);
      setNotice(`${providerLabel(provider)} (${model}) is asked first from the next generation.`);
    }
  }

  async function handleSaveBrand(brand) {
    const data = await run('Saving brand', null, () => api.saveBrand(brand));
    if (data) {
      setSettings(data);
      setNotice(`Guides and PDFs will now be signed as ${brand}.`);
    }
  }

  async function handleSaveTheme(theme) {
    const data = await run('Saving colours', null, () => api.saveTheme(theme));
    if (data) {
      setSettings((prev) => ({ ...prev, theme: data.theme }));
      setNotice('Your PDF colours are saved and will print on the next listing.');
    }
  }

  async function handleSaveEtsyDefaults(defaults) {
    const data = await run('Saving Etsy defaults', null, () => api.saveEtsyDefaults(defaults));
    if (data) {
      setEtsy((prev) => ({ ...prev, defaults: data.defaults }));
      setNotice('Etsy shop defaults saved. New drafts are sent with them.');
    }
  }

  async function handleRemoveTheme() {
    const data = await run('Resetting colours', null, () => api.removeTheme());
    if (data) {
      setSettings((prev) => ({ ...prev, theme: data.theme }));
      setNotice('The PDFs will print in the built-in palette again.');
    }
  }

  async function handleSavePrompt(type, body) {
    const data = await run('Saving prompt', null, () => api.savePrompt(type, body));
    if (data) {
      setPrompts(data.types);
      setNotice('That listing brief will be used for the next listing of its type.');
    }
    return data;
  }

  async function handleRemovePrompt(type) {
    const data = await run('Reverting prompt', null, () => api.removePrompt(type));
    if (data) {
      setPrompts(data.types);
      setNotice('That type is back to the built-in brief.');
    }
  }

  async function handleChangePassword(current, next) {    const data = await run('Saving password', null, () => api.savePassword(next, current));
    if (data) {
      setSettings(data);
      setNotice('Password saved. Other browsers signed in with this portal have been signed out.');
    }
  }

  async function signOut() {
    await run('Signing out', null, async () => {
      // Clear whichever session this browser holds; both are public and no-op
      // when the other cookie is the one in use.
      await Promise.allSettled([api.accountSignOut(), api.logout()]);
    });
    refreshAuth();
    setProduct(null);
  }

  // The whole portal is behind the password, so nothing else is fetched until
  // the session is confirmed.
  if (!session) return <div className="app"><main><p className="muted">Checking your sign-in…</p></main></div>;
  // A reset link opens the sign-in screen's password form even on an unlocked
  // build — an email can land on a still-logged-in browser, and the link is
  // what the person clicked; the studio would swallow it.
  const onResetLink = window.location.pathname.startsWith('/reset');
  if (!session.signedIn || onResetLink) return <Login status={session} onSignedIn={refreshAuth} />;

  // The short-guide warning travels with the product, so it survives a reload.
  const quality = view === 'studio' && product ? product.warnings?.quality : null;

  // Layout-only chrome: the frame around the existing views. Titles, the account
  // chip and the usage meter read the same state the old top bar did.
  const TITLES = {
    studio: ['Generator', 'Listing text, image prompts and a ready-to-upload ZIP of PDFs.'],
    history: ['History', 'Your saved listings — open one to edit, reprint or delete.'],
    bulk: ['Bulk', 'One listing per CSV row, run through the same generator.'],
    settings: ['Settings', 'Keywords, model, access keys, brand colours and Etsy defaults.'],
    admin: ['Admin', 'Users, usage and failed jobs across the portal.'],
  };
  const [title, subtitle] = TITLES[view] || TITLES.studio;
  const whoName = session.account?.name || session.account?.email || '';
  const initial = whoName.slice(0, 1).toUpperCase();
  const usage = session.usage && !session.usage.exempt && session.usage.limit
    ? { ...session.usage, pct: Math.max(0, Math.min(100, (session.usage.remaining / session.usage.limit) * 100)) }
    : null;

  const icon = {
    studio: <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18 15l.7 2.1L21 18l-2.3.9L18 21l-.7-2.1L15 18l2.3-.9z" />,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    bulk: <><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4" /><path d="M4 16l8 4 8-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14 2h-4l-.4 2.4A7 7 0 0 0 7.5 5.7l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3L10 22h4l.4-2.4a7 7 0 0 0 2.1-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" /></>,
    admin: <path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z" />,
  };
  const NavIcon = ({ name }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon[name]}
    </svg>
  );
  const sideItem = (id, label) => (
    <button
      className={view === id ? 'side-item active' : 'side-item'}
      onClick={() => { setView(id); setNavOpen(false); }}
      disabled={Boolean(busy)}
      title={label}
    >
      <NavIcon name={id} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="shell">
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <aside className={['sidebar', navOpen && 'open', collapsed && 'collapsed'].filter(Boolean).join(' ')}>
        <div className="brand">
          <span className="brand-mark"><img src="/brand/listora-icon.svg" alt="Listora logo" /></span>
          <span className="brand-name">Listora</span>
          <button
            className="side-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
          </button>
          <button className="nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="side-nav">
          {sideItem('studio', 'Generator')}
          {sideItem('history', 'History')}
          {sideItem('bulk', 'Bulk')}
          {sideItem('settings', 'Settings')}
          {session.account?.role === 'admin' && sideItem('admin', 'Admin')}
        </nav>
        <div className="side-foot">
          {usage && (
            <div className="usage" title="Resets at midnight UTC">
              <div className="usage-bar"><i style={{ width: `${usage.pct}%` }} /></div>
              <span className="muted small">{usage.remaining} of {usage.limit} left today</span>
            </div>
          )}
          {session.account && (
            <div className="side-account" title={session.account.email}>
              <span className="avatar">{initial}</span>
              <span className="who-text">
                <strong className="who-name">{whoName}</strong>
                {session.account.role === 'admin' && <span className="who-role">Owner</span>}
              </span>
            </div>
          )}
          {(session.protected || session.account) && (
            <button className="side-signout" onClick={signOut} disabled={Boolean(busy)} title="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      <div className="main-col">
        <header className="appbar">
          <button className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="appbar-title">
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
        </header>

        <main className="content">
          {health && health.missingProviders?.length > 0 && !advancedOpen && (
        <div className="banner warn">
          <strong>No API key for {health.missingProviders.map(providerLabel).join(' or ')}.</strong> Open Settings
          and paste a key under Access keys to start generating again.
        </div>
      )}

      {error && (
        <div className="banner error">
          <strong>{error.message}</strong>
          {error.issues?.length > 0 && (
            <ul>
              {error.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <button className="linklike" onClick={() => setError(null)}>Dismiss</button>
          {KEY_PROBLEM.test(error.message) && !advancedOpen && (
            <button className="linklike" onClick={() => setAdvancedOpen(true)}>
              {QUOTA_PROBLEM.test(error.message) ? 'Switch model or update key' : 'Update API key'}
            </button>
          )}
        </div>
      )}

      {notice && !error && (
        <div className="banner ok">
          {notice}
          <button className="linklike" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {quality?.notes?.length > 0 && (
        <div className="banner warn">
          <strong>
            {modelLabel(quality)} wrote File 1 at {quality.words} words.
          </strong>
          <ul>
            {quality.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="muted">
            No PDFs were rendered when this text was saved. Click “Rewrite text” to ask the models again
            {rewriteHint(quality)} — creating the ZIP will still print whatever is stored now.
          </div>
        </div>
      )}

      {busy && (
        <div className="banner busy">
          <span className="spinner" />
          <div>
            <strong>{busy.label}&hellip;</strong>
            {busy.note && <div className="muted">{busy.note}</div>}
          </div>
        </div>
      )}

        {legal ? (
          <LegalView doc={legal} onBack={() => setLegal(null)} contactEmail={session?.contactEmail} />
        ) : view === 'history' ? (
          <HistoryView
            products={history}
            productTypes={settings?.productTypes}
            onOpen={openFromHistory}
            onRefresh={refreshHistory}
            onDelete={handleDelete}
            onClear={handleClearHistory}
            busy={busy}
          />
        ) : view === 'bulk' ? (
          <BulkView onNotice={setNotice} onOpenProduct={openFromHistory} />
        ) : view === 'settings' ? (
          <AdvancedPanel
            productName={productName}
            busy={busy}
            picked={picked}
            onPicked={setPicked}
            settings={settings}
            prompts={prompts}
            canManagePrompts={!session.account || session.account.role === 'admin'}
            etsy={etsy}
            canManageEtsy={!session.account || session.account.role === 'admin'}
            onSaveKey={handleSaveKey}
            onRemoveKey={handleRemoveKey}
            onSaveModel={handleSaveModel}
            onSaveBrand={handleSaveBrand}
            onSaveTheme={handleSaveTheme}
            onRemoveTheme={handleRemoveTheme}
            onSavePrompt={handleSavePrompt}
            onRemovePrompt={handleRemovePrompt}
            onSaveEtsyDefaults={handleSaveEtsyDefaults}
            onChangePassword={handleChangePassword}
          />
        ) : view === 'admin' ? (
          <AdminView />
        ) : (
          <div className="stack">
            {product ? (
              <Workspace
                product={product}
                busy={busy}
                onRegenerateText={handleRegenerateText}
                onPackage={handlePackage}
                onSavePrice={handleSavePrice}
                onSaveListing={handleSaveListing}
                onUploadPdf={handleUploadPdf}
                onRestorePdf={handleRestorePdf}
                onUploadImage={handleUploadImage}
                onRemoveImage={handleRemoveImage}
                onGenerateImage={handleGenerateImage}
                onStartOver={startOver}
              />
            ) : (
              <ProductForm
                busy={busy}
                productName={productName}
                onProductName={setProductName}
                productTypes={settings?.productTypes}
                productType={productType}
                onProductType={setProductType}
                productInfo={productInfo}
                onProductInfo={setProductInfo}
                onCreate={handleCreate}
                etsyConnected={Boolean(etsy?.enabled && etsy?.connected)}
                onCreateToDraft={handleCreateToDraft}
              />
            )}

            <ZipDrop
              slots={slots}
              staged={staged}
              busy={busy}
              rules={product?.rules}
              onImages={handleImages}
              onAssign={handleAssign}
              onRemove={handleRemoveStaged}
              onFill={handleFillSlots}
              onClear={handleClearStaged}
              onReplaceFile={handleReplaceStaged}
            />

            {etsy?.enabled && product && (
              <EtsyPanel
                key={product.id}
                product={product}
                status={etsy}
                busy={busy}
                onConnect={handleEtsyConnect}
                onDraft={handleEtsyDraft}
                onPublish={handleEtsyPublish}
                onDisconnect={handleEtsyDisconnect}
                onError={catch401}
              />
            )}
          </div>
        )}

        {!legal && (
          <footer className="app-footer">
            <p className="trademark-note small muted">
              The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not
              endorsed or certified by Etsy, Inc.
            </p>
            <div className="row legal-links">
              <button className="linklike" onClick={() => setLegal('terms')}>Terms of Service</button>
              <button className="linklike" onClick={() => setLegal('privacy')}>Privacy Policy</button>
              {session?.contactEmail && (
                <a className="linklike" href={`mailto:${session.contactEmail}`}>{session.contactEmail}</a>
              )}
            </div>
          </footer>
        )}
        </main>
      </div>
    </div>
  );
}
