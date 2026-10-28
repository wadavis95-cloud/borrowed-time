// HTTP delivers the game; WebSockets carry server-owned multiplayer races.
import { createGameServer,createAssetServer } from './src/server/app.js';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT must be a whole number between 0 and 65535.');
  process.exitCode = 1;
} else {
  const role=process.env.GAME_ROLE||'combined';
  if(!['combined','race','assets'].includes(role))throw new Error('GAME_ROLE must be combined, race or assets');
  const app = role==='assets'?createAssetServer({raceOrigin:process.env.RACE_ORIGIN}):createGameServer({raceOnly:role==='race',frontendOrigin:process.env.GAME_FRONTEND_ORIGIN||'',allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)});
  app.server.on('error', async (error) => {
    const reason = error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the other server or set another PORT.`
      : `Could not listen on ${host}:${port}: ${error.message}`;
    console.error(reason);
    process.exitCode = 1;
    await app.close();
  });
  app.server.listen(port, host, () => {
    const address = app.server.address();
    console.log(`Borrowed Time is running at http://${host}:${address.port}`);
    console.log('Press Ctrl+C to stop the server.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await app.close();
    });
  }
}
