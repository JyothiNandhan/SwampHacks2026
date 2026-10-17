import { startupFailureMessage } from './configuration-error.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function start() {
  // Validate before allocating resources or opening the listener.
  const config = loadConfig();
  const app = buildApp({ config });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try { await app.close(); }
    catch { app.log.error('Server shutdown failed'); process.exitCode = 1; }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try { await app.listen({ port: config.port, host: '0.0.0.0' }); }
  catch {
    app.log.error('Server startup failed');
    process.exitCode = 1;
    await shutdown();
  }
}
start().catch(error => {
  // Print setting names only for our explicitly safe configuration errors.
  console.error(startupFailureMessage(error));
  process.exitCode = 1;
});
