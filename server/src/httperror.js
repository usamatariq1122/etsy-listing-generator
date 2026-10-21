/**
 * The error type the whole API throws: a message the seller can read, a status,
 * and any extra fields worth handing back (validation `issues`, for instance).
 * Lives on its own so a module can refuse a request without importing the
 * router that would import it back.
 */
export class HttpError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}
