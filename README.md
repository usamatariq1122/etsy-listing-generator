# Etsy Digital Listing Generator

Personal web portal that turns one product name into a complete listing package:

- **File 1** — `product-content.pdf`, the customer-facing guide (validated: no brackets, citations, source references or footnotes)
- **File 2** — `etsy-listing-seo.pdf`, SEO title, 13 tags, description, category mapping, image placement guide, checklist
- **7 image prompts** — written for you to run in any image tool, plus 7 upload slots that validate every file at 4:3 / min 2000px
- **One ZIP** — the 2 PDFs plus the images you added, named `01-cover.jpg` … `07-license.jpg`
- **History** — every product is stored in MySQL with a download link

Stack: React (Vite) · Node.js backend (no framework) · MySQL locally, Postgres when hosted ·
Gemini or Groq for the text.

---

## 1. First-time setup

1. **Start MySQL.** This build expects a local MySQL/MariaDB server — open the **XAMPP Control
   Panel** and click **Start** next to **MySQL**. The app creates the
   `etsy_listing_generator` database and `products` table automatically on first boot —
   you do not need to run any SQL. Point `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD`
   in `server/.env` at whatever server you run.

2. **Create your local files.** From the `server` folder run `npm run setup`. It copies
   `.env.example` to `.env`, and `src/masterPrompt.example.js` / `src/rules.example.js` to
   `src/masterPrompt.js` / `src/rules.js`. It never overwrites a file that already exists.
   Those four are git-ignored on purpose: your keys, your shop's wording and your brand live only
   on your machine. Edit the copies — the `.example` files are the generic starting point.

3. **Add your API key.** Open `server/.env` in a text editor and replace the placeholder:
   ```
   GEMINI_API_KEY=...your real key...
   ```
   Anthropic works too — set `ANTHROPIC_API_KEY` and `TEXT_PROVIDER=anthropic`. The provider and
   model can also be changed from the **Settings** tab in the browser, which stores them in the
   database and uses them from the next request without a restart.
   Optional: add a **Groq** key as the second provider — see section 4. Paste it in **Settings →
   Access keys**, or put `GROQ_API_KEY` (and, if you like, `GROQ_MODEL`) in this file instead.
   Keys never leave the backend: the browser only ever sees the last 4 characters, and a key whose
   format belongs to another service (`gsk_…`, `AQ.…`, `sk-ant-…`) is refused in the wrong row instead
   of quietly breaking the provider that already works. `.env` is git-ignored; `.env.example` is the
   template.

4. **Install dependencies**:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

5. **Start the backend** — leave this terminal open:
   ```bash
   cd server
   npm run dev
   ```
   You should see `MySQL ready: etsy_listing_generator @ 127.0.0.1:3306` and `API http://localhost:4000`.

6. **Start the frontend** — in a second terminal:
   ```bash
   cd client
   npm run dev
   ```

7. **Open** http://localhost:5173

---

## 2. Using it

1. Type the product name or niche, e.g. `Crochet dragon pattern`, and click **Generate listing text**.
   The text model writes File 1, File 2 and the 7 image prompts (30–60 seconds). That work runs as a
   job, not inside the click: the portal starts it and then asks for the result until it arrives, so a
   slow model or a strict proxy cannot lose the answer. The SEO title and the
   13 tags are seeded from live search autocomplete, not invented. The notice bar afterwards names the
   model that answered, and how many busy models had to be skipped on the way to it.
2. Make the 7 images with the prompts shown under **Listing text** — paste each prompt into the image
   tool you like.
3. Open **Listing images** and pick a file for each slot. Anything that is not 4:3 or is under
   2000px wide is refused with the reason, and nothing is saved.
4. Click **Create ZIP**, then **Download ZIP**. Adding or replacing an image retires the old ZIP, so
   build it last.
5. **History** in the top-right lists every past product with its download link. Click **Open** to resume one.

---

## 3. The 7 image slots

