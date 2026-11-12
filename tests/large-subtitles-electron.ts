/** A synthetic 15-minute / 300-cue project; operation times include Playwright overhead. */
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createProject, createClip } from '../src/core/model';
const root=process.cwd(),output=path.join(root,'.test-output/large-subtitles-electron');await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const project=createProject('On beş dakikalık altyazı kabulü');project.tracks[0].name='Altyazı';project.clips=Array.from({length:300},(_,i)=>{const c=createClip(undefined,project.tracks[0].id,i*3,30);c.duration=3;c.text!.text=`No ${String(i+1).padStart(3,'0')} sentetik altyazı`;return c;});
const file=path.join(output,'large.cevikedit');await writeFile(file,JSON.stringify(project));
const packaged=process.env.CEVIKEDIT_TEST_APP,env=Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined));env.CEVIKEDIT_USER_DATA=path.join(output,'user-data');delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;if(packaged){env.PATH='';delete env.CEVIKEDIT_FFMPEG;delete env.CEVIKEDIT_FFPROBE;}
const begin=performance.now();const app=await electron.launch({...packaged?{executablePath:path.join(path.resolve(packaged),'Contents/MacOS/CevikEdit'),args:[file],cwd:output}:{args:[path.join(root,'dist-electron/main.cjs'),file]},env});const page=await app.firstWindow(),errors:string[]=[],checks:string[]=[];const timings:Record<string,number>={};page.on('pageerror',e=>errors.push(e.message));
try{
 // Large timelines render only the visible slice, so the DOM never holds 300 nodes.
 await expect.poll(()=>page.locator('.tl-clip').count(),{timeout:30000}).toBeGreaterThan(0);
 const renderedClips=await page.locator('.tl-clip').count();assert(renderedClips<300,`expected virtualization, got ${renderedClips} rendered clips`);
 timings.launchToTimelineMs=Math.round(performance.now()-begin);
 await app.evaluate(({dialog})=>{(dialog as any).showMessageBox=async()=>({response:2});});
 await page.getByRole('button',{name:'Altyazı',exact:true}).click();await expect(page.locator('.subtitle-cue')).toHaveCount(300);
 let start=performance.now();await page.getByLabel('Altyazı ara',{exact:true}).fill('No 300');await expect(page.locator('.subtitle-cue')).toHaveCount(1);timings.searchMs=Math.round(performance.now()-start);
 await page.locator('.subtitle-cue-content').click();await expect(page.getByLabel('Altyazı başlangıç zamanı',{exact:true})).toHaveValue('897');checks.push('300 cues across 15 minutes load, filter and locate the final cue at its absolute timeline position');
 await page.getByLabel('Altyazı ara',{exact:true}).fill('');await page.getByRole('checkbox',{name:'Arama sonucunu seç',exact:true}).check();await page.getByLabel('Altyazı kaydırma saniyesi',{exact:true}).fill('1');
 start=performance.now();await page.getByRole('button',{name:'Değişiklikleri denetle',exact:true}).click();await page.getByRole('button',{name:'300 değişikliği uygula',exact:true}).click();await page.getByRole('button',{name:'Projeyi kaydet',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await readFile(file,'utf8')).clips[0].start,{timeout:20000}).toBe(1);timings.planApplySaveMs=Math.round(performance.now()-start);
 const shifted=JSON.parse(await readFile(file,'utf8'));assert(shifted.clips.every((c:any,i:number)=>Math.abs(c.start-(i*3+1))<1e-8&&c.duration===3&&c.text.text===project.clips[i].text!.text));checks.push('one batch operation shifts all 300 cues precisely and preserves every duration and text through native save');
 start=performance.now();await page.getByRole('button',{name:'Geri al',exact:true}).click();await page.getByRole('button',{name:'Projeyi kaydet',exact:true}).click();await expect.poll(async()=>JSON.parse(await readFile(file,'utf8')).clips[0].start).toBe(0);timings.undoSaveMs=Math.round(performance.now()-start);
 const restored=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(restored.clips,JSON.parse(JSON.stringify(project.clips)));checks.push('a single undo restores all 300 original clips byte-for-byte in their project data');
 const memory=await app.evaluate(({app})=>app.getAppMetrics().filter(m=>m.type==='Tab').map(m=>({type:m.type,memory:m.memory})));
 await page.screenshot({path:path.join(output,'large-subtitles.png')});assert.deepEqual(errors,[]);await writeFile(path.join(output,'evidence.json'),JSON.stringify({at:new Date().toISOString(),packaged:!!packaged,cueCount:300,projectDurationSeconds:900,checks,timingsMsIncludingAutomation:timings,rendererMemory:memory,errors},null,2));console.log(JSON.stringify({checks,timings,memory,errors},null,2));
}catch(e){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e;}finally{await app.close();}
