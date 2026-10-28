// Local LAN rehearsal: separate OS processes, fixed origins, existing local key only.
import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {readFile} from 'node:fs/promises';
const address=process.env.LOCAL_GAME_HOST||Object.values(networkInterfaces()).flat().find(n=>n.family==='IPv4'&&!n.internal&&/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(n.address))?.address;
if(!address)throw new Error('Set LOCAL_GAME_HOST to the Mac Wi-Fi IPv4 address');
const key=(await readFile(new URL('../.local/monitor-key.txt',import.meta.url),'utf8')).trim();
const origin=`http://${address}:4174`,allowed=`http://${address}:4173,http://localhost:4173,http://127.0.0.1:4173`;
const children=[];let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
for(const [role,port]of [['race','4174'],['assets','4173']]){
 const env={...process.env,HOST:'0.0.0.0',PORT:port,GAME_ROLE:role,RACE_ORIGIN:origin,ALLOWED_ORIGINS:allowed};
 if(role==='race')env.MONITOR_TOKEN=key;else delete env.MONITOR_TOKEN;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env,stdio:'inherit'});children.push(child);
 child.on('error',()=>{process.exitCode=1;stop();});child.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}});
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
console.log(`Game: http://${address}:4173/ | Race monitoring: ${origin}/monitor#experience`);
