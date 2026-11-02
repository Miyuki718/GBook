import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Library} from '@gbook/core';
test('real STDIO MCP: shared data, read-only default and opt-in writes',async()=>{
 mkdirSync('.test-data',{recursive:true});const dir=mkdtempSync(resolve('.test-data/mcp-'));const lib=new Library(join(dir,'library.db'));lib.migrate();lib.addBook({id:'book',title:'MCP 测试',subtitle:'',author:'Test',color:'sand',motif:'读',description:'',chapters:[{id:'c',title:'章节',paragraphs:['原文测试。']}]});
 async function connect(write){const client=new Client({name:'gbook-test',version:'1.0'});const transport=new StdioClientTransport({command:process.execPath,args:[resolve('apps/mcp-server/src/index.ts')],cwd:process.cwd(),env:{...process.env,GBOOK_DATA_DIR:dir,GBOOK_ROOT:process.cwd(),GBOOK_MCP_WRITE:write?'1':'0'},stderr:'pipe'});await client.connect(transport);return client;}
 try{let client=await connect(false);const names=(await client.listTools()).tools.map(t=>t.name);assert.ok(names.includes('get_chapter'));assert.ok(!names.includes('create_annotation'));const result=await client.callTool({name:'get_chapter',arguments:{bookId:'book',chapterId:'c'}});assert.equal(JSON.parse(result.content[0].text).text,'原文测试。');await client.close();client=await connect(true);const created=await client.callTool({name:'create_annotation',arguments:{bookId:'book',chapterId:'c',start:0,end:2,exact:'原文',note:'MCP 实际写入'}});assert.equal(created.isError,undefined);assert.equal(lib.annotations()[0].source,'mcp');assert.equal(lib.annotations()[0].note,'MCP 实际写入');await client.close();}finally{lib.close();rmSync(dir,{recursive:true,force:true});}
});
