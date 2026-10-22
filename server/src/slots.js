// The listing images, in ZIP order. promptGroup/promptIndex maps each
// slot onto the matching entry the text model returns, so the seller can paste
// the prompt into an image tool and upload the result back into the same slot.
// A slot with promptGroup null (real_photo) has no prompt and is upload-only.
export const SLOTS = [
  {
    id: 'real_photo',
    label: 'Real item photo',
    hint: 'An unedited, real photo of the actual finished item against a real background. Etsy requires at least one; this slot is upload-only — it is never AI-generated.',
    zipName: '00-real-photo',
    promptGroup: null,
    promptIndex: null,
    uploadOnly: true,
  },
  {
    id: 'cover',
    label: 'Primary cover thumbnail',
    hint: 'The first image a buyer sees. Show the finished product, largest and clearest.',
    zipName: '01-cover',
    promptGroup: 'mockup',
    promptIndex: 0,
  },
  {
    id: 'detail',
    label: 'Close-up detail',
    hint: 'A tight crop that proves the quality of the stitches, edges or print.',
    zipName: '02-detail',
    promptGroup: 'mockup',
    promptIndex: 1,
  },
  {
    id: 'materials',
    label: 'Materials and what is included',
    hint: 'Lay out every file or component the buyer receives.',
    zipName: '03-materials',
    promptGroup: 'mockup',
    promptIndex: 2,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle shot with scale',
    hint: 'The product in a real setting, with something next it to show size.',
    zipName: '04-lifestyle',
    promptGroup: 'mockup',
    promptIndex: 3,
  },
  {
    id: 'digital',
    label: 'Digital download only',
    hint: 'States that this is a download and nothing physical ships.',
    zipName: '05-digital-download',
    promptGroup: 'infographic',
    promptIndex: 0,
  },
  {
    id: 'specs',
    label: 'Size and skill level',
    hint: 'Measurements plus the skill level needed, as one clean card.',
    zipName: '06-size-skill',
    promptGroup: 'infographic',
    promptIndex: 1,
  },
  {
    id: 'license',
    label: 'Licence terms',
    hint: 'What the buyer may and may not do with the files.',
    zipName: '07-license',
    promptGroup: 'infographic',
    promptIndex: 2,
    onlyWhenLicense: true,
  },
];

export const SLOT_IDS = SLOTS.map((slot) => slot.id);

export const getSlot = (id) => SLOTS.find((slot) => slot.id === id) || null;

export const promptFor = (slot, product) =>
  slot.promptGroup == null
    ? ''
    : (product[slot.promptGroup === 'mockup' ? 'mockup_prompts' : 'infographic_prompts'] || [])[slot.promptIndex] || '';

// JPG is written as .jpg on disk and inside the ZIP.
const EXTENSION = { jpeg: 'jpg', png: 'png' };

export const imageFileName = (slot, format) => `${slot.zipName}.${EXTENSION[format] || 'jpg'}`;
