// Template for the single import point the provider modules use. `npm run setup`
// copies this to masterPrompt.js (git-ignored). The listing brief itself stays
// behind prompts/listing.js - not editable from the UI and never returned by any
// route - so this module only re-exports it under the name providers import.
export { buildListingSystemPrompt as buildSystemPrompt } from './prompts/listing.js';
