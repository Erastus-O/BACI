// Acceptance walk-through from docs/design/BACI_FLOW_SPEC.md §6, against the web build.
//
//   npx expo export --platform web            # builds ./dist
//   npm i -D playwright && node e2e/journey.mjs [distDir] [screenshotDir]
//
// Serves the static build itself at 390×844 and fails on the first missing step.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = path.resolve(process.argv[2] ?? 'dist');
const shots = path.resolve(process.argv[3] ?? 'e2e/screenshots');
fs.mkdirSync(shots, { recursive: true });

const types = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http
  .createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
    res.setHeader('Content-Type', types[path.extname(p)] ?? 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  })
  .listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const visible = (loc) => loc.filter({ visible: true }).first();
const text = (t) => visible(page.getByText(t, { exact: true }));
const click = async (t) => (await text(t)).click();
const button = (name) => visible(page.getByRole('button', { name, exact: true }));
const see = async (t, opts = {}) => visible(page.getByText(t, { exact: false, ...opts })).waitFor({ timeout: 10000 });
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
};
let n = 0;
const step = (s) => console.log(`\n# ${++n}. ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);

try {
  step('01 → 02 (switch one off, then on) → 03 (Skip) → 04');
  await page.goto(`${base}/`);
  await see('One clear view of all your money');
  await see('not regulated financial advice');
  await shot('01-welcome');
  await click('Get started');
  await see('What BACI can look at');
  const sw = visible(page.getByRole('switch', { name: 'Spending categories' }));
  await sw.click();
  await see('7 of 9 allowed');
  await sw.click();
  await see('8 of 9 allowed');
  await shot('02-consent');
  await click('Agree and continue');
  await see('A little about you');
  await shot('03-profile');
  await click('Skip for now');
  await see('Connect your first account');
  await shot('04-connect');
  ok('onboarding reached 04');

  step('Lumen Card → 04a → 04b → Cancel → E1 → Choose a different provider; nothing connected');
  await click('Lumen Card');
  await click('Continue to Lumen Card');
  await see("You're in Lumen Card, not BACI");
  await click('Cancel and return to BACI');
  await see("Lumen Card wasn't connected");
  await see('Nothing was shared with BACI.');
  await shot('E1-cancelled');
  await click('Choose a different provider');
  await see('Connect your first account');
  ok('failed new connection was deleted');

  step('Harbour → Approve → Found 2 → untick loan → Use 1 account → 05a → 05b nudge → Done → 06');
  await click('Harbour Bank');
  await shot('04a-before');
  await click('Continue to Harbour Bank');
  await shot('04b-signin');
  await click('Sign in');
  await shot('04b-approve');
  await click('Approve');
  await see('Found 2 accounts');
  await shot('04c-found');
  await click('Review 2 accounts');
  await visible(page.getByRole('checkbox', { name: /Personal Loan/ })).click();
  await see('Use 1 account');
  await shot('05-select');
  await click('Use 1 account');
  await see('Syncing Harbour Bank');
  await shot('05a-syncing');
  await see('Harbour Bank is connected', { timeout: 15000 });
  await see("a loan you haven't connected");
  await shot('05b-connected');
  await click('Done');
  await see('Add another account?');
  ok('05b nudge mentions the unticked loan');

  step('Add another → Northgate → Sandbox: one account fails → E2 → Continue with 1 account');
  await click('Add another account');
  await click('Northgate Building Society');
  await click('Continue to Northgate Building Society');
  await click('Sign in');
  await click('One account fails');
  await click('Approve');
  await click('Review 2 accounts');
  await click('Use 2 accounts');
  await see('Northgate Building Society is partly connected', { timeout: 15000 });
  await see('Sync failed');
  await shot('E2-partial');
  await click('Continue with 1 account');
  await see('Add another account?');
  await shot('06-add-another');
  ok('partial sync handled');

  step('06 Continue → 07 → Explore → 08 shows the Sync failed alert');
  await click('Continue with 2 accounts');
  await see('Your first insight');
  await see('Nothing urgent to flag');
  await shot('07-insight');
  await click('Explore my finances');
  await see('Your money, together');
  await see('sync failed');
  await shot('08-home');
  ok('home names the failed account');

  step('A1: sofa on finance → asks price → £1,400 → asks term → 24 months at 9.9% → card with monthly cost');
  await visible(page.getByRole('tab', { name: /Ask BACI/ })).click().catch(() => click('Ask BACI'));
  await see("Hi, I'm BACI");
  await click('Can I buy this sofa on finance?');
  await see('How much does the sofa cost?');
  const box = visible(page.getByLabel('Message BACI'));
  await box.fill('£1,400');
  await box.press('Enter');
  await see("what's the APR?");
  await box.fill('24 months at 9.9%');
  await box.press('Enter');
  await see('/month', { timeout: 10000 });
  await see('Finance (24 months at 9.9%)');
  await shot('10-afford-finance');
  ok('A2 asked before answering; card shows the monthly cost');

  step('09: Simulate re-auth → Re-authenticate → E3 → Continue → 04b (bank colours) → Approve → 05a → 05b');
  await visible(page.getByRole('tab', { name: /Accounts/ })).click().catch(() => click('Accounts'));
  await see('Last successful sync');
  await visible(page.getByRole('button', { name: 'Simulate Re-auth' })).click();
  await see('Reconnect needed');
  await shot('09-accounts-reauth');
  await click('Re-authenticate');
  await see('Reconfirm access to');
  await shot('E3-reconnect');
  await visible(page.getByRole('button', { name: /^Continue to / })).click();
  await see('not BACI');
  await click('Sign in');
  await click('Approve');
  await see('is connected', { timeout: 15000 });
  await shot('05b-after-reauth');
  ok('re-authorisation went straight to sync');

  step('09: Disconnect Harbour → S3 confirm → Home totals drop');
  await click('Done');
  await see('Last successful sync');
  const harbourCard = page.getByText('Harbour Bank', { exact: true }).filter({ visible: true });
  await harbourCard.waitFor();
  const disconnects = page.getByRole('button', { name: 'Disconnect', exact: true }).filter({ visible: true });
  await disconnects.first().click();
  await see('Disconnect Harbour Bank?');
  await shot('S3-disconnect');
  await visible(page.getByRole('button', { name: 'Disconnect', exact: true }).last()).click();
  await page.waitForTimeout(600);
  await visible(page.getByRole('tab', { name: /Home/ })).click().catch(() => click('Home'));
  await see('Available in current accounts');
  await see('£0.00');
  await shot('08-home-after-disconnect');
  ok('Harbour removed; current-account total dropped to £0.00');

  step('S1 → S2 → Revoke all → S4 on Home; A1 says it needs permission');
  await visible(page.getByRole('tab', { name: /Settings/ })).click().catch(() => click('Settings'));
  await see('Financial profile');
  await shot('S1-settings');
  await click('Data permissions');
  await see('Version 2026-09.1');
  await visible(page.getByRole('switch', { name: 'Savings & ISAs' })).click();
  await see("Savings aren’t counted");
  await shot('S2-permissions-hint');
  await visible(page.getByRole('switch', { name: 'Savings & ISAs' })).click();
  await visible(page.getByRole('button', { name: 'Revoke all access' })).click();
  await visible(page.getByRole('button', { name: 'Revoke all access' }).last()).click();
  await see("BACI isn't allowed to analyse your data");
  await shot('S4-revoked');
  await visible(page.getByRole('tab', { name: /Ask BACI/ })).click().catch(() => click('Ask BACI'));
  await box.fill('How much money do I have?');
  await box.press('Enter');
  await see("I don't have permission to look at your accounts");
  await shot('A1-no-permission');
  ok('revocation respected by Home and the agent');

  step('Sample data: "Can I afford a £1,200 laptop?" matches design 10 (tight, lowest £426, −£74 vs buffer)');
  await page.goto(`${base}/welcome`);
  await click('Explore with sample data');
  await see('£3,758.58');
  await see('Harbour Bank last synced 3 days ago');
  await shot('08-home-sample');
  await visible(page.getByRole('tab', { name: /Ask BACI/ })).click().catch(() => click('Ask BACI'));
  await click('Can I afford a £1,200 laptop?');
  await see("Affordable, but it's tight · laptop");
  await see('−£73.93');
  await see('What about £720?');
  await shot('10-afford-laptop');
  await click('How much money do I have?').catch(async () => {
    await box.fill('How much money do I have?');
    await box.press('Enter');
  });
  await see('£8,600');
  await shot('A1-how-much');
  ok('figures match the design');

  step('Live data unavailable → A2 "won\'t guess" with Try again');
  await visible(page.getByRole('tab', { name: /Settings/ })).click().catch(() => click('Settings'));
  await visible(page.getByRole('switch', { name: 'Simulate live data unavailable' })).click();
  await visible(page.getByRole('tab', { name: /Ask BACI/ })).click().catch(() => click('Ask BACI'));
  await box.fill('Can I afford a £300 bike?');
  await box.press('Enter');
  await see("so I won't guess at the numbers");
  await see('Try again');
  await shot('A2-tool-failure');
  ok('agent refused to guess');

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log(`\nAll ${n} acceptance steps passed. Screenshots: ${shots}`);
} catch (e) {
  await shot('FAILED');
  console.error(`\n✗ Step ${n} failed: ${e.message}`);
  if (errors.length) console.error(`Page errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
