// Template for the single import point the provider modules use. `npm run setup`
// copies this to masterPrompt.js (git-ignored). The listing brief itself is the
// locked constant in prompts/listing.js - not editable from the UI and never
// returned by any route - so this module only re-exports it under the names the
// providers already import.
export { buildListingSystemPrompt as buildSystemPrompt } from './prompts/listing.js';
export { LOCKED_PROMPT_BODY as DEFAULT_PROMPT_BODY } from './prompts/listing.js';