| # | Slot label | File in ZIP | Prompt group |
|---|------------|-------------|--------------|
| 01 | Primary cover thumbnail | `01-cover.jpg` | mockup |
| 02 | Close-up detail | `02-detail.jpg` | mockup |
| 03 | Materials and what is included | `03-materials.jpg` | mockup |
| 04 | Lifestyle shot with scale | `04-lifestyle.jpg` | mockup |
| 05 | Digital download only | `05-digital-download.jpg` | infographic |
| 06 | Size and skill level | `06-size-skill.jpg` | infographic |
| 07 | Licence terms | `07-license.jpg` | infographic |

---

## 4. How the content rules are enforced

`server/src/rules.js` is the single source of truth, and `server/src/validate.js` applies it.

**File 1 is cleaned, then validated, then retried.**
1. Claude's File 1 text is stripped of: bracketed spans `[...]`, footnote markers, inline
   citations like `(Smith, 2021)`, URLs, whole lines starting with *Source / References /
   Bibliography / Via / Image credit*, and a trailing reference block.
2. The cleaned text is validated. If anything is still wrong, Claude is asked **once more**.
3. If the second attempt also fails, the request returns HTTP 422 listing exactly what is wrong
   instead of silently saving bad text.

**The banned marketplace word.**
Enforced on File 1 and on all 7 image prompts. `cleanFileOne` strips it from File 1 and reports how
many it removed; `normalizeShape` strips it from every prompt before the prompt reaches the browser,
so nothing you copy out of the portal can trip a marketplace re-upload rule.

> **Scope note.** The ban is *not* applied to File 2. File 2 is the marketplace SEO document
> (its filename is literally `etsy-listing-seo.pdf`) and your master prompt asks it for
> "13 Etsy search tags", so the platform name is expected there. If you want File 2 scrubbed
> too, scrub `result.file2_text` in `server/src/service.js`.

**Mockup prompts** are asked for as 4:3 landscape shots ending in `no text, no logos` (the rule lives in
`server/src/masterPrompt.js`, which is the only place prompts are specified).

**One brand, chosen in Settings.** `server/src/brand.js` keeps the brand name in the `settings`
table (until you save one, the neutral `DEFAULT_BRAND` placeholder is used). It is the only shop
name the portal ever writes: it signs the footer of
both PDFs (`© <year> <brand>`), opens the licence section of File 1 (`applyBrandLicense`), and is the
only name the image prompts may show as a discreet wordmark. `scrubBranding` in `validate.js` removes
every other shop name and attribution from generated fields before they are stored, shown or printed;
`LEGACY_BRANDS` in `server/src/rules.js` lists the older names it also strips.

**Real buyer queries, not invented ones.** `server/src/keywords.js` asks public search autocomplete
for the niche (the product name, its first two and three words, plus qualifier forms) in parallel,
drops rival-channel phrases such as "near me" or "amazon", and drops character/brand phrases that
appear in only one suggestion. Each seed is cached in the `keyword_cache` table for a day, so a niche
costs one round trip.

- The surviving queries go into the master prompt, which tells the model to open the SEO title with
  one of them and to copy tags straight from the list.
- `alignSeo` in `validate.js` then checks the result: a tag no shopper types is replaced by the
  closest unused query, empty slots up to 13 are filled from the same list, and the tag section of
  File 2 is rewritten so the PDF always agrees with the tag field. Phrases longer than 20 characters
  are never truncated into fragments; anything still unbacked is reported in the warning line under
  the notice bar.
- Etsy's own suggestion call needs a browser session and passes through a bot check, so it cannot be
  called from the server. If the autocomplete call fails, generation continues exactly as it did
  before and simply reports fewer tags as verified.

**Every prompt is sanitised twice over.** `normalizeShape` in `validate.js` runs each generated field
through `scrubBranding` (which keeps only the configured brand) and, for the seven image prompts,
through `scrubBannedWord` as well. A prompt therefore cannot carry another shop's name or the
marketplace word into the image tool you paste it into, whatever the model decided to write.

**Model failover.** Settings has one model dropdown with two groups — **Gemini** and **Groq** — and the
choice remembers which provider owns the model (`server/src/apikeys.js`, `selectedModel`). Whichever
group you pick in, that provider is asked first; the other one is the carry-over.

