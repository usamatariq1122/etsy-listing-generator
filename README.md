# Listora

Web portal that turns one product name into a complete listing package:

- **File 1** — `product-content.pdf`, the customer-facing guide (validated: no brackets, citations, source references or footnotes)
- **File 2** — `listing-seo-package.pdf`, SEO title, 13 tags, description, category mapping, image placement guide, checklist
- **7 image prompts** — written for you to run in any image tool, plus 7 upload slots that validate every file at 4:3 / min 2000px
- **One ZIP** — `listing-package.zip`: the 2 PDFs plus the images you added, named `01-cover.jpg` … `07-license.jpg`.
  Either PDF can be replaced by your own before you build it — see section 5
- **History** — every product is stored in Postgres with a download link

Stack: React (Vite) · Node.js backend (no framework) · Postgres (Netlify managed) ·
Gemini, Groq or OpenRouter for the text.

---

## 1. First-time setup

The database is Postgres in both places. Hosted it is Netlify's managed Postgres; locally
`netlify dev` starts an equivalent one for you, so nothing has to be installed or configured
by hand — no MySQL, no XAMPP.

1. **Install dependencies**:
   ```bash
   cd server && npm install
   cd ../client && npm install
   npm install -g netlify-cli      # local development runs on `netlify dev`
   ```

2. **Create your local files.** From the `server` folder run `npm run setup`. It copies
   `.env.example` to `.env`, `src/masterPrompt.example.js` / `src/rules.example.js` to
   `src/masterPrompt.js` / `src/rules.js`, and `src/prompts/wording.example.js` to
   `src/prompts/wording.js`. It never overwrites a file that already exists.
   Those five are git-ignored on purpose: your keys, your shop's wording and your brand live only
   on your machine. Edit the copies — the `.example` files are the generic starting point.

3. **Add your API key.** Open `server/.env` in a text editor and replace the placeholder:
   ```
   GEMINI_API_KEY=...your real key...
   ```
   Anthropic works too — set `ANTHROPIC_API_KEY` and `TEXT_PROVIDER=anthropic`. The provider and
   model can also be changed from the **Settings** tab in the browser, which stores them in the
   database and uses them from the next request without a restart.
   Optional: add a **Groq** or **OpenRouter** key as another provider — see section 4. Paste it in
   **Settings → Access keys**, or put `GROQ_API_KEY` / `OPENROUTER_API_KEY` (and, if you like,
   `GROQ_MODEL` / `OPENROUTER_MODEL`) in this file instead.
   Keys never leave the backend: the browser only ever sees the last 4 characters, and a key whose
   format belongs to another service (`gsk_…`, `AQ.…`, `sk-ant-…`, `sk-or-…`) is refused in the wrong
   row instead of quietly breaking the provider that already works. `.env` is git-ignored;
   `.env.example` is the template.

4. **Set the key that encrypts your saved keys.** Anything you paste into **Settings → Access keys**
   is written to the database encrypted (AES-256-GCM), and `ENCRYPTION_KEY` in `server/.env` is the
   only copy of the code that reads it back:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste the result after `ENCRYPTION_KEY=`. Without it the portal still reads keys that were saved
   earlier, but saving a new key is refused with a message asking you to set this first, so no key is
   ever written in the clear.

5. **Start everything** — one command, from the project root (not from `server/`):
   ```bash
   netlify dev
   ```
   It starts the local Postgres, builds both Functions and runs the Vite dev server. Leave this
   terminal open.

6. **Open** http://localhost:5173 — the local portal. `netlify dev` also prints port 8888; that one
   serves the API only, because the deploy-only rules in `netlify.toml` (the catch-all redirect and
   the security headers) break the Vite dev server when it is reached through 8888. The portal is not
   password-protected until you create a password yourself in **Settings → Portal password**.

<details>
<summary>Running the API on its own (optional)</summary>

`cd server && npm run dev` starts only the API on `http://localhost:4000`, serving `client/dist` if
you have built it. It needs a Postgres of its own, so put `DATABASE_URL=postgres://…` in
`server/.env` first. To develop the client against that API instead of `netlify dev`, start Vite with
the proxy pointed at it: `VITE_API_TARGET=http://localhost:4000 npm run dev --prefix client`.

</details>

---

## 2. Using it

The default screen is deliberately short: a product name box, **Generate Listing Package**, and one box for a ZIP
of photos. Everything optional sits inside the collapsed **Advanced Settings** panel underneath it, which is
closed until you open it. Its summary line shows how many keywords you ticked and which model is asked
first, so you can see the state without opening it.

1. Type the product name or niche, e.g. `Crochet dragon pattern`, and click **Generate Listing Package**. The text
   model writes File 1, File 2 and the 7 image prompts (30–60 seconds). That work runs as a job, not
   inside the click: the portal starts it and then asks for the result until it arrives, so a slow model
   or a strict proxy cannot lose the answer. The notice bar afterwards names the model that answered, and
   how many busy models had to be skipped on the way to it.
