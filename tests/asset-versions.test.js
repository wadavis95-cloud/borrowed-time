import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ASSET_VERSIONS,assetUrl} from '../src/asset-versions.js';
import {ALL_AVATAR_IDS} from '../src/avatars.js';
import {MAP_IDS} from '../src/maps.js';
import {MUSIC_TRACKS} from '../src/music.js';
test('versions match every shipped model, track and thumbnail, so changed bytes invalidate URLs',async()=>{
 const paths=[...ALL_AVATAR_IDS.map(id=>`/assets/characters/${id}.glb`),...MAP_IDS.map(id=>`/assets/maps/${id}.svg`),...Object.values(MUSIC_TRACKS).map(t=>t.src)];
 assert.equal(Object.keys(ASSET_VERSIONS).length,36);
 for(const path of paths){const hash=createHash('sha256').update(await readFile(new URL('..'+path,import.meta.url))).digest('hex');assert.equal(ASSET_VERSIONS[path],hash,path+' run npm run build:asset-versions');assert.equal(new URL(assetUrl(path),'http://localhost').searchParams.get('v'),hash);}
});