- A **Gemini** model chosen: `server/src/textgen.js` walks the Gemini list from best to lite, trying
  the next model whenever an answer says *this model cannot help right now* — a 503 high-demand
  rejection, a 429 quota exhaustion, or a 200 that carries no text at all. Only when the whole chain
  is dry does it ask **Groq**.
- A **Groq** model chosen: that model is called through the OpenAI-compatible endpoint
  (`server/src/groq.js`); if it declines, the Gemini chain above is run instead.

A problem that is yours to fix (a malformed answer, or a missing or invalid key when the other
provider has no key either) is never swallowed by a failover; it is reported straight away. A provider
with no saved key is simply skipped, so a dead Gemini key is covered by a saved Groq key and vice
versa. The model names in each group come from **`server/models.json`**, which is re-read on every
request: add or remove a name there and it appears in the dropdown on the next page load, with no
code change and no restart. `GEMINI_TEXT_MODEL` / `GROQ_MODEL` in `server/.env` only choose which
name of a group is asked first when nothing is picked in Settings.

Either way the notice bar says who answered: `Written by gemini-3.5-flash, after
2 busy model(s) were skipped`, or `Written by Groq (llama-3.3-70b-versatile), after 4 busy model(s)
were skipped`.

**The guide quality gate.** Every answer is measured before anything is printed
(`guideQuality` in `server/src/service.js`):
- the notice bar always says which provider and model wrote the text, and how many busy models were skipped
- a **flash-lite** Gemini answer is flagged even when it is long enough, because that model writes thin guides
- a File 1 under **900 words** is flagged with the model name and the exact word count — the same rule
  applies to a Groq answer, whichever provider was asked first
- when either applies, **no PDF is rendered** — the warning banner says so, the manifest in
  **Package and download** reads `⚠ not printed`, and clicking **Create ZIP** is what prints them,
  so a short guide can never reach a buyer by accident

---

## 5. Listing images

The portal does not generate images. It produces the 7 prompts, and you bring the finished files
back — from your own camera, your own renders, or any image tool you like.

**Slots** are defined once in `server/src/slots.js` and served to the browser with every product, so
the UI and the ZIP can never disagree. They are packed into the ZIP under fixed names:

| Slot | File in ZIP |
|------|-------------|
| Primary cover thumbnail | `01-cover.jpg` |
| Close-up detail | `02-detail.jpg` |
| Materials and what is included | `03-materials.jpg` |
| Lifestyle shot with scale | `04-lifestyle.jpg` |
| Digital download only | `05-digital-download.jpg` |
| Size and skill level | `06-size-skill.jpg` |
| Licence terms | `07-license.jpg` |

A PNG upload keeps a `.png` extension; the number and name never change.

**Uploads** are checked by `server/src/imageinfo.js` and stored by `server/src/uploads.js`:
- JPG or PNG only, up to 25 MB on your own machine; a hosted deployment accepts about 4 MB, because
  that is what one serverless request can carry — the slot tells you the limit before you pick a file
- minimum **2000px** wide
- aspect ratio **4:3** within **2%** tolerance
- width and height are read straight from the file header (PNG `IHDR`, JPEG start-of-frame marker),
  so no native image library has to be installed
- a rejected file is never saved; the reason comes back as an HTTP 422 and the slot stays empty
- accepted files keep their original resolution and are re-saved under the slot name, so replacing a
  slot never leaves two copies behind
- adding or removing an image removes the previously built ZIP and puts the listing back to
  `text`, because a package that no longer matches your images is worse than no package

The rules above are the single `IMAGE_RULES` object in `server/src/rules.js`.

---

## 6. Project layout