2. **Advanced Settings → SEO keywords** is optional. **Find keyword ideas** shows what shoppers actually type
   (live search autocomplete, cached for a day) with the character count of each phrase and whether it
   fits a 20-character tag. Tick the ones you want — **the first tick is treated as the main keyword** —
   then generate. Only the phrases you ticked are handed to the model. Left unticked, the portal gathers
   the queries itself and uses the whole list, as before.
3. **Advanced Settings → Model, keys and access** holds the model picker, the saved API keys, the brand name and
   the portal password. Nothing there is needed for a normal run.
4. Read the **Listing preview** card. It shows the title, the 13 tags, the description and the category and
   attribute lines exactly as File 2 carries them, so you can copy them without opening the PDF. **Edit**
   turns those three fields into boxes you can rewrite before any PDF is built — the checker under them
   speaks the marketplace's own limits (title 140 characters, exactly 13 tags, 20 characters per tag, no
   repeats) and refuses to save until they pass. Saving rewrites File 2 in place and reprints its PDF, so
   the printed file never disagrees with what you typed. The marketplace name is stripped from anything
   you enter, the same as from a model's answer. The
   **price** box is empty until you type a number: the portal never suggests one, and the value is saved
   with the listing so it comes back from History. The preview also states plainly that the guide is a
   draft you have to test yourself before selling anything made from it.
5. Read the **SEO check** score under the listing text. It is a checklist of the marketplace's own
   limits (13 tags, 20 characters per tag, no repeats) plus the two placement habits that matter, scored
   against the keywords you ticked, with the reason next to every line. It is a checklist, not a
   ranking guarantee, and it never says your listing will rank.
6. Make the 7 images with the prompts shown under **Listing text** — paste each prompt into the image
   tool you like.
7. Put them in the **Listing photos** box as one ZIP, or open **Listing images** and pick a file for each
   slot. Dropping the ZIP lists its images in file-name order against the 7 slots; change any row's slot
   to reassign (an occupied slot swaps instead of dropping), then click **Fill N slots**. Each image is
   checked by the same per-slot upload as a manual pick, so the row shows a tick with its dimensions or a
   cross with the refusal reason. Anything that is not 4:3 or is under 2000px wide is never saved. The
   ZIP itself is only opened in your browser — it never reaches the server or a disk.
   When a photo is the wrong shape or too big to upload, that row offers **Crop to 4:3** / **Compress** —
   your browser crops a centre 4:3 block and re-encodes it in place so a camera photo fits, but only after
   you click it; nothing is ever altered without you asking. It will not shrink below 2000px wide, and if
   the source cannot both fit 4:3 and stay that wide, it says so instead of making a file the server will
   refuse.
8. Look at **Package and download**. It lists the exact files the ZIP will hold — both PDFs and every
   image — with the size and status of each one, before anything goes anywhere. If you already have your
   own file for either PDF, click **Upload your own PDF** on that row and pick it; the row then reads
   *Your PDF* with the name you gave the file, and **Use the portal's PDF** puts the rendered one back.
9. Click **Create ZIP**, then **Download ZIP**. Adding or replacing an image or a PDF retires the old
   ZIP, so build it last.
10. If you turned Etsy on (section 5), **Create Etsy Draft** appears under the images. Answer Etsy's four
    questions — category, copies available, who made it, when it was made — and the draft is saved to your
    shop with the images and both PDFs attached. It is a draft: nothing is published, and nothing here can
    publish it. Left off, you see no sign of any of this.
11. **History** in the top-right lists every past product with its download link. Click **Open** to resume
   one — its ticked keywords and its price come back, and the keywords show in the Advanced Settings summary.

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
> (`listing-seo-package.pdf`) and your master prompt asks it for "13 Etsy search tags", so the platform
> name is expected there. It is a seller's working paper and never goes to a buyer. The file *names* the
> ZIP uses — `product-content.pdf`, `listing-seo-package.pdf`, `listing-package.zip` — carry no
> marketplace word, so nothing you hand over or upload is labelled with one. If you want File 2 scrubbed
> too, scrub `result.file2_text` in `server/src/service.js`.

**Mockup prompts** are asked for as 4:3 landscape shots ending in `no text, no logos` (the rule lives in
`server/src/prompts/wording.js`, which is the only place the brief is written).

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
- `GET /api/keywords?q=<niche>` serves that same list to the tick screen (`KeywordPicker`), and the
  phrases you tick are stored on the product as `selected_keywords`, so reopening it from History
  shows what you picked. Unticked means the server looks the queries up itself, as before.

