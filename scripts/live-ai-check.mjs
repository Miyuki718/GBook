// Explicit live test: sends only the original synthetic QA paragraph, never user books.
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:3000';
const response=await fetch(origin+'/api/state'),state=await response.json();
const cookie=response.headers.get('set-cookie').split(';')[0];
const authResponse=await fetch(origin+'/api/auth');const auth=await authResponse.json();
if(!authResponse.ok||!auth.session?.sharing)throw new Error('Production ChatGPT connection is not ready');
const annotation=state.annotations.find(a=>a.note==='阅读不只是记住结论，也是在练习观察和提问。'&&state.books.find(b=>b.id===a.bookId)?.title==='浏览器验收');
if(!annotation)throw new Error('Synthetic browser QA annotation is missing; do not substitute user content');
const model=auth.models.find(m=>m.slug.includes('sol'))??auth.models[0];
const stream=await fetch(origin+'/api/discuss',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-gbook-csrf':state.csrf},body:JSON.stringify({annotationId:annotation.id,question:'请用一句中文回应我的批注。',model:model.slug,requestId:randomUUID()})});
if(!stream.ok)throw new Error('Live request rejected: '+stream.status);
const text=await stream.text();const events=text.trim().split('\n').map(line=>JSON.parse(line));
const error=events.find(e=>e.type==='error');if(error)throw new Error(error.message);
if(!events.some(e=>e.type==='done'))throw new Error('No completed response');
const history=await (await fetch(origin+'/api/library?annotationId='+annotation.id)).json();
const last=history.at(-1);if(last.status!=='completed'||!last.content.trim())throw new Error('Completed reply did not persist');
console.log(JSON.stringify({model:model.slug,status:last.status,reply:last.content,historyMessages:history.length}));
