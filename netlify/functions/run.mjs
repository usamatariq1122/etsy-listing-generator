import { isSafeId } from '../../server/src/paths.js';
import { getProduct, initDb, updateProduct } from '../../server/src/db.js';
import { runGeneration } from '../../server/src/generate.js';
import { readSession, validSession } from '../../server/src/auth.js';

// Writing a listing takes 30-60 seconds, longer than a normal invocation may
// run. A background function gets the browser out of the wait: it answers 202
// immediately, works for up to 15 minutes, and the browser polls the product.

let schema;

export default async (request) => {
  const { id } = request.params ?? {};
  if (!id || !isSafeId(id)) return;

  schema ??= initDb().catch((error) => console.error('[db]', error.message));
  await schema;

  // A background invocation cannot answer the caller, so an unauthenticated one
  // is refused by failing the product instead: the polling browser reports the
  // reason and nobody can spend your quota on a listing they cannot see.
  if (!(await validSession(readSession(request.headers.get('cookie'))))) {
    const product = await getProduct(id);
    if (product && product.status !== 'failed') {
      await updateProduct(id, {
        status: 'failed',
        warnings: { ...(product.warnings || {}), error: 'Sign in to use this portal.', issues: [], status: 401 },
      });
    }
    return;
  }

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