**The SEO check panel.** `server/src/seoCheck.js` scores the finished title, tags and description
against the keywords you ticked, after `repairSeo` and `alignSeo` have run — so it grades exactly the
text you will copy into the marketplace, not the model's first draft. Six checks: the main keyword
opens the title, the main keyword appears in the first two lines of the description, there are 13 tags,
every tag is 20 characters or less, no tag repeats, and no tracked phrase is used more than 3 times.
The score is the pass count, and every line carries its reason. "Ranking" is not a word it uses: the
panel prints its own disclaimer that this is a checklist of the marketplace's limits and common search
habits, not a ranking guarantee. The report is stored inside the product's `warnings` JSON, so a
listing reopened from History still shows the score it earned.

**Every prompt is sanitised twice over.** `normalizeShape` in `validate.js` runs each generated field
through `scrubBranding` (which keeps only the configured brand) and, for the seven image prompts,
through `scrubBannedWord` as well. A prompt therefore cannot carry another shop's name or the
marketplace word into the image tool you paste it into, whatever the model decided to write.

**Model failover.** Settings has one model dropdown with three groups — **Gemini**, **Groq** and
**OpenRouter** — and the choice remembers which provider owns the model
(`server/src/apikeys.js`, `selectedModel`). Whichever group you pick in, that provider is asked first;
the others are the carry-over, in the order Gemini → Groq → OpenRouter.

- A **Gemini** model chosen: `server/src/textgen.js` walks the Gemini list from best to lite, trying
  the next model whenever an answer says *this model cannot help right now* — a 503 high-demand
  rejection, a 429 quota exhaustion, or a 200 that carries no text at all. Only when the whole chain
  is dry does it ask **Groq**, and then **OpenRouter**.
- A **Groq** model chosen: that model is called through the OpenAI-compatible endpoint
  (`server/src/groq.js`); if it declines, the Gemini chain above is run, then OpenRouter.
- An **OpenRouter** model chosen: it is called through OpenRouter's OpenAI-compatible gateway
  (`server/src/openrouter.js`), which reaches any model in its catalogue under one key. If it
  declines, the Gemini chain runs, then Groq.

A problem that is yours to fix (a malformed answer, or a missing or invalid key when no other
provider has a key either) is never swallowed by a failover; it is reported straight away. A provider
with no saved key is simply skipped, so a dead Gemini key is covered by a saved Groq or OpenRouter key
and vice versa. The model names in each group come from **`server/models.json`**, which is re-read on
every request: add or remove a name there and it appears in the dropdown on the next page load, with
no code change and no restart. `GEMINI_TEXT_MODEL` / `GROQ_MODEL` / `OPENROUTER_MODEL` in
`server/.env` only choose which name of a group is asked first when nothing is picked in Settings.

Either way the notice bar says who answered: `Written by gemini-3.5-flash, after
2 busy model(s) were skipped`, or `Written by Groq (llama-3.3-70b-versatile), after 4 busy model(s)
were skipped`.

**The guide quality gate.** Every answer is measured before anything is printed
(`guideQuality` in `server/src/service.js`):
- the notice bar always says which provider and model wrote the text, and how many busy models were skipped
- a **flash-lite** Gemini answer is flagged even when it is long enough, because that model writes thin guides
- a File 1 under **900 words** is flagged with the model name and the exact word count — the same rule
  applies to a Groq or OpenRouter answer, whichever provider was asked first
- when either applies, **no PDF is rendered** — the warning banner says so, the manifest in
  **Package and download** reads `⚠ not printed`, and clicking **Create ZIP** is what prints them,
  so a short guide can never reach a buyer by accident

---

## 5. Listing images and PDFs

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

**Two ways in.** Either pick a file for one slot under *Listing images*, or drop **one ZIP** of up to 7
images on the *Listing photos* box. The ZIP is opened in the browser by `client/src/unpack.js`
(fflate), never uploaded: it rejects an unsafe member path, a nested archive, any compression the
browser cannot read, more than 7 images, and a set that would unpack past 100 MB, while ignoring
`__MACOSX`, `.DS_Store`, `Thumbs.db` and non-image files instead of failing on them. What is left is
listed in `ZipSlots.jsx` in file-name order, one row per slot, and you can change any row's slot —
choosing an occupied slot swaps the two images rather than dropping one. **Fill N slots** then posts
each file through the same per-slot route as a manual upload, so the server's rules stay the only
gate: every row shows a green check with its real dimensions or a red cross quoting the exact 422
reason, and accepted files go under their numbered names on the next ZIP build.

