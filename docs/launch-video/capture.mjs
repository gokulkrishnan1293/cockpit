// Renders video.html frame by frame through headless Chrome's DevTools
// protocol: render(t) is a pure function of time, each frame a screenshot.
// usage: node --experimental-websocket capture.mjs <outdir> <fps> <t0> <t1>   (or: stills <outdir> t1,t2,...)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const args = process.argv.slice(2)
const isStills = args[0] === 'stills'
const outDir = resolve(isStills ? args[1] : args[0])
mkdirSync(outDir, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${resolve('chrome-profile')}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1920,1080', '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
await send('Page.enable')
await send('Page.navigate', { url: 'file://' + resolve('video.html') })
await sleep(1500)
await send('Runtime.evaluate', { expression: 'window.ready', awaitPromise: true })

async function shot(t, file) {
  await send('Runtime.evaluate', { expression: `render(${t})` })
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(file, Buffer.from(r.result.data, 'base64'))
}

if (isStills) {
  for (const t of args[2].split(',').map(Number)) await shot(t, `${outDir}/still-${t.toFixed(2)}.png`)
} else {
  const fps = Number(args[1]), t0 = Number(args[2]), t1 = Number(args[3])
  const n = Math.round((t1 - t0) * fps)
  for (let i = 0; i < n; i++) {
    await shot(t0 + i / fps, `${outDir}/f${String(i).padStart(5, '0')}.png`)
    if (i % 60 === 0) console.log(`frame ${i}/${n}`)
  }
}
ws.close(); chrome.kill()
