import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? '.impeccable/review';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});

// --- Server Action: create a semester -------------------------------------
await page.goto(`${BASE}/semesters`, { waitUntil: 'networkidle' });
const before = await page.locator('ul li').count();

const stamp = `E2E ${Date.now()}`;
await page.fill('input[name="name"]', stamp);
await page.fill('input[name="year"]', '2027');
await page.selectOption('select[name="status"]', 'upcoming');
await page.click('button[type="submit"]');
await page.waitForFunction(
  (n) => document.querySelectorAll('ul li').length > n,
  before,
  { timeout: 10000 },
);
check('createSemester action persists a new semester', await page.getByText(stamp).count() > 0);

// --- Server Action: archive / restore --------------------------------------
const row = page.locator('li', { hasText: stamp }).first();
await row.getByRole('button', { name: 'Archive' }).click();
await page.waitForFunction(
  (s) => {
    const li = [...document.querySelectorAll('li')].find((e) => e.textContent?.includes(s));
    return li?.textContent?.includes('Restore');
  },
  stamp,
  { timeout: 10000 },
);
check('setSemesterStatus action archives in place', true);

// --- Server Action: create a unit inside a seeded semester -----------------
await page.goto(`${BASE}/semesters/1`, { waitUntil: 'networkidle' });
const unitsBefore = await page.locator('ul li').count();
const unitName = `E2E Unit ${Date.now()}`;
await page.fill('input[name="name"]', unitName);
await page.fill('input[name="code"]', 'E2E1000');
await page.click('button[type="submit"]');
await page.waitForFunction(
  (n) => document.querySelectorAll('ul li').length > n,
  unitsBefore,
  { timeout: 10000 },
);
check('createUnit action persists a new unit', await page.getByText(unitName).count() > 0);

// --- Persistence across a fresh page load ---------------------------------
await page.goto(`${BASE}/semesters/1`, { waitUntil: 'networkidle' });
check('new unit survives a fresh load', await page.getByText(unitName).count() > 0);

// --- Captures --------------------------------------------------------------
for (const [name, url] of [
  ['semesters', `${BASE}/semesters`],
  ['semester-detail', `${BASE}/semesters/1`],
  ['unit', `${BASE}/units/1`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const [name, url] of [
  ['semesters', `${BASE}/semesters`],
  ['semester-detail', `${BASE}/semesters/1`],
]) {
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
}

// --- Horizontal overflow check (craft floor: no body scroll at 390px) -----
const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check('no horizontal overflow at 390px', overflow <= 0, `overflow ${overflow}px`);

await browser.close();

// Remove the rows this run created. Without this every run leaves an "E2E …"
// semester and unit behind, and the next screenshot is of a polluted board.
{
  const { createClient } = await import('@libsql/client');
  const { resolveDatabaseUrl } = await import('../lib/db/path.ts');
  const client = createClient({ url: resolveDatabaseUrl() });
  await client.execute("PRAGMA foreign_keys = ON");
  const s = await client.execute("DELETE FROM semesters WHERE name LIKE 'E2E %'");
  const u = await client.execute("DELETE FROM units WHERE name LIKE 'E2E Unit%'");
  client.close();
  console.log(`cleanup: removed ${s.rowsAffected} semesters, ${u.rowsAffected} units`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