**The two PDFs, yours or the portal's.** Each deliverable is one row in the `product_documents` table:
`generated` for the PDF printed from the listing text, `uploaded` for a PDF you put in its place. The
upload goes to `PUT /api/products/:id/document/:fileKey` and is checked by `server/src/pdfcheck.js`
before a byte is stored — the `%PDF-` header in the first kilobyte, the `%%EOF` trailer in the last one,
and a size under `PDF_RULES.maxBytes` (25 MB locally, about 4 MB hosted). A file extension is never
believed on its own; renaming a Word document to `.pdf` gets *"That file is not a PDF, whatever it is
called."* The uploaded file is then stored **under the deliverable's own name**, so the ZIP entry never
changes and the name you gave your file stays in the row as `original_name` for the table to show you.
Deleting the upload (`DELETE` on the same route) removes it and re-registers the rendered PDF, which is
still in storage, so **Use the portal's PDF** costs nothing and re-renders only if that file is gone.
Neither upload nor restore is ever packed silently: both retire the old ZIP, exactly like an image
change does.

**A draft in your own shop — optional, off by default.** Nothing about Etsy appears anywhere in the
interface until `ETSY_ENABLED=true` is set along with `ETSY_KEYSTRING` and `ETSY_SHARED_SECRET`, from
an app you register at `etsy.com/developers/register`. **Etsy must approve that key before anything
here works** — an unapproved key is refused by every endpoint, and the portal says so in Etsy's own
words rather than pretending the shop is broken. The ZIP download is the primary route to a listing
and does not care about any of this.

When it is on, one **Connect Etsy Shop** button starts OAuth 2.0 with PKCE: the portal builds a random
43-character verifier, sends only its SHA-256 as the challenge, and keeps the pair (with a one-use
`state`) encrypted in the database for ten minutes. Etsy redirects back to `/api/etsy/callback`, which
exchanges the code and stores the tokens; the callback only ever answers with a redirect into the
studio, carrying a sentence, never a token. Only the `listings_w` scope is requested, which is the
minimum that can create a draft.

Tokens live in the `settings` table inside the same AES-256-GCM envelope as your API keys
(`server/src/secrets.js`), are refreshed automatically a minute before their hour is up, and are never
written to a log, returned to the browser, or shown in the interface — which sees only the shop's name.
The shop is chosen from the numeric user id at the front of the access token; if that account has more
than one shop, the portal refuses to guess.

**Create Etsy Draft** then follows the order Etsy documents for a digital product, in
`server/src/draft.js`: `createDraftListing` → `uploadListingImage` for each filled slot, in ZIP order →
`uploadListingFile` for both PDFs → `updateListing` with `type=download` (files cannot be attached
during create) → `getListing` to read it back. It sends the title, description, 13 tags and the price
you typed, plus two questions only you can answer — *who made it* and *when it was made* — and the
category you picked from Etsy's own tree. It **cannot** publish: no `state` is ever sent, `listings_d`
is never requested, so nothing here can delete a listing either. What comes back is Etsy's draft link,
kept on the product row so History shows it again and a second click is refused instead of making a
second listing. If a later step fails, the message says how far it got and gives you the link, so the
half-built draft is never an orphan you cannot find.

The category tree itself is public data: `server/src/taxonomy.js` fetches it once a day, flattens it to
leaf paths and caches it in `taxonomy_cache`, and the studio filters that locally — so typing a
category costs no requests, and choosing one Etsy has never heard of is refused before anything is
sent. The marketplace name stays out of every generated file: it appears in this README, in the server
code and in the connection screen, and never in a PDF, a prompt or an image.

---

## 6. Project layout