```
Etsy portal/
├── netlify.toml          hosting: static client + Functions + build command
├── netlify/functions/
│   ├── api.mjs           every /api/* route, as one Netlify Function
│   └── run.mjs           the listing-text job, as a background Function
├── server/
│   ├── .env              ← your keys (never committed)
│   ├── .env.example      ← template
│   ├── models.json       ← the model names the Settings dropdown offers
│   ├── data/products/    ← generated text, your uploads and ZIPs when running locally
│   └── src/
│       ├── index.js          local node:http server, static client, error handler
│       ├── api.js            the route table, shared by both runtimes
│       ├── auth.js           portal password, session cookie and the sign-in guard
│       ├── config.js         env parsing + requireKey()
│       ├── apikeys.js        saved keys, brand and the grouped provider/model choice
│       ├── modelCatalog.js   reads server/models.json on every request
│       ├── db.js             MySQL (local) and Postgres (hosted) through one interface
│       ├── files.js          listing files: disk locally, Netlify Blobs when hosted
│       ├── generate.js       the listing-text job: run it, record the result or the failure
│       ├── masterPrompt.js   your master prompt + the JSON output contract (git-ignored)
│       ├── masterPrompt.example.js  generic stand-in that `npm run setup` copies
│       ├── rules.js          banned word, branding, image rules (git-ignored)
│       ├── rules.example.js  generic stand-in that `npm run setup` copies
│       ├── keywords.js       live buyer queries + the keyword cache
│       ├── claude.js         Anthropic call (JSON prefill) + JSON extraction
│       ├── gemini.js         one Gemini model call, structured output + friendly errors
│       ├── groq.js           OpenAI-compatible Groq call (key from Settings or GROQ_API_KEY)
│       ├── textgen.js        provider dispatch in the chosen order, model failover
│       ├── retry.js          transient-failure retry with a time budget
│       ├── validate.js       File 1 cleaning/validation, SEO repair and alignment
│       ├── service.js        generate-with-retry pipeline + the guide quality gate
│       ├── imageinfo.js      reads JPG/PNG width and height from the file header
│       ├── uploads.js        validate + store + remove one slot image
│       ├── zip.js            PDF rendering + ZIP packaging (PDFs + uploaded images)
│       ├── slots.js          the 7 slot definitions
│       └── paths.js          file keys + id sanitising
└── client/
    └── src/
        ├── App.jsx           state, loading banners, error banners
        ├── api.js            fetch wrapper + the polling loop
        ├── labels.js         status labels
        └── components/       Login, ProductForm, Workspace, TextPreview,
                              UploadSlots, PackagePanel, HistoryView, SettingsView
```

---

## 7. API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/status` | is a password set, and is this browser signed in |
| POST | `/api/auth/login` | verify the password and set the session cookie |
| POST | `/api/auth/logout` | clear the session cookie |
| PUT | `/api/auth/password` | create the password (first time) or change it (needs the old one) |
| GET | `/api/health` | which provider is asked first, and whether any key is missing at all |
| GET | `/api/products` | history list |
| POST | `/api/products` | create a product and queue its listing text |
| POST | `/api/run/:id` | start (or restart) that product's listing-text job |
| GET | `/api/products/:id` | one product with per-slot status; poll it until `status` is `text` or `failed` |
| POST | `/api/products/:id/image/:slotId` | upload one listing image (raw JPG/PNG body) |
| DELETE | `/api/products/:id/image/:slotId` | remove that image |
| POST | `/api/products/:id/package` | build the ZIP |
| GET | `/api/products/:id/download` | download the ZIP |
| GET | `/api/products/:id/image/:slotId` | preview one image |
| GET | `/api/products/:id/text/:fileKey` | download `file1_text` or `file2_text` |
| GET | `/api/products/slots` | the 7 slot definitions + image rules |
| GET | `/api/settings` | provider, saved key status and available models |
| PUT | `/api/settings/key` | save a provider key — `gemini`, `anthropic` or `groq` (applies to the next request) |
| DELETE | `/api/settings/key` | remove the saved key and fall back to `.env` |
| PUT | `/api/settings/model` | choose which text model to call |
| DELETE | `/api/settings/model` | go back to the `.env` model |
| PUT | `/api/settings/brand` | save the brand name used in PDFs and prompts |
| DELETE | `/api/settings/brand` | reset the brand name to the built-in placeholder |

