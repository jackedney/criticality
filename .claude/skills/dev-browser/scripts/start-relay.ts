/**
 * Start the CDP relay server for Chrome extension mode
 *
 * Usage: npm run start-extension
 */

import { serveRelay } from '@/relay.js';

const portRaw = (process.env.PORT ?? '').trim() || '9222';
const PORT = parseInt(portRaw, 10);

if (isNaN(PORT) || !isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
}

const HOST = (process.env.HOST ?? '').trim() || '127.0.0.1';

async function main() {
  const server = await serveRelay({
    port: PORT,
    host: HOST,
  });

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down relay server...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start relay server:', err);
  process.exit(1);
});