```
Etsy portal/
├── netlify.toml          hosting: static client + Functions + build command
├── server/
│   ├── .env              ← your keys (never committed)
│   ├── .env.example      ← template
│   ├── models.json       ← the model names the Settings dropdown offers
│   ├── netlify/functions/
│   │   ├── api.mjs       every /api/* route, as one Netlify Function
│   │   └── run.mjs       the listing-text job, as a background Function
│   ├── data/products/    ← generated PDFs, uploads and ZIPs when the API runs on its own; under
│   │                       `netlify dev` those files live in Netlify's local Blobs instead
│   └── src/
│       ├── index.js          local node:http server, static client, error handler
│       ├── api.js            the route table, shared by both runtimes
│       ├── auth.js           portal password, session cookie and the sign-in guard
│       ├── config.js         env parsing + requireKey()
│       ├── apikeys.js        saved keys, brand and the grouped provider/model choice
│       ├── modelCatalog.js   reads server/models.json on every request
│       ├── db.js             Postgres: Netlify's managed database hosted, `netlify dev`'s locally
│       ├── secrets.js        AES-256-GCM for the API keys stored in the database
│       ├── httperror.js      the one error type the API throws: a message, a status, extra fields
│       ├── headers.js        the four security headers, for API responses
│       ├── files.js          listing files: disk locally, Netlify Blobs when hosted
│       ├── etsy.js           the Etsy OAuth flow and the six calls a draft needs (off by default)
│       ├── taxonomy.js       Etsy's category tree, flattened and cached for a day
│       ├── draft.js          the order a digital draft is built in: listing, images, files, type
│       ├── generate.js       the listing-text job: run it, record the result or the failure
│       ├── masterPrompt.js   the re-export the providers import (git-ignored)
│       ├── masterPrompt.example.js  generic stand-in that `npm run setup` copies
│       ├── prompts/
│       │   ├── listing.js    the brief's mechanics: tokens, keywords, blob lookup
│       │   ├── wording.js    the shop's own listing brief (git-ignored)
│       │   └── wording.example.js  generic stand-in that `npm run setup` copies
│       ├── rules.js          banned word, branding, image rules (git-ignored)
│       ├── rules.example.js  generic stand-in that `npm run setup` copies
│       ├── keywords.js       live buyer queries + the keyword cache
│       ├── seoCheck.js       the six-point SEO score for the finished title, tags and description
│       ├── claude.js         Anthropic call (JSON prefill) + JSON extraction
│       ├── gemini.js         one Gemini model call, structured output + friendly errors
│       ├── groq.js           OpenAI-compatible Groq call (key from Settings or GROQ_API_KEY)
│       ├── openrouter.js     OpenAI-compatible OpenRouter call (key from Settings or OPENROUTER_API_KEY)
│       ├── textgen.js        provider dispatch in the chosen order, model failover
│       ├── retry.js          transient-failure retry with a time budget
│       ├── validate.js       File 1 cleaning/validation, SEO repair and alignment
│       ├── listingFields.js  reads the title/tags/description back out of File 2
│       ├── listingEdit.js    writes a seller's edit back into File 2, then checks it landed
│       ├── service.js        generate-with-retry pipeline + the guide quality gate
│       ├── imageinfo.js      reads JPG/PNG width and height from the file header
│       ├── imagegen.js       free slot-image drawing: Cloudflare Workers AI or Pollinations, then the slot checks
│       ├── bulk.js           reads a CSV of product names into rows for the bulk screen
│       ├── uploads.js        validate + store + remove one slot image
│       ├── pdfcheck.js       proves an uploaded file really is a PDF, and within the size limit
│       ├── theme.js          the four PDF colours a seller saves in Settings, over the built-in palette
│       ├── zip.js            PDF rendering, your-PDF-or-the-portal's choice, ZIP packaging
│       ├── slots.js          the 7 slot definitions
│       └── paths.js          file keys + id sanitising
│   └── test/                 `node:test` suites for the rules that must never slip: validate,
│                             listingFields, slots, imageinfo, seoCheck, keywords, auth, retry/jsonparse
└── client/
    └── src/
        ├── App.jsx           state, loading banners, error banners
        ├── api.js            fetch wrapper + the polling loop
        ├── labels.js         status labels
        ├── unpack.js         opens your ZIP in the browser: nothing is written to disk
        ├── fitImage.js       crops a centre 4:3 block and re-encodes an image in the browser
        ├── legal.js          the Terms of Service and Privacy Policy text
        └── components/       Login, LegalView, ProductForm, ZipDrop, ZipSlots, AdvancedPanel,
                              KeywordPicker, Workspace, ListingPreview, TextPreview, SeoScore,
                              UploadSlots, PackagePanel, EtsyPanel, HistoryView, SettingsView
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
| POST | `/api/products` | create a product and queue its listing text — optional `keywords` array of the phrases you ticked |
| GET | `/api/keywords?q=<niche>` | the tick screen's suggestions: each phrase, its length and whether it fits a tag |
| POST | `/api/run/:id` | start (or restart) that product's listing-text job |
| GET | `/api/products/:id` | one product with per-slot status; poll it until `status` is `text` or `failed` |
| POST | `/api/bulk` | create a batch from CSV text (`{ name, csv }`) — one product per row, capped at 50; returns the rows to run |
| GET | `/api/bulk` | recent batches with their row counts |
| GET | `/api/bulk/:id` | one batch and its rows with status |
| PUT | `/api/bulk/:id/row/:idx` | record a row's status as it runs (`queued` / `running` / `done` / `failed`) |
| POST | `/api/bulk/:id/retry` | send every failed row back to the queue and return them |
| DELETE | `/api/bulk/:id` | forget the batch (the products it made stay in History) |
| PUT | `/api/products/:id/price` | store the price you typed (`""` clears it); a non-number is refused |
| PUT | `/api/products/:id/listing` | rewrite the title, tags or description in File 2 and reprint its PDF; a marketplace name is stripped and an edit that would not fit is refused |
| POST | `/api/products/:id/image/:slotId` | upload one listing image (raw JPG/PNG body) |
| POST | `/api/products/:id/image/:slotId/generate` | draw this slot's own listing prompt into the slot — free image generation, Cloudflare Workers AI when `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` are set, otherwise Pollinations.ai (no key); the result goes through the same 4:3 / 2000px / JPG-PNG checks as an upload |
| DELETE | `/api/products/:id/image/:slotId` | remove that image |
| PUT | `/api/products/:id/document/:fileKey` | use your own PDF for `file1_text` or `file2_text` (raw PDF body, `?name=` for the label) |
| DELETE | `/api/products/:id/document/:fileKey` | drop your PDF and print that deliverable from the listing text again |
| POST | `/api/products/:id/package` | build the ZIP |
| GET | `/api/products/:id/download` | download the ZIP |
| GET | `/api/products/:id/image/:slotId` | preview one image |
| GET | `/api/products/:id/text/:fileKey` | download one deliverable PDF — yours if you uploaded one, the rendered one otherwise |
| GET | `/api/products/slots` | the 7 slot definitions + image rules |
| GET | `/api/settings` | provider, saved key status and available models |
| PUT | `/api/settings/key` | save a provider key — `gemini`, `anthropic`, `groq` or `openrouter` (applies to the next request) |
| DELETE | `/api/settings/key` | remove the saved key and fall back to `.env` |
| PUT | `/api/settings/model` | choose which text model to call |
| DELETE | `/api/settings/model` | go back to the `.env` model |
| PUT | `/api/settings/brand` | save the brand name used in PDFs and prompts |
| DELETE | `/api/settings/brand` | reset the brand name to the built-in placeholder |
| PUT | `/api/settings/theme` | save the four PDF colours (`ink`, `accent`, `muted`, `hairline`), hex only |
| DELETE | `/api/settings/theme` | drop the saved colours and print in the built-in palette again |
| GET | `/api/etsy/status` | is Etsy switched on, is a shop connected, its name, and Etsy's own answer options |
| POST | `/api/etsy/connect` | the Etsy sign-in URL (PKCE challenge + a one-use state, both kept encrypted) |
| GET | `/api/etsy/callback` | where Etsy sends the browser back to; exchanges the code and redirects into the studio |
| GET | `/api/etsy/categories` | Etsy's category tree, flattened to leaf paths and cached for a day |
| POST | `/api/etsy/draft` | save this package in the connected shop as a draft listing |
| DELETE | `/api/etsy/connection` | forget the shop's tokens; nothing on Etsy is touched |

The five `/api/etsy/*` routes after `status` answer 503 until `ETSY_ENABLED`, `ETSY_KEYSTRING` and
`ETSY_SHARED_SECRET` are all set, so a build without the flag has no way to reach Etsy by accident.

Everything except the four `/api/auth/*` routes needs the `listing_session` cookie as soon as a
password exists. Hosted, there is no way round that: a deployment with no password yet answers every
other endpoint with 401 until the first screen creates one.

---

## 8. Troubleshooting

**"Cannot reach the server."**
Local development runs on `netlify dev`: it serves the API and the local database on port 8888 and
starts the Vite dev server on port 5173, which proxies `/api` to it. Open **http://localhost:5173**
and edit files under `client/` as usual — 8888 is for the API only.

**The page is blank on http://localhost:8888**
8888 is the API. The catch-all redirect and the security headers in `netlify.toml` are written for a
deploy, and both stop the Vite dev server from loading through that port. Open
http://localhost:5173 instead.

**"Sign in to use this portal."**
The password screen is up because a password is set (or this copy is hosted). Five wrong tries in a
row adds a 60-second wait before the next one is even checked.

**I forgot the portal password**
There is no email reset, by design: the only record of it is the hash in your own database. Locally,
start the backend and run `node -e "import('./src/db.js').then(m => m.deleteSetting('auth.password'))"`
from `server/` to clear it, then set a new one on the next screen. On Netlify, delete the
`auth.password` row in the database's table view and reload the site.

**"Could not reach the database" on startup**
1. Local development gets its Postgres from `netlify dev`, which starts one and hands the Functions
   its URL. Starting `server/src/index.js` on its own needs `DATABASE_URL` in `server/.env`.
2. Hosted, the project must have Netlify Database enabled (`netlify database status` says so), and
   the schema in `netlify/database/migrations/` is applied by the deploy.
3. `DB_PGSSL=require` or `DB_PGSSL=disable` only matter for a Postgres outside Netlify that disagrees
   about TLS.

**"Saved API keys are encrypted and ENCRYPTION_KEY is not set"**
A key already in the database was written with an `ENCRYPTION_KEY` this build cannot see. Put the
same value back in `server/.env` (locally) or in the Netlify site secret, then restart or redeploy.
Keys saved *before* encryption existed are still readable without it, and are rewritten encrypted the
first time the portal starts with a key set.

**"ANTHROPIC_API_KEY is missing from server/.env"**
Paste your key after `ANTHROPIC_API_KEY=` and **restart the backend**. The yellow banner at the
top of the page tells you which key is missing.

**"No free requests left today"**
Gemini counts the free daily quota per model, and a new key on the same Google project shares that
count, so a fresh key does not always reset it. The portal already moves on to the next model by
itself, then to the other providers if their keys are saved, so you only see this when all of them are
dry.
Settings → Model still decides which model is asked first. `gemini-*-flash-lite` models answer
sooner but write noticeably shorter guides than the 900-1,300 words the prompt asks for, so a lite
answer is always flagged and no PDF is printed for it.

**"No provider wrote the listing"**
Every provider with a key declined, and the message carries each one's own reason, starting with the
provider you chose in the dropdown:
- *Groq rejected the API key* — the key is wrong or from another service; paste the right one in
  **Settings → Access keys**, or fix `GROQ_API_KEY` in `server/.env` and restart. (A `gsk_…` key is a
  Groq key — it does not belong in the Gemini row.)
- *Groq has no model called …* — the saved Groq name is not one Groq serves; pick one of the names in
  the Groq group of the dropdown, or add it to `server/models.json`.
- *Groq is out of requests too* — genuine rate limiting on Groq's side; wait a minute and click
  **Rewrite text**.
- *OpenRouter rejected the API key* — the `sk-or-…` key is wrong or belongs to another service; save
  the right one in **Settings → Access keys**.
- *OpenRouter has no model called …* — OpenRouter names models `provider/name`, and the saved one is
  not in its catalogue; pick a name from the OpenRouter group or add it to `server/models.json`.
- *OpenRouter has no credits left* — that gateway bills per request instead of giving a daily free
  quota; choose a cheaper model there, or add credit to the OpenRouter account.
- *No Gemini API key is saved* / *No Groq API key is saved* / *No OpenRouter API key is saved* — that
  provider was skipped, not called. If you would rather not use one of them, remove its key in
  Settings and the portal uses the others.

**"This model is currently experiencing high demand" (503)**
Temporary on the flash models. Each one is retried once, then the next model in the chain is asked,
and the other providers are asked after that if their keys are saved — so a single busy model no
longer stops a listing. "All 4 Gemini models are busy" with no answer from the other providers means
the whole chain was saturated and no key is configured for them; demand spikes usually pass within 15
minutes, and the free quota resets around 05:00.

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

**My ZIP is missing an image or a PDF**
The ZIP is a snapshot of whatever was in the slots and in **Package and download** when you clicked
**Create ZIP**. If you added or replaced an image or uploaded your own PDF afterwards, the old ZIP is
deleted and the button reads **Create ZIP** again. Build it last.

**My own PDF is refused**
*"That file is not a PDF, whatever it is called."* — the file has no `%PDF-` header or no `%%EOF`
trailer, so it is a Word, Pages or screenshot file with a `.pdf` name on it. Export it as a PDF from
the program that made it. *"That file is N MB."* — over the limit this host accepts (25 MB on your own
machine, about 4 MB hosted); export it with a smaller/pressed option. Either way nothing is stored and
the row keeps the portal's own PDF.

**Etsy says nothing**
*"Etsy is not switched on here…"* — 503 from any `/api/etsy/*` route except `status`. Set
`ETSY_ENABLED=true`, `ETSY_KEYSTRING` and `ETSY_SHARED_SECRET`, and a matching `ETSY_REDIRECT_URI`, then
restart (locally) or redeploy (hosted). Off, the studio shows no Etsy section at all.
*"Etsy would not allow that. Your app key has to be approved by Etsy…"* — a 403, and almost always the
approval itself: **a new app key stays unusable until Etsy marks it approved** under *Manage Your Apps*.
Nothing in this portal can speed that up, and the ZIP download is unaffected while you wait. The same
sentence appears when the key lacks the `listings_w` permission.
*"That sign-in request has already been used. Start again."* / *"Etsy sent back a different request."* —
the PKCE pair and the `state` are one-use and expire in ten minutes, so a refreshed or second callback
is refused rather than retried. Click **Connect Etsy Shop** again and let it finish in one go.
*"This Etsy account has more than one shop…"* — the portal will not guess which shop to write to.
*"Etsy requires a price, and only you set that."* — the price box is empty; type it in the listing
preview and try again. A draft that fails halfway reports how many images and files got onto it and
gives you the draft link, so it is never an orphan listing you cannot find.

**I want to start with a clean history**
Use **History → Clear all** in the browser; it removes the rows and the files. The SQL equivalent has
to go through the tables that reference `products` first:
```sql
DELETE FROM product_images;
DELETE FROM product_documents;
DELETE FROM products;
```
Locally that is `netlify database connect` (or any client pointed at `DATABASE_URL`), then delete the
folders inside `server/data/products/`.

---

## 9. Hosting it (Netlify)

`netlify.toml` already describes the whole deployment; a push to the default branch builds and
publishes it, so changes made here appear on the site without any manual step.

| Piece | Where it runs |
|-------|---------------|
| React app | built by Vite into `client/dist`, served as static files |
| `/api/*` | `server/netlify/functions/api.mjs` — the same route table the local server uses |
| the listing-text job | `server/netlify/functions/run.mjs` — a background Function, so a 30–60 second model answer is never cut off |
| products, settings, keyword cache | Netlify's managed Postgres (`NETLIFY_DB_URL` is provided automatically; the schema comes from `netlify/database/migrations/` on deploy and creates itself on first use) |
| PDFs, uploaded images, ZIPs | Netlify Blobs store `listing-files`, under `products/<id>/…` |
| API keys | **Settings → Access keys** in the deployed app, which writes them to your database encrypted with AES-256-GCM, or site secrets for `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` |
| the key that decrypts them | the `ENCRYPTION_KEY` site secret — never stored with the data it unlocks |
| error tracking (optional) | Sentry via the `SENTRY_DSN` site secret — server-side only; with no DSN set, nothing is reported and nothing is sent |
| browser protection | CSP, HSTS, `X-Content-Type-Options` and `Referrer-Policy`, from `netlify.toml` on the static files and from `server/src/headers.js` on every API response |

What changes when it is hosted:

- **You sign in with a portal password.** A hosted build is locked before the password exists: the
  first screen asks you to create one, and after that every page, download and API call needs the
  session cookie it hands out. Netlify's own site-password feature is not on the free plan, so the
  gate lives in the app. Locally the portal stays open until you create a password yourself in
  **Settings → Portal password**.
- **Named accounts, each with their own things.** On top of that password gate the portal now signs
  people in by email and password (`server/src/auth.js`, one scrypt hash per account, sessions as
  opaque database rows under a separate `listora_account` cookie). The first account created is the
  owner/admin. Every listing carries its owner in the id (`<uid>:<pid>`), so blobs live under
  `users/<uid>/products/<pid>/…` and one account can never read or delete another's work. The API
  key, model choice, brand and PDF theme you save in Settings are stored per account and used for
  that account's generations only, falling back to the shared value and then the server environment
  when you have not saved your own — so a signed-in user can bring their own key instead of spending
  the portal's. Account email (verification and reset) runs through Resend and stays inert without a
  `RESEND_API_KEY`.
- **Each account is capped per day.** `GENERATION_DAILY_LIMIT` (default 20) bounds how many listing
  generations one signed-in account may start per day; the owner is exempt and a value of 0 lifts the
  cap. The counter rolls over at midnight UTC and is charged the moment a generation is spent, so a
  full account is stopped before the model is ever called.
- **Uploads are capped near 4 MB**, image or PDF, because one Function invocation cannot carry the
  25 MB a local disk accepts. Compress the file, or run the portal on your own machine for
  full-resolution files.
- **The private files stay private.** `masterPrompt.js`, `rules.js`, `prompts/wording.js` and `.env` are
  git-ignored, so a cloned or hosted build gets the generic `*.example.js` copies that `npm run setup`
  writes during the build. Edit your own wording locally; publish only the tool.
- **A deployment reads your brief from Blobs, not from git.** On a hosted build the listing brief comes
  from the `listora-locked` blob store under the key `listing-wording`, so this public repository can
  carry the tool without carrying your wording. Install it once with
  `npm run export:prompt --prefix server` and the `netlify blobs:set` command that prints; until it is
  installed, generation says the brief is not installed rather than writing listings from the stand-in.
- **Brand and keys are per-database.** A fresh deployment has the neutral placeholder brand and no
  keys; set them once in the deployed Settings and they are stored in that deployment's database.
  Your local Postgres rows never travel to the site, and the git repository never sees any of them.
- **Set `ENCRYPTION_KEY` once.** Add it as a site secret (same generator command as in setup step 4)
  and redeploy. From the next start, keys you save in Settings are stored encrypted, and any key row
  that predates it is rewritten encrypted automatically. Leaving it out is supported: everything keeps
  working, keys are simply kept in the clear.
- **Error tracking stays off until you point it somewhere.** Add a `SENTRY_DSN` site secret and
  redeploy to start collecting 500s from the API, the background listing job, and browser crashes —
  the browser's own errors go to `/api/client-error`, which forwards them with the write-only key held
  only on the server. With no DSN, `sentryEnabled()` is false, the route answers `204` and no network
  request is ever made, so an install without Sentry is exactly as quiet as it was before.
- **Etsy stays invisible until you turn it on.** Three site secrets — `ETSY_ENABLED=true`,
  `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET` — plus `ETSY_REDIRECT_URI` set to
  `https://<your site>/api/etsy/callback`, exactly as registered with the app. Without them no
  Etsy-related word, button or request exists, and the ZIP path is byte for byte what it was. See
  section 5 for what the connection can and cannot do.

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
