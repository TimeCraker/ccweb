import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { WebSocket } from 'ws'
const port = 38000 + Math.floor(Math.random() * 2000)
const profile = mkdtempSync(join(tmpdir(), 'ccweb-protocol-'))
const workspace = join(profile, 'workspace')
mkdirSync(workspace)
let child: ChildProcess
const sockets: WebSocket[] = []
type Frame = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
async function boot() {
 child = spawn(process.execPath, ['--import', 'tsx', 'test/fixture-server.mjs'], { cwd: process.cwd(), env: { ...process.env, CCWEB_FIXTURE_ENTRY: resolve('src/index.ts'), CCWEB_PORT: String(port), CCWEB_HOME: join(profile, 'app'), CLAUDE_CONFIG_DIR: join(profile, 'claude'), CCWEB_WORKSPACE: workspace }, stdio: 'ignore', windowsHide: true })
 for(let n=0;n<100;n++) { try { if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return } catch { /* waiting for boot */ } await new Promise(r=>setTimeout(r,50)) }
 throw new Error('Fixture failed to boot')
}
async function client() {
 const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const frames: Frame[]=[]
 ws.on('message',raw=>frames.push(JSON.parse(String(raw))))
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
 sockets.push(ws)
 return { ws, frames, send:(body:Frame)=>ws.send(JSON.stringify(body)), wait:async (predicate:(frame:Frame)=>boolean) => { for(let n=0;n<200;n++){const frame=frames.find(predicate);if(frame)return frame;await new Promise(r=>setTimeout(r,20))} throw new Error('Frame missing') } }
}
beforeAll(boot,15000)
afterAll(async()=>{for(const ws of sockets)ws.close();child?.kill();await new Promise(r=>setTimeout(r,200));rmSync(profile,{recursive:true,force:true})})
it('deduplicates mutations, isolates observers and rejects wrong workspace attachment',async()=>{
 const a=await client(), b=await client()
 const id=crypto.randomUUID()
 a.send({t:'prompt',text:'protocol unique',commandId:id})
 await a.wait(f=>f.t==='ack'&&f.requestId===id&&f.ok)
 await a.wait(f=>f.t==='message'&&f.sdkMessage?.type==='result')
 a.send({t:'prompt',text:'protocol unique',commandId:id})
 await new Promise(r=>setTimeout(r,100))
 expect(a.frames.filter(f=>f.t==='accepted'&&f.runId===id)).toHaveLength(1)
 expect(b.frames.some(f=>['accepted','metrics','message'].includes(f.t))).toBe(false)
 const sid=a.frames.find(f=>f.t==='accepted')!.sessionId
 b.send({t:'workspace.set',dir:profile,commandId:crypto.randomUUID()})
 b.send({t:'session.open',sessionId:sid})
 await b.wait(f=>f.t==='error'&&/another workspace/.test(f.message))
},10000)
it('failed operations have false receipts and persisted settings survive restart without resubmission',async()=>{
 const a=await client()
 const bad=crypto.randomUUID()
 a.send({t:'permission.resolve',requestId:'missing',allow:true,commandId:bad})
 expect((await a.wait(f=>f.t==='ack'&&f.requestId===bad)).ok).toBe(false)
 const id=crypto.randomUUID()
 a.send({t:'settings.patch',patch:{model:'fixture-persisted',contextScope:'none'},commandId:id})
 await a.wait(f=>f.t==='ack'&&f.requestId===id&&f.ok)
 for(const ws of sockets)ws.close()
 child.kill();await new Promise<void>(resolve=>child.once('exit',()=>resolve()))
 await boot()
 const b=await client(); b.send({t:'settings.get'})
 const snapshot=await b.wait(f=>f.t==='settings')
 expect(snapshot.settings.model).toBe('fixture-persisted')
 expect(snapshot.settings.contextScope).toBe('none')
 b.send({t:'request.status',commandId:id})
 expect((await b.wait(f=>f.t==='ack'&&f.requestId===id)).ok).toBe(true)
 expect(b.frames.some(f=>f.t==='accepted')).toBe(false)
},15000)
