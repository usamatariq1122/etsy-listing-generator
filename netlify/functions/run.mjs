import { isSafeId } from '../../server/src/paths.js';
import { initDb } from '../../server/src/db.js';
import { runGeneration } from '../../server/src/generate.js';

// Writing a listing takes 30-60 seconds, longer than a normal invocation may
// run. A background function gets the browser out of the wait: it answers 202
// immediately, works for up to 15 minutes, and the browser polls the product.

let schema;

export default async (request) => {
  const { id } = request.params ?? {};
  if (!id || !isSafeId(id)) return;

  schema ??= initDb().catch((error) => console.error('[db]', error.message));
  await schema;

  try {
    await runGeneration(id);
  } catch (error) {
    console.error('[run]', error);
  }
};

export const config = {
  background: true,
  path: '/api/run/:id',
};
