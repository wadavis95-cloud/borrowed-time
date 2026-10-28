import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),directory=new URL('.local/',root),path=new URL('monitor-key.txt',directory);
await mkdir(directory,{recursive:true,mode:0o700});let token;
try{token=(await readFile(path,'utf8')).trim();if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Invalid .local/monitor-key.txt; use a 43-character local key.');}
catch(error){if(error.code!=='ENOENT')throw error;token=randomBytes(32).toString('base64url');await writeFile(path,token+'\n',{mode:0o600,flag:'wx'});}
await chmod(path,0o600);
console.log('Local monitoring enabled. Open http://localhost:'+(process.env.PORT||4173)+'/monitor');
console.log('Monitoring key file: '+fileURLToPath(path)+' (paste into the dashboard; never share it).');
const child=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(root),env:{...process.env,HOST:'127.0.0.1',MONITOR_TOKEN:token},stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
