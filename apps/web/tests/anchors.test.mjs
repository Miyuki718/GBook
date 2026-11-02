import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnchor,segments} from '../lib/anchors.ts';
test('repeated quotes, Unicode and invalid boundaries',()=>{
  const text='慢下来📚。\n\n慢下来📚。',start=text.lastIndexOf('慢');
  const a=createAnchor(text,start,text.length);assert.equal(a.start,start);assert.equal(a.exact,'慢下来📚。');
  for(const [s,e] of [[-1,2],[2,1],[0,100],[0,0],[.5,2]])assert.equal(createAnchor(text,s,e),null);
  assert.equal(createAnchor(' \n ',0,3),null);
});
test('overlap and cross-paragraph segments preserve exact text',()=>{
  const text='第一段📚\n\n第二段';const ranges=[{...createAnchor(text,1,9),id:'a'},{...createAnchor(text,3,10),id:'b'}];
  const parts=segments(text,0,ranges);assert.equal(parts.map(p=>p.text).join(''),text);assert.ok(parts.some(p=>p.ids.length===2));
  assert.equal(segments(text.slice(7),7,ranges).map(p=>p.text).join(''),text.slice(7));assert.deepEqual(segments('abc',0,[]),[{text:'abc',ids:[]}]);
});