Everything except the four `/api/auth/*` routes needs the `listing_session` cookie as soon as a
password exists. Hosted, there is no way round that: a deployment with no password yet answers every
other endpoint with 401 until the first screen creates one.

---

## 8. Troubleshooting

**"Cannot reach the server. Is the backend running on port 4000?"**
Start the backend (setup step 4). The frontend proxies `/api` to `http://localhost:4000`.

**"Sign in to use this portal."**
The password screen is up because a password is set (or this copy is hosted). Five wrong tries in a
row adds a 60-second wait before the next one is even checked.

**I forgot the portal password**
There is no email reset, by design: the only record of it is the hash in your own database. Locally,
start the backend and run `node -e "import('./src/db.js').then(m => m.deleteSetting('auth.password'))"`
from `server/` to clear it, then set a new one on the next screen. On Netlify, delete the
`auth.password` row in the database's table view and reload the site.

**"Could not connect to MySQL" on startup**
1. Open XAMPP Control Panel → **Start** next to MySQL.
2. Confirm `DB_USER=root` and `DB_PASSWORD=` (empty) in `server/.env` — those are the XAMPP defaults.
3. If you set a MySQL root password in XAMPP, put it in `DB_PASSWORD`.

**"ANTHROPIC_API_KEY is missing from server/.env"**
Paste your key after `ANTHROPIC_API_KEY=` and **restart the backend**. The yellow banner at the
top of the page tells you which key is missing.

**"No free requests left today"**
Gemini counts the free daily quota per model, and a new key on the same Google project shares that
count, so a fresh key does not always reset it. The portal already moves on to the next model by
itself, then to the other provider if its key is saved, so you only see this when both are dry.
Settings → Model still decides which model is asked first. `gemini-*-flash-lite` models answer
sooner but write noticeably shorter guides than the 900-1,300 words the prompt asks for, so a lite
answer is always flagged and no PDF is printed for it.

**"Neither provider wrote the listing"**
Both providers declined, and the message carries each one's own reason, starting with the provider you
chose in the dropdown:
- *Groq rejected the API key* — the key is wrong or from another service; paste the right one in
  **Settings → Access keys**, or fix `GROQ_API_KEY` in `server/.env` and restart. (A `gsk_…` key is a
  Groq key — it does not belong in the Gemini row.)
- *Groq has no model called …* — the saved Groq name is not one Groq serves; pick one of the names in
  the Groq group of the dropdown, or add it to `server/models.json`.
- *Groq is out of requests too* — genuine rate limiting on Groq's side; wait a minute and click
  **Rewrite text**.
- *No Gemini API key is saved* / *No Groq API key is saved* — that provider was skipped, not called.
If you would rather not use one of them, remove its key in Settings and the portal uses the other.

**"This model is currently experiencing high demand" (503)**
Temporary on the flash models. Each one is retried once, then the next model in the chain is asked,
and the other provider is asked after that if its key is saved — so a single busy model no longer
stops a listing. "All 4 Gemini models are busy" with no answer from the other provider means the whole
chain was saturated and no key is configured for it; demand spikes usually pass within 15 minutes, and
the free quota resets around 05:00.

**"Claude did not return valid JSON"**
The model wrapped its answer in prose. Just click **Rewrite text** — the server already strips
markdown fences and extracts the JSON object, so this is rare.

**"Claude hit the output token limit"**
File 1 + File 2 together exceeded 8000 output tokens. Raise `max_tokens` in
`server/src/claude.js`, or ask for a shorter guide.

**"Expected 4 mockup prompts, got 3"**
Claude returned the wrong shape. The server retries once automatically; if it still fails you
get HTTP 422 with the reason. Click **Rewrite text**.

**An upload is rejected**
The reason appears in the red banner and nothing is saved. Common ones: the file is under 2000px
wide, it is not 4:3, or it is a WebP/GIF/HEIC that a listing cannot use anyway. Convert it to JPG or
PNG, crop to 4:3, and upload again.

