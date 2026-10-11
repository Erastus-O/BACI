// Live journey: the web app against the real BACI API, real Postgres and a stand-in for Plaid.
//
//   1. Build the web app pointed at the API port used here:
//        EXPO_PUBLIC_API_URL=http://localhost:8790 EXPO_PUBLIC_ELEVENLABS_AGENT_ID=off \
//          npx expo export --platform web --clear --output-dir dist-live
//   2. TEST_DATABASE_URL=postgres://… node e2e/live.mjs dist-live [screenshotDir]
//
// Starts the fake Plaid (server/test/fakePlaid.ts) and the API (server/src/index.ts) itself.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../../server');
const root = path.resolve(process.argv[2] ?? 'dist-live');
const shots = process.argv[3];
const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('Set TEST_DATABASE_URL');
const API_PORT = 8790;
const WEB_PORT = 8791;
const PLAID_PORT = 5099;

const procs = [];
function start(name, args, env) {
  const p = spawn(path.join(serverDir, 'node_modules/.bin/tsx'), args, { cwd: serverDir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      if (/on :|on http/.test(String(d))) resolve();
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(`[${name}] ${d}`));
    p.on('exit', (code) => reject(new Error(`${name} exited (${code})`)));
    setTimeout(() => reject(new Error(`${name} didn't start`)), 30000);
  });
}

await start('plaid', ['test/fakePlaid.ts', String(PLAID_PORT)], {});
await start('api', ['src/index.ts'], {
  PORT: String(API_PORT),
  DATABASE_URL: dbUrl,
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PLAID_CLIENT_ID: 'cid',
  PLAID_SECRET: 'sec',
  PLAID_BASE_URL: `http://localhost:${PLAID_PORT}`,
  ALLOW_SANDBOX_SHORTCUT: 'true',
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
});

const web = http
  .createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = fs.existsSync(`${p}.html`) ? `${p}.html` : path.join(root, 'index.html');
    const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' }[path.extname(p)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(fs.readFileSync(p));
  })
  .listen(WEB_PORT);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const visible = (l) => l.filter({ visible: true }).first();
const see = (t, o = {}) => visible(page.getByText(t, { exact: false })).waitFor({ timeout: o.timeout ?? 10000 });
const click = async (t) => visible(page.getByText(t, { exact: true })).click();
const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `live-${name}.png`) });
let n = 0;
const step = (s) => console.log(`\n# ${++n}. ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);

const email = `ada+${Date.now()}@example.com`;
const password = 'correct horse battery';
let failed = false;

try {
  step('Welcome → Get started → create an account');
  await page.goto(`http://localhost:${WEB_PORT}/welcome`);
  await see("Hello, I'm BACI");
  await click('Get started');
  await see('Create your BACI account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await shot('01-signup');
  await click('Create account');
  await see('What do you want me to access?');
  ok('signed up and landed on consent');

  step('Consent → profile (skip) → connect');
  await click('Agree and continue');
  await see('a little about you');
  await click('Skip for now');
  await see('Connect your account');
  await see('Secure connection by Plaid');
  await shot('02-connect');
  ok('live connect screen');

  step("Connect Plaid's test bank → 3 accounts found → keep all → sync");
  await click('Use Plaid’s test bank (sandbox)');
  await see('Found 3 accounts');
  await click('Review 3 accounts');
  await see('Choose accounts');
  await shot('03-select');
  await click('Use 3 accounts');
  await see('Monzo is connected', { timeout: 20000 });
  await shot('04-connected');
  ok('Monzo connected with real (stand-in) data');

  step('Finish onboarding → first insight from real transactions');
  await click('Done');
  await see('Add another account?');
  await click('Continue with 3 accounts');
  await see('Your first insight');
  await see('Netflix twice');
  await shot('05-insight');
  await click('Explore my finances');
  await see('Your money, together');
  await see('£1,240.50');
  await shot('06-home');
  ok('home shows the real balance and the duplicate Netflix subscription');

  step('Ask BACI: affordability on real bills, income and spending');
  await visible(page.getByRole('tab', { name: /Ask BACI/ })).click();
  await visible(page.getByLabel('Message BACI')).fill('Can I afford a £300 chair?');
  await page.keyboard.press('Enter');
  await see('chair', { timeout: 15000 });
  await see('Bills & repayments (30 days)', { timeout: 15000 });
  await shot('07-afford');
  ok('affordability card computed from live data');

  step('Reload → still signed in (session restored)');
  await page.goto(`http://localhost:${WEB_PORT}/`);
  await see('Your money, together', { timeout: 15000 });
  ok('session restored from storage');

  step('Settings → sign out → sign back in');
  await visible(page.getByRole('tab', { name: /Settings/ })).click();
  await see(`Signed in as ${email}`);
  await shot('08-settings');
  await click('Sign out');
  await see("Hello, I'm BACI");
  await click('I already have an account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await click('Sign in');
  await see('Your money, together', { timeout: 15000 });
  ok('signed out and back in; data still there');

  step('Delete account → everything gone');
  await visible(page.getByRole('tab', { name: /Settings/ })).click();
  await click('Delete account');
  await click('Delete everything');
  await see("Hello, I'm BACI");
  await click('I already have an account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await click('Sign in');
  await see('don’t match');
  ok('account deleted; sign-in refused');

  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  console.log(`\nAll ${n} live steps passed.`);
} catch (e) {
  failed = true;
  console.error(`\n✗ Step ${n} failed: ${e.message}`);
  if (shots) await page.screenshot({ path: path.join(shots, 'live-FAILED.png') });
} finally {
  await browser.close();
  web.close();
  procs.forEach((p) => p.kill());
  process.exit(failed ? 1 : 0);
}
