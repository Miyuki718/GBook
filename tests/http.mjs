// Opt-in test against a running GBook; operates only on a uniquely named synthetic book.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {zipSync,strToU8} from 'fflate';
const origin=process.env.GBOOK_TEST_URL||'http://127.0.0.1:3000';
const initial=await fetch(origin+'/api/state');assert.equal(initial.status,200);const state=await initial.json();const cookie=initial.headers.get('set-cookie').split(';')[0];
async function post(url,body,headers={}){return fetch(origin+url,{method:'POST',headers:{origin,cookie,'x-gbook-csrf':state.csrf,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
assert.equal((await fetch(origin+'/api/state',{headers:{origin:'https://evil.example'}})).status,403);
const forgedHost=await new Promise(resolve=>{http.get(origin+'/api/state',{headers:{Host:'evil.example:3000'}},r=>{r.resume();resolve(r.statusCode);});});
assert.equal(forgedHost,403);
assert.equal((await post('/api/library',{op:'book.delete',id:'x'},{'x-gbook-csrf':''})).status,403);
assert.equal((await post('/api/library',{op:'book.delete',id:'x'},{origin:'https://evil.example'})).status,403);
const form=new FormData();form.set('file',new Blob(['# 测试第一章\n\n仅用于自动检验的原文📚。\n\n# 测试第二章\n\n下一章内容。'],{type:'text/plain'}),'HTTP-QA-'+randomUUID()+'.md');
const imported=await fetch(origin+'/api/import',{method:'POST',headers:{origin,cookie,'x-gbook-csrf':state.csrf},body:form});assert.equal(imported.status,200,await imported.clone().text());const {id:bookId}=await imported.json();
let restoredIds=[];
try{
 const largeForm=new FormData();
 const largeEpub=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package><manifest><item id="one" href="one.xhtml"/></manifest><spine><itemref idref="one"/></spine></package>'),'one.xhtml':strToU8('<html><body><p>大文件合成验收</p></body></html>'),'image-one.jpg':new Uint8Array(8_000_000),'image-two.jpg':new Uint8Array(8_000_000)},{level:0});
 largeForm.set('file',new Blob([largeEpub]),'HTTP-QA-large-'+randomUUID()+'.epub');
 const largeImport=await fetch(origin+'/api/import',{method:'POST',headers:{origin,cookie,'x-gbook-csrf':state.csrf},body:largeForm});
 assert.equal(largeImport.status,200,await largeImport.clone().text());
 const largeId=(await largeImport.json()).id;
 assert.equal((await post('/api/library',{op:'book.delete',id:largeId})).status,200);
 const backup=await (await fetch(origin+'/api/backup')).json();const book=backup.books.find(b=>b.id===bookId);assert.equal(book.chapters.length,2);assert.ok(!JSON.stringify(backup).includes('accessToken'));const c=book.chapters[0];
 const saved=await post('/api/library',{op:'annotation.save',value:{bookId,chapterId:c.id,start:0,end:2,exact:'仅用',note:'HTTP 持久化测试'}});assert.equal(saved.status,200,await saved.clone().text());const a=await saved.json();
 assert.equal((await post('/api/library',{op:'annotation.save',value:{...a,revision:999,note:'冲突'}})).status,400);
 assert.equal((await post('/api/library',{op:'progress.save',value:{bookId,chapterId:c.id,offset:2,percent:20}})).status,200);
 assert.equal((await post('/api/library',{op:'bookmark.add',value:{bookId,chapterId:c.id,offset:2,label:'HTTP 书签'}})).status,200);
 const refreshed=await (await fetch(origin+'/api/state')).json();assert.equal(refreshed.annotations.find(v=>v.id===a.id).note,'HTTP 持久化测试');assert.equal(refreshed.positions[bookId].offset,2);
 assert.equal((await post('/api/library',{op:'book.update',value:{id:bookId,title:book.title+'（已编辑）',author:'HTTP 作者',description:'编辑信息验收'}})).status,200);
 const exported=await (await fetch(origin+'/api/backup')).json();
 const small={...exported,books:exported.books.filter(b=>b.id===bookId),annotations:exported.annotations.filter(a=>a.bookId===bookId),messages:[],positions:exported.positions.filter(p=>p.bookId===bookId),bookmarks:exported.bookmarks.filter(b=>b.bookId===bookId)};
 const restore=await post('/api/backup',small);assert.equal(restore.status,200,await restore.clone().text());const copied=await restore.json();assert.equal(copied.imported,1);restoredIds=copied.bookIds;
 assert.equal((await post('/api/library',{op:'book.delete',id:bookId})).status,200);assert.ok((await (await fetch(origin+'/api/library?trash=1')).json()).some(b=>b.id===bookId));assert.equal((await post('/api/library',{op:'book.restore',id:bookId})).status,200);
 assert.equal((await fetch(origin+`/read/${bookId}`)).status,200);assert.equal((await fetch(origin+'/read/missing-book')).status,404);
 const badForm=new FormData();badForm.set('file',new Blob(['x']),'bad.exe');assert.equal((await fetch(origin+'/api/import',{method:'POST',headers:{origin,cookie,'x-gbook-csrf':state.csrf},body:badForm})).status,400);
 console.log('HTTP PASS: CSRF, Host/Origin, import, metadata, trash/restore, anchors, revisions, progress, bookmarks, backup round-trip, routes');
}finally{await post('/api/library',{op:'book.delete',id:bookId});for(const id of restoredIds)await post('/api/library',{op:'book.delete',id});}
