import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createGameServer, createStaticFileHandler } from '../src/server/app.js';

const networkTest = process.env.RUN_NETWORK_TESTS === '1' ? test : test.skip;

// Read the wire bytes: fetch transparently decompresses gzip responses.
function readResponse(url, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function serveFixture(t, files) {
  const publicRoot = await mkdtemp(join(tmpdir(), 'borrowed-time-assets-'));
  t.after(() => rm(publicRoot, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(files)) {
    const target = join(publicRoot, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  const server = createServer(createStaticFileHandler({ publicRoot }));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const unityPayloads = [
  ['Race.loader.js', 'text/javascript; charset=utf-8', Buffer.from('function createUnityInstance() {}')],
  ['Race.framework.js', 'text/javascript; charset=utf-8', Buffer.from('var unityFramework = {};')],
  ['Race.data', 'application/octet-stream', Buffer.from([0, 255, 4, 128, 1])],
  ['Race.wasm', 'application/wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
];

networkTest('Unity build responses preserve binary bytes, MIME and empty HEAD bodies', async (t) => {
  const assets = Object.fromEntries(unityPayloads.map(([name, , body]) => [`assets/unity/v5/${name}`, body]));
  const origin = await serveFixture(t, assets);
  for (const [name, mime, body] of unityPayloads) {
    const url = `${origin}/assets/unity/v5/${name}`;
    const response = await readResponse(url);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers['content-type'], mime, name);
    assert.equal(response.headers['content-encoding'], undefined, name);
    assert.equal(response.headers['content-length'], String(body.length), name);
    assert.equal(response.headers['x-content-type-options'], 'nosniff', name);
    assert.deepEqual(response.body, body, name);
    const head = await readResponse(url, 'HEAD');
    assert.equal(head.status, 200, name);
    assert.equal(head.body.length, 0, name);
    for (const header of ['content-type', 'content-length', 'content-encoding', 'cache-control', 'x-content-type-options']) {
      assert.equal(head.headers[header], response.headers[header], `${name}: ${header}`);
    }
  }
});

networkTest('compressed Unity builds advertise gzip and the underlying JavaScript, data or wasm MIME', async (t) => {
  const compressed = unityPayloads.slice(1).map(([name, mime, body]) => [name + '.gz', mime, body, gzipSync(body)]);
  const origin = await serveFixture(t, Object.fromEntries(compressed.map(([name, , , bytes]) => [`assets/unity/v5/${name}`, bytes])));
  for (const [name, mime, body, bytes] of compressed) {
    const url = `${origin}/assets/unity/v5/${name}`;
    const response = await readResponse(url);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers['content-type'], mime, name);
    assert.equal(response.headers['content-encoding'], 'gzip', name);
    assert.equal(response.headers['content-length'], String(bytes.length), name);
    assert.deepEqual(response.body, bytes, name);
    assert.deepEqual(gunzipSync(response.body), body, name);
    const head = await readResponse(url, 'HEAD');
    assert.equal(head.status, 200, name);
    assert.equal(head.body.length, 0, name);
    for (const header of ['content-type', 'content-length', 'content-encoding']) {
      assert.equal(head.headers[header], response.headers[header], `${name}: ${header}`);
    }
  }
});

networkTest('Unity serving exposes only named build artifacts and frontend bridges', async (t) => {
  const privatePaths = [
    'assets/unity/v5/ProjectSettings.asset', 'assets/unity/v5/Race.wasm.map',
    'assets/unity/v5/Assets/Study/Runtime/RunnerWardrobe.cs', 'assets/unity/v5/Race.symbols.json.gz',
    'assets/unity/v5/another.wasm', 'assets/unity/v6/Race.wasm',
    'src/server/app.js', 'package.json', '.env',
  ];
  const files = Object.fromEntries(privatePaths.map((path) => [path, 'private fixture']));
  files['src/unity-renderer.js'] = 'export function createRenderer() {}';
  files['src/unity-protocol.js'] = 'export const version = 1;';
  const origin = await serveFixture(t, files);
  for (const path of ['src/unity-renderer.js', 'src/unity-protocol.js']) {
    const response = await readResponse(`${origin}/${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8', path);
    assert.equal(response.body.toString(), files[path]);
  }
  for (const path of privatePaths) {
    assert.equal((await readResponse(`${origin}/${path}`)).status, 404, path);
    const head = await readResponse(`${origin}/${path}`, 'HEAD');
    assert.equal(head.status, 404, path);
    assert.equal(head.body.length, 0, path);
  }
  assert.equal((await readResponse(`${origin}/assets/unity/v5/Race.wasm`)).status, 404);
  const post = await readResponse(`${origin}/src/unity-renderer.js`, 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

// Catch an incomplete vendor mapping: the module imports its neighboring core file.
networkTest('3D browser modules load locally while the rest of node_modules stays private', async (t) => {
  const app = createGameServer();
  t.after(() => app.close());
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of ['/vendor/three.module.js', '/vendor/three.core.js', '/vendor/loaders/GLTFLoader.js', '/vendor/utils/BufferGeometryUtils.js', '/vendor/utils/SkeletonUtils.js']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.ok((await response.text()).length > 1000);
    const head = await fetch(origin + path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
  for (const path of ['/node_modules/three/package.json', '/node_modules/ws/index.js', '/vendor/package.json', '/vendor/exporters/GLTFExporter.js', '/src/server/app.js', '/scripts/build-avatars.mjs']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  for (const id of ['courier', 'engineer', 'guard', 'runner']) {
    const response = await fetch(`${origin}/assets/characters/${id}.glb`);
    assert.equal(response.status, 200, id);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
  }
  assert.equal((await fetch(origin + '/assets/characters/manifest.json')).status, 404);
  assert.equal((await fetch(origin + '/assets/characters/missing.glb')).status, 404);
});

networkTest('character GLBs negotiate gzip while preserving raw fallback and binary bytes', async t => {
  const binary=Buffer.from('glTF test geometry '.repeat(512));
  const compressed=gzipSync(binary);
  const origin=await serveFixture(t, {'assets/characters/courier.glb':binary,'assets/characters/courier.glb.gz':compressed});
  const encoded=await new Promise((resolve,reject)=>{
    const req=request(origin+'/assets/characters/courier.glb',{headers:{'Accept-Encoding':'gzip'}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({headers:response.headers,body:Buffer.concat(chunks)}));
    });req.on('error',reject);req.end();
  });
  assert.equal(encoded.headers['content-encoding'],'gzip');
  assert.equal(encoded.headers['content-type'],'model/gltf-binary');
  assert.equal(encoded.headers.vary,'Accept-Encoding');
  assert.deepEqual(gunzipSync(encoded.body),binary);
  const raw=await readResponse(origin+'/assets/characters/courier.glb');
  assert.equal(raw.headers['content-encoding'],undefined);assert.deepEqual(raw.body,binary);
  const refused=await readResponse(origin+'/assets/characters/courier.glb','GET',{'Accept-Encoding':'gzip;q=0, br'});
  assert.equal(refused.headers['content-encoding'],undefined);assert.deepEqual(refused.body,binary);
  const head=await readResponse(origin+'/assets/characters/courier.glb','HEAD',{'Accept-Encoding':'gzip'});
  assert.equal(head.headers['content-encoding'],'gzip');assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),compressed.length);
});
