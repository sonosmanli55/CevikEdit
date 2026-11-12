/** Standalone control, accessibility and undo transaction checks. */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const source = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import VisualTools from'/src/components/VisualTools.tsx';import{useEditorStore}from'/src/editor/store.ts';import{createProject,createClip}from'/src/core/model.ts';
const project=createProject();const asset={id:'image',name:'Kaynak görüntü.png',path:'demo-image',url:'data:image/png;base64,AA==',kind:'image',width:80,height:40,duration:0,fps:0,hasAudio:false};project.assets=[asset];project.clips=[createClip(asset,project.tracks.find(t=>t.kind==='video').id,0,30)];useEditorStore.getState().setProject(project);window.qa=useEditorStore;
function Harness(){const state=useEditorStore(),[mode,setMode]=useState('crop'),[locked,setLocked]=useState(false);return <main style={{height:'100vh',background:'#14171e',padding:35,color:'#c6d2e1',fontFamily:'-apple-system,sans-serif'}}><div style={{display:'flex',gap:16,maxWidth:900,margin:'auto'}}><section style={{padding:25,width:320,border:'1px solid #343e4b',borderRadius:10,background:'#1c222c'}}><header style={{display:'flex',gap:8,marginBottom:20}}>{['crop','chroma','mask'].map(value=><button onClick={()=>setMode(value)} key={value}>{value==='crop'?'Kırp':value==='chroma'?'Kroma':'Maske'}</button>)}<button onClick={()=>setLocked(!locked)}>Kilitle</button></header><VisualTools mode={mode} clip={state.project.clips[0]} asset={asset} locked={locked} onUpdate={patch=>state.updateClip(state.project.clips[0].id,patch)}/></section><article style={{padding:25,flex:1,color:'#8b9db3',fontSize:13,lineHeight:2}}><h2 style={{color:'#dce7f2',fontSize:19}}>Görüntü araçları · yerel denetim kabulü</h2><p>Kaynak görüntüyü kırpın, belirli bir rengi kaldırın, şekil maskesi kullanın.</p><p>Tüm parametreler düzenleyici durumuyla kaydedilir; ardışık düzenlemeler tek geri alma adımında birleşir.</p><pre style={{background:'#1c222c',padding:18,borderRadius:8,fontSize:11,whiteSpace:'pre-wrap'}}>{JSON.stringify({crop:state.project.clips[0].crop,chromaKey:state.project.clips[0].chromaKey,mask:state.project.clips[0].mask,undo:state.past.length},null,2)}</pre></article></div></main>};createRoot(document.getElementById('root')).render(<Harness/>);
`;
const server = await createServer({
  configFile: false,
  plugins: [
    react(),
    {
      name: "visual-ui-harness",
      resolveId(id) {
        if (id === "virtual:visual-ui") return "\0virtual:visual-ui";
      },
      load(id) {
        if (id === "\0virtual:visual-ui") return source;
      },
      transform(code, id) {
        if (id === "\0virtual:visual-ui")
          return import("esbuild")
            .then((esbuild) =>
              esbuild.transform(code, { loader: "jsx", jsx: "automatic" }),
            )
            .then((result) => ({ code: result.code, map: null }));
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/visual-ui") return next();
          server
            .transformIndexHtml(
              "/visual-ui",
              '<html><head><link rel="icon" href="data:,"><style>body{margin:0}button{cursor:pointer;background:#2d3b48;color:#cad9e7;padding:7px;border:1px solid #425467;border-radius:4px}</style></head><body><div id="root"></div><script type="module" src="/@id/__x00__virtual:visual-ui"></script></body></html>',
            )
            .then((html) => {
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            });
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5182, strictPort: true },
});
await server.listen();
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
const page = await browser.newPage({ viewport: { width: 1250, height: 850 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const state = () => page.evaluate(() => (window as any).qa.getState());
try {
  await page.goto("http://127.0.0.1:5182/visual-ui");
  await page.waitForSelector(".visual-tools");
  await expect(
    page.getByRole("spinbutton", { name: "Kırpma genişliği" }),
  ).toBeDisabled();
  assert.equal((await state()).project.clips[0].crop, undefined);
  await page.getByRole("checkbox", { name: "Görüntü kırpmayı etkinleştir" }).check();
  await page.getByRole("combobox", { name: "Kırpma oranı" }).selectOption("1:1");
  assert.deepEqual((await state()).project.clips[0].crop, {
    x: 0.25,
    y: 0,
    width: 0.5,
    height: 1,
  });
  const width = page.getByRole("spinbutton", { name: "Kırpma genişliği" });
  await expect(width).toHaveAttribute("min", "1");
  await width.fill("0");
  await width.blur();
  assert.equal((await state()).project.clips[0].crop.width, 0.01);
  await page.getByRole("combobox", { name: "Kırpma oranı" }).selectOption("1:1");
  const past = (await state()).past.length;
  await width.focus();
  for (const value of ["45", "40", "35", "30"]) await width.fill(value);
  await width.blur();
  assert.equal(
    (await state()).past.length,
    past + 1,
    "several edits while focused must produce one undo step",
  );
  assert.equal((await state()).project.clips[0].crop.width, 0.3);
  await page.getByRole("spinbutton", { name: "Sol konum" }).fill("95");
  await page.getByRole("spinbutton", { name: "Sol konum" }).blur();
  assert.equal(
    (await state()).project.clips[0].crop.x,
    0.7,
    "invalid source overflow must be clamped",
  );
  await page.getByRole("button", { name: "Tam görüntüye sıfırla" }).click();
  assert.equal((await state()).project.clips[0].crop, undefined);
  await page.getByRole("button", { name: "Kroma key", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Renk toleransı" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Kroma key'i etkinleştir" }).check();
  await page.getByRole("button", { name: "Mavi perde", exact: true }).click();
  assert.equal((await state()).project.clips[0].chromaKey.color, "#0000ff");
  await page.getByRole("button", { name: "Kroma key'i temizle" }).click();
  assert.equal((await state()).project.clips[0].chromaKey, undefined);
  await page.getByRole("button", { name: "Maske", exact: true }).click();
  await page.getByRole("checkbox", { name: "Şekil maskesini etkinleştir" }).check();
  const maskWidth = page.getByRole("spinbutton", { name: "Maske genişliği" });
  await expect(maskWidth).toHaveAttribute("min", "1");
  await maskWidth.fill("0");
  await maskWidth.blur();
  assert.equal((await state()).project.clips[0].mask.width, 0.01);
  await page.getByRole("button", { name: "Elips", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Maske genişliği" }).fill("60");
  await page.getByRole("spinbutton", { name: "Maske genişliği" }).blur();
  await page.getByRole("checkbox", { name: "Maskeyi ters çevir" }).check();
  assert.deepEqual((await state()).project.clips[0].mask, {
    shape: "ellipse",
    width: 0.6,
    height: 1,
    feather: 0,
    invert: true,
  });
  await page.getByRole("button", { name: "Kilitle", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Şekil maskesini etkinleştir" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Maskeyi temizle" })).toBeDisabled();
  await page.getByRole("button", { name: "Kilitle", exact: true }).click();
  assert.deepEqual(errors, []);
  mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/visual-tools-components.png",
  });
  console.log(
    "Visual tool browser controls and undo transaction checks passed",
  );
} finally {
  await browser.close();
  await server.close();
}
