// Ask BACI against a fake ElevenLabs agent: a normal reply, a dropped conversation, and silence.
// A typed question must always get an answer: from the agent, or on the device with the reason shown.
//
//   EXPO_PUBLIC_SANDBOX=1 npx expo export --platform web --clear --output-dir dist-agent   # agent on (the default)
//   node e2e/agent.mjs dist-agent [screenshotDir] [reply|drop|silent]   # all three when no scenario is given
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = path.resolve(process.argv[2] ?? 'dist-agent');
const out = path.resolve(process.argv[3] ?? 'e2e/screenshots');
fs.mkdirSync(out, { recursive: true });
const scenarios = process.argv[4] ? [process.argv[4]] : ['reply', 'drop', 'silent'];
const types = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => { let p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html'); res.setHeader('Content-Type', types[path.extname(p)] ?? 'application/octet-stream'); fs.createReadStream(p).pipe(res); }).listen(0);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = false;
for (const scenario of scenarios) {
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.routeWebSocket(/elevenlabs\.io/, (ws) => {
  ws.send(JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'conv_test', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' } }));
  ws.onMessage((m) => {
    const msg = JSON.parse(String(m));
    if (msg.type !== 'user_message') return;
    if (scenario === 'reply') ws.send(JSON.stringify({ type: 'agent_response', agent_response_event: { agent_response: 'You have £3,758.58 across your current accounts.' } }));
    if (scenario === 'drop') setTimeout(() => ws.close({ code: 1008, reason: "Override for field 'text_only' is not allowed by config." }), 300);
    // 'silent': never answers
  });
});
const v = (l) => l.filter({ visible: true }).first();
await page.goto(`http://localhost:${srv.address().port}/welcome`);
await v(page.getByText('Explore with sample data', { exact: true })).click();
await v(page.getByText('£3,758.58')).waitFor();
await v(page.getByRole('tab', { name: /Ask BACI/ })).click();
await v(page.getByLabel('Message BACI')).fill('How much money do I have?');
await page.keyboard.press('Enter');
const t0 = Date.now();
const expect = { reply: 'You have £3,758.58 across your current accounts.', drop: "text_only' is not allowed by config), so this was answered on your device", silent: "BACI's agent didn't reply, so this was answered on your device" }[scenario];
let ok = true;
try { await v(page.getByText(expect, { exact: false })).waitFor({ timeout: 30000 }); } catch { ok = false; }
// The on-device answer should follow the notice.
const local = scenario === 'reply' ? true : await v(page.getByText('£8,600', { exact: false })).isVisible().catch(() => false);
await page.screenshot({ path: `${out}/agent-${scenario}.png` });
console.log(`${ok && local && !errors.length ? '✓' : '✗'} ${scenario}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, errors.length ? errors : '');
if (!(ok && local) || errors.length) failed = true;
await page.close();
}
await browser.close(); srv.close();
process.exit(failed ? 1 : 0);
