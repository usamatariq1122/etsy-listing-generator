import { AsyncLocalStorage } from 'node:async_hooks';

// Who the current work belongs to, and which prompt it is written from. Every API
// request and every generation job sets this once, at its own boundary, and the
// settings helpers (API keys, model choice, brand, theme) read it to look for a
// per-user value before falling back to the shared one. A generation additionally
// primes the prompt body for its product type, so the text model can be handed a
// customised brief without threading it through the protected writing pipeline.
const store = new AsyncLocalStorage();

/** Runs `fn` with `userId` as the current owner. A null owner means legacy. */
export function runAs(userId, fn) {
  return store.run({ userId: userId ?? null, promptBody: null }, fn);
}

/** The owner of the work in flight, or null when there is none. */
export const currentUserId = () => store.getStore()?.userId ?? null;

/** Stashes the resolved prompt body for the generation in flight, if any. */
export function setPromptBody(body) {
  const scope = store.getStore();
  if (scope) scope.promptBody = body ?? null;
}

/** The customised prompt body for the work in flight, or null to use the built-in. */
export const currentPromptBody = () => store.getStore()?.promptBody ?? null;