**Upload rejected: "Wrong shape: 3000x2000 is 1.500:1"**
Your file is 3:2, not 4:3. Crop it to 4:3 (e.g. 3000x2250 or 2000x1500) and upload again.

**My ZIP is missing an image**
The ZIP is a snapshot of whatever was in the slots when you clicked **Create ZIP**. If you added or
replaced an image afterwards, the old ZIP is deleted and the button reads **Create ZIP** again. Build
it last.

**I want to start with a clean history**
Use **History → Clear all** in the browser; it removes the rows and the folders. The SQL equivalent
has to go through `product_images` first, because MySQL refuses to truncate a table another table
points at:
```sql
USE etsy_listing_generator;
DELETE FROM product_images;
DELETE FROM products;
```
then delete the folders inside `server/data/products/`.

---

## 9. Hosting it (Netlify)

`netlify.toml` already describes the whole deployment; a push to the default branch builds and
publishes it, so changes made here appear on the site without any manual step.

| Piece | Where it runs |
|-------|---------------|
| React app | built by Vite into `client/dist`, served as static files |
| `/api/*` | `netlify/functions/api.mjs` — the same route table the local server uses |
| the listing-text job | `netlify/functions/run.mjs` — a background Function, so a 30–60 second model answer is never cut off |
| products, settings, keyword cache | Netlify's managed Postgres (`DATABASE_URL` is provided automatically; the schema creates itself on first use) |
| PDFs, uploaded images, ZIPs | Netlify Blobs store `listing-files`, under `products/<id>/…` |
| API keys | **Settings → Access keys** in the deployed app, which stores them in your database, or site secrets for `GEMINI_API_KEY` / `GROQ_API_KEY` |

What changes when it is hosted:

- **You sign in with a portal password.** A hosted build is locked before the password exists: the
  first screen asks you to create one, and after that every page, download and API call needs the
  session cookie it hands out. Netlify's own site-password feature is not on the free plan, so the
  gate lives in the app. Locally the portal stays open until you create a password yourself in
  **Settings → Portal password**.
- **Uploads are capped near 4 MB**, because one Function invocation cannot carry the 25 MB a local
  disk accepts. Compress the image, or run the portal on your own machine for full-resolution files.
- **The private files stay private.** `masterPrompt.js`, `rules.js` and `.env` are git-ignored, so a
  cloned or hosted build gets the generic `*.example.js` copies that `npm run setup` writes during the
  build. Edit your own wording locally; publish only the tool. A deployment built from this public
  repository therefore writes listings from the generic example prompt, so give the hosted site your
  own `masterPrompt.js` and `rules.js` (private repo, or uploaded into the deploy) before relying on it.
- **Brand and keys are per-database.** A fresh deployment has the neutral placeholder brand and no
  keys; set them once in the deployed Settings and they are stored in that deployment's database.
  Your local MySQL rows never travel to the site, and the git repository never sees any of them.

### What it costs

Netlify's free plan is credit-based now: 300 credits a month, and the meter you will actually see is

| What | Free allowance | Credits |
|------|----------------|---------|
| A production deploy (every push, with auto-deploy on) | shared pool | 15 each, so about 20 pushes a month |
| Function execution | shared pool | 10 per GB-hour; a 60-second generation is roughly 0.2 |
| Bandwidth | shared pool | 20 per GB out |
| Netlify Database | 3 databases, 5 GB storage, 5 GB transfer, 48 DB compute units per period | no charge inside it |
| Blobs | included on the free plan; the docs do not publish a separate storage figure | small |

A few listings a day uses almost none of that. The push-equals-deploy rule is the expensive part, so
push when a change is finished rather than after every edit — or turn auto-deploy off in
**Site configuration → Build & deployment** and deploy by hand.

Exceeding 300 credits pauses the site rather than billing you, because the free plan has no
auto-recharge. Nothing here needs a card until you outgrow it.

---

## 10. Notes on the Claude model

`ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5` as specified. If your API key rejects that
model id with a 404, set `ANTHROPIC_MODEL` in `server/.env` to a model your key can access and
restart the backend — no code change needed.
