import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createGameServer } from '../src/server/app.js';

const networkTest = process.env.RUN_NETWORK_TESTS === '1' ? test : test.skip;

// Catch an incomplete vendor mapping: the module imports its neighboring core file.
networkTest('3D browser modules load locally while the rest of node_modules stays private', async (t) => {
  const app = createGameServer();
  t.after(() => app.close());
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of ['/vendor/three.module.js', '/vendor/three.core.js']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.ok((await response.text()).length > 1000);
    const head = await fetch(origin + path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
  for (const path of ['/node_modules/three/package.json', '/node_modules/ws/index.js', '/vendor/package.json', '/src/server/app.js']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
});
