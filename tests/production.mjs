import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,scryptSync} from 'node:crypto';
const owner = process.argv.includes('--owner');
const lanIp = owner ? process.env.GBOOK_TEST_LAN_IP : undefined;
mkdirSync('.test-data',{recursive:true});const dir=mkdtempSync(resolve('.test-data/production-'));const url=`http://${lanIp || '127.0.0.1'}:3127`;
const password = randomBytes(24).toString('hex');
const salt = randomBytes(16);
const env={...process.env,PORT:'3127',GBOOK_DATA_DIR:dir,GBOOK_TEST_URL:url,GBOOK_OWNER_MODE:owner?'1':'0',GBOOK_OWNER_LAN_IP:lanIp || ''};
if (owner) {
  env.GBOOK_PREVIEW_BUILD='1';
  env.GBOOK_OWNER_PASSWORD_HASH=salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');
}
const server=spawn(process.execPath,['--use-env-proxy','scripts/web.mjs','start'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let exited=false;server.on('exit',()=>{exited=true;});server.stdout.on('data',()=>{});server.stderr.on('data',d=>process.stderr.write(d));
try{let ready=false;for(let i=0;i<100;i++){if(exited)throw new Error('Production server exited');try{if((await fetch(url+'/api/state')).status===(owner?401:200)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Production server timeout');
const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[owner?'tests/owner-sync.mjs':'tests/http.mjs'],{env:{...env,GBOOK_TEST_PASSWORD:password},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});if(status!==0)process.exitCode=1;
}finally{if(process.platform==='win32'){await new Promise(r=>{const killer=spawn('taskkill.exe',['/pid',String(server.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.on('exit',r);});}else{server.kill('SIGTERM');}await new Promise(r=>setTimeout(r,300));try{rmSync(dir,{recursive:true,force:true});}catch{console.error('Test data retained:',dir);}}
