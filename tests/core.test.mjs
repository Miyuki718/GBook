import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Library,chapterText} from '@gbook/core';
import {importBook} from '../packages/core/src/import.ts';
import {zipSync,strToU8} from 'fflate';
mkdirSync('.test-data',{recursive:true});
function fixture(t){const dir=mkdtempSync(resolve('.test-data/core-')),lib=new Library(join(dir,'library.db'));lib.migrate();t.after(()=>{lib.close();rmSync(dir,{recursive:true,force:true});});return lib;}
const sample=()=>({id:randomUUID(),title:'测试中文📚',subtitle:'TEST',author:'Test',color:'sand',motif:'读',description:'合成测试',chapters:[{id:'chapter',title:'第一章',paragraphs:['第一段。慢下来📚。','重复：慢下来📚。']}]});
test('book, anchored notes, revisions, transactions and reopen',t=>{const lib=fixture(t),b=lib.addBook(sample()),text=chapterText(b.chapters[0]),start=text.lastIndexOf('慢');const a=lib.saveAnnotation({bookId:b.id,chapterId:'chapter',start,end:start+3,exact:'慢下来',note:"安全的 ' 引号 <script>"});assert.ok(a.contentHash);assert.equal(a.exact,'慢下来');assert.throws(()=>lib.saveAnnotation({...a,note:'过期',revision:99}));const changed=lib.saveAnnotation({...a,note:'MCP 修改'},'mcp');assert.equal(changed.revision,2);assert.equal(changed.source,'mcp');assert.throws(()=>lib.saveAnnotation({...changed,start:0}));assert.equal(lib.annotations().length,1);assert.equal(lib.search(b.id,'慢下来').length,2);lib.position({bookId:b.id,chapterId:'chapter',offset:start,percent:70});lib.bookmark({bookId:b.id,chapterId:'chapter',offset:start,label:'这里'});const other=new Library(lib.native.name);try{other.migrate();assert.equal(other.snapshot().annotations[0].note,'MCP 修改');assert.equal(other.positions()[b.id].offset,start);}finally{other.close();}lib.removeBook(b.id);assert.equal(lib.books().length,0);assert.equal(lib.annotations().length,0);lib.restoreBook(b.id);assert.equal(lib.annotations().length,1);assert.equal(lib.native.pragma('integrity_check',{simple:true}),'ok');});
test('discussion dedup, interruption recovery, backup merge and restore rollback',t=>{const lib=fixture(t),b=lib.addBook(sample()),a=lib.saveAnnotation({bookId:b.id,chapterId:'chapter',start:0,end:3,exact:'第一段',note:'想法'});const requestId=randomUUID();const turn=lib.beginDiscussion(a.id,'为什么？','test-model',requestId);assert.throws(()=>lib.beginDiscussion(a.id,'重复','test-model',randomUUID()));lib.finishDiscussion(turn.assistantId,'这是部分回复','interrupted','测试中断');assert.throws(()=>lib.beginDiscussion(a.id,'重复','test-model',requestId));const next=lib.beginDiscussion(a.id,'再问','test-model',randomUUID());lib.recover();assert.equal(lib.messages(a.id).at(-1).status,'interrupted');lib.finishDiscussion(next.assistantId,'不能把中断状态改回完成','completed');assert.equal(lib.messages(a.id).at(-1).status,'interrupted');lib.position({bookId:b.id,chapterId:'chapter',offset:0,percent:0});lib.bookmark({bookId:b.id,chapterId:'chapter',offset:0,label:'开头'});const backup=lib.exportBackup();assert.equal(lib.importBackup(backup).imported,1);assert.equal(lib.books().length,2);const copy=lib.annotations().find(v=>v.id!==a.id);assert.equal(lib.messages(copy.id).length,4);assert.equal(lib.bookmarks().length,2);const broken=structuredClone(backup);broken.annotations[0].exact='伪造原文';assert.throws(()=>lib.importBackup(broken));assert.equal(lib.books().length,2);});
test('TXT/Markdown encodings, EPUB spine and malicious archive limits',()=>{
 const md=importBook('学习.md',strToU8('# 第一章\n\n你好📚。\n\n# 第二章\n\n下一段。'));assert.equal(md.chapters.length,2);assert.equal(md.chapters[0].paragraphs[0],'你好📚。');
 assert.throws(()=>importBook('bad.pdf',strToU8('x')));assert.throws(()=>importBook('empty.txt',new Uint8Array()));
 const entries={'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),'OEBPS/book.opf':strToU8('<package><metadata><dc:creator>作者</dc:creator></metadata><manifest><item id="one" href="one.xhtml"/></manifest><spine><itemref idref="one"/></spine></package>'),'OEBPS/one.xhtml':strToU8('<html><head><script>never()</script></head><body><h1>章节</h1><p>安全 &amp; 中文。</p><script>evil()</script></body></html>')};
 const epub=importBook('电子书.epub',zipSync(entries));assert.ok(chapterText(epub.chapters[0]).includes('安全 & 中文'));assert.ok(!chapterText(epub.chapters[0]).includes('evil'));assert.equal(epub.author,'作者');
 assert.throws(()=>importBook('escape.epub',zipSync({...entries,'../escape.xml':strToU8('bad')})));
 assert.throws(()=>importBook('bomb.epub',zipSync({...entries,'OEBPS/huge.xml':new Uint8Array(11_000_000)})));
 // Large image-heavy EPUBs exceed the old upload and unpacked limits while
 // skipped images still count toward the archive safety budget.
 const images=Object.fromEntries(Array.from({length:4},(_,i)=>[`OEBPS/image-${i}.jpg`,new Uint8Array(8_000_000)]));
 const large=zipSync({...entries,...images},{level:0});
 assert.ok(large.length>10_000_000);
 assert.equal(importBook('large.epub',large).chapters.length,1);
 const excessive=zipSync({...entries,...Object.fromEntries(Array.from({length:26},(_,i)=>[`OEBPS/image-${i}.jpg`,new Uint8Array(8_000_000)]))});
 assert.throws(()=>importBook('archive-budget.epub',excessive),/解压后过大/);
});

test('EPUB illustrations preserve text anchors and reject a different edition', t => {
  const lib = fixture(t);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=', 'base64');
  const archive = zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),
    'book.opf': strToU8('<package><manifest><item id="chapter" href="text/one.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
    'text/one.xhtml': strToU8('<html><body><p>段<img src="../art/pixel.png"/>落甲</p><img src="../art/pixel.png" alt="示意图"/><img src="https://example.com/no.png"/><svg><image xlink:href="../art/pixel.png"/></svg><p>段落乙</p></body></html>'),
    'art/pixel.png': png,
  });
  const book = importBook('test.epub', archive);
  const saved = lib.addBook(book);
  const note = lib.saveAnnotation({bookId:saved.id, chapterId:saved.chapters[0].id, start:0, end:3, exact:'段落甲'});
  const images = [];
  const parsed = importBook('test.epub', archive, images);
  assert.deepEqual(parsed.chapters[0].paragraphs, ['段落甲', '段落乙']);
  assert.equal(images.length, 3);
  const updated = lib.saveImportedBook(parsed, images, saved.id);
  assert.equal(updated.chapters[0].id, saved.chapters[0].id);
  const stored = lib.bookImages(saved.id);
  assert.deepEqual(stored.map(image => [image.beforeParagraph, image.inlineOffset]), [[0, 1], [1, null], [1, null]]);
  assert.equal(stored[1].alt, '示意图');
  assert.deepEqual(lib.bookImage(stored[0].id).bytes, png);
  assert.equal(lib.annotations()[0].id, note.id);
  parsed.chapters[0].paragraphs[0] = '另一版本';
  assert.throws(() => lib.saveImportedBook(parsed, images, saved.id), /正文与现有书籍不一致/);
  assert.deepEqual(lib.bookImages(saved.id), stored);
});
