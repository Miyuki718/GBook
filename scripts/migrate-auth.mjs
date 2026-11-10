// One-time same-machine upgrade. Never inspect or log credential file contents.
// Stop the Web process first so its old in-memory login cannot overwrite the files.
import {copyFile,mkdir,stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dataDirectory} from '@gbook/core';
import {getAuth} from '@gbook/auth';
const target=join(dataDirectory(),'auth');
const client=getAuth();
const session=await client.getSession();
if(session.status==='connected'){console.log('Existing production connection preserved.');process.exit(0);}
const source=process.argv[2]
  ? resolve(process.argv[2], 'auth')
  : fileURLToPath(new URL('../.phase0/private/auth/',import.meta.url));
if(resolve(target)===resolve(source))throw new Error('Source and target must be different');
for(const name of ['chatgpt-auth.json','chatgpt-host.json']){const info=await stat(join(source,name));if(!info.isFile()||info.size>2_000_000)throw new Error('Expected local encrypted GBook state is unavailable');}
const backup=join(target,'upgrade-backup-'+Date.now());await mkdir(backup,{recursive:true});
for(const name of ['chatgpt-auth.json','chatgpt-host.json']){try{await copyFile(join(target,name),join(backup,name));}catch(e){if(e.code!=='ENOENT')throw e;}}
for(const name of ['chatgpt-auth.json','chatgpt-host.json'])await copyFile(join(source,name),join(target,name));
const restored=await client.getSession();
console.log(JSON.stringify({status:restored.status,sharing:restored.sharing}));
