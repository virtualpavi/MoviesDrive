/**
 * Vercel serverless entrypoint.
 * Reuse the Express app from src/index.js and export it as a handler.
 */

import app from '../src/index.js';

export default app;
