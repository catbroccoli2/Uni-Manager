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

// --- The assessment rack: inline editing ----------------------------------
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });

const stripCount = await page.locator('li.strip').count();
check('rack renders a strip per assessment', stripCount >= 4, `${stripCount} strips`);

// Edit a name, commit on blur, and confirm it survives a reload.
const newName = `Renamed ${Date.now()}`;
const nameCell = page.locator('li.strip').first().getByLabel('Assessment name');
await nameCell.fill(newName);
await nameCell.blur();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
const persistedName = await page
  .locator('li.strip')
  .first()
  .getByLabel('Assessment name')
  .inputValue();
check('name edit commits on blur and persists', persistedName === newName, persistedName);

// Edit a mark and confirm the derived raw % updates.
const markCell = page.locator('li.strip').first().getByLabel('Mark, in weighted points');
await markCell.fill('9');
await markCell.press('Enter');
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
const rawShown = await page.locator('li.strip').first().textContent();
check('mark edit recomputes raw %', rawShown?.includes('90%') === true, rawShown?.trim().slice(0, 80));

// Escape reverts rather than committing.
const escCell = page.locator('li.strip').first().getByLabel('Assessment name');
await escCell.fill('THROWAWAY');
await escCell.press('Escape');
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'networkidle' });
const afterEsc = await page
  .locator('li.strip')
  .first()
  .getByLabel('Assessment name')
  .inputValue();
check('Escape reverts without saving', afterEsc === newName, afterEsc);

// Blank mark means "not graded yet", never zero.
const blankCell = page.locator('li.strip').first().getByLabel('Mark, in weighted points');
await blankCell.fill('');
await blankCell.blur();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
const blanked = await page
  .locator('li.strip')
  .first()
  .getByLabel('Mark, in weighted points')
  .inputValue();
check('cleared mark stays blank rather than becoming 0', blanked === '', `"${blanked}"`);

// Restore the seeded values so screenshots and later runs are stable.
await blankCell.fill('8.5');
await blankCell.blur();
await page.waitForTimeout(400);
const restoreName = page.locator('li.strip').first().getByLabel('Assessment name');
await restoreName.fill('Assessment 1: Online Test');
await restoreName.blur();
await page.waitForTimeout(900);

// Adding a strip.
const before2 = await page.locator('li.strip').count();
await page.getByRole('button', { name: 'Add a strip' }).first().click();
await page.waitForFunction(
  (n) => document.querySelectorAll('li.strip').length > n,
  before2,
  { timeout: 10000 },
);
check('add a strip appends a row', true);

// Remove it again.
const last = page.locator('li.strip').last();
await last.getByRole('button', { name: /^Remove/ }).click();
await page.waitForFunction(
  (n) => document.querySelectorAll('li.strip').length === n,
  before2,
  { timeout: 10000 },
);
check('remove deletes the row', true);

// --- The grade calculator (PRD §7) ----------------------------------------
// Unit 1 seeded: graded 10@8.5 + 40@36.8 = 45.3 banked over 50 weight;
// 20 + 30 = 50 outstanding. Hand-computed expectations below.
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
const gauge = () => page.locator('section', { hasText: 'Where this unit stands' }).first();

const banked = (await gauge().textContent()) ?? '';
check('gauge reports the banked total', banked.includes('45.3'), 'expected 45.3');
check('gauge reports the floor-to-ceiling range', banked.includes('45.3–95.3'));
check('gauge reports the average so far', banked.includes('90.6'), 'expected 90.6%');
check('gauge reports outstanding weight', banked.includes('50'));

// Target D (70): needs 70 - 45.3 = 24.7 from 50 remaining = 49.4%.
await page.getByRole('button', { name: 'D', exact: true }).click();
await page.waitForTimeout(200);
const atD = (await gauge().textContent()) ?? '';
check('achievable target computes the needed average', atD.includes('49.4'), 'expected 49.4%');

// Target HD (80): needs 80 - 45.3 = 34.7 from 50 = 69.4%. Still achievable.
await page.getByRole('button', { name: 'HD', exact: true }).click();
await page.waitForTimeout(200);
const atHD = (await gauge().textContent()) ?? '';
check('HD target computes the needed average', atHD.includes('69.4'), 'expected 69.4%');

// Target 96: above the 95.3 ceiling, so §7's "impossible" must fire.
await page.getByLabel('Target percentage').last().fill('96');
await page.waitForTimeout(300);
const at96 = (await gauge().textContent()) ?? '';
check('unreachable target is flagged as out of reach', at96.includes('Out of reach'));
check('out-of-reach names the best possible', at96.includes('95.3'));

// Target 40: already below the 45.3 floor, so §7's "already guaranteed".
await page.getByLabel('Target percentage').last().fill('40');
await page.waitForTimeout(300);
const at40 = (await gauge().textContent()) ?? '';
check('banked target is flagged as locked in', at40.includes('Already locked in'));

// Unit 3 is fully graded (24 + 17 + 34 = 75), so the locked paths must render
// and nothing may divide by zero.
await page.goto(`${BASE}/units/3`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'D', exact: true }).click();
await page.waitForTimeout(250);
const settled = (await gauge().textContent()) ?? '';
check('fully graded unit shows a final score', settled.includes('75'));
check('fully graded unit reports a met target as final', settled.includes('Final'));
check('no Infinity or NaN when nothing remains', !/Infinity|NaN/.test(settled), settled.slice(0, 90));

// Unit 2's weightings sum to 85, so §7's warning must be visible.
await page.goto(`${BASE}/units/2`, { waitUntil: 'networkidle' });
const warned = (await gauge().textContent()) ?? '';
check('weightings not summing to 100 warns', warned.includes('Weightings total 85'));
check('warning says figures are still out of 100', warned.includes('out of 100'));

// --- Editable grade bands --------------------------------------------------
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.getByLabel('High Distinction threshold').fill('85');
await page.getByRole('button', { name: 'Save bands' }).click();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
const hd = await page.getByLabel('High Distinction threshold').inputValue();
check('grade band threshold persists', hd === '85', hd);

// The edited band must reach the calculator, not just the settings page.
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
const withEdited = (await gauge().textContent()) ?? '';
check('edited band reaches the calculator', withEdited.includes('85'), 'HD should now read 85');

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Restore defaults' }).click();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check(
  'restore defaults puts HD back to 80',
  (await page.getByLabel('High Distinction threshold').inputValue()) === '80',
);

// --- The board -------------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const boardText = (await page.locator('body').textContent()) ?? '';
check('board flags overdue work', boardText.includes('Overdue'));
check(
  'board shows the seeded near-term items',
  boardText.includes('Mid-semester Test') && boardText.includes('Assessment 3: Presentation'),
);
check('board shows current-semester standing', boardText.includes('Standing'));

// The 7/14 window is a real filter, not decoration: the 45-day exam must drop out.
const wide = boardText.includes('Final Examination');
await page.goto(`${BASE}/?days=7`, { waitUntil: 'networkidle' });
const narrowText = (await page.locator('body').textContent()) ?? '';
const narrow = narrowText.includes('Assessment 3: Presentation');
check(
  'window filter changes what is listed',
  !wide && narrow,
  `14d hides the +38d exam: ${!wide}; 7d keeps the +4d item: ${narrow}`,
);
check('overdue survives the narrow window', narrowText.includes('Overdue'));

// --- Export (PRD §6.6) -----------------------------------------------------
{
  const res = await page.request.get(`${BASE}/api/export`);
  check('export responds 200', res.status() === 200, String(res.status()));
  check(
    'export is served as a dated download',
    /attachment; filename="uni-manager-\d{4}-\d{2}-\d{2}\.json"/.test(
      res.headers()['content-disposition'] ?? '',
    ),
    res.headers()['content-disposition'],
  );

  const data = JSON.parse(await res.text());
  check('export carries a schema version', data.schemaVersion === 1);
  check(
    'export includes every table, Phase 2 ones included',
    ['semesters', 'units', 'assessments', 'contentSources', 'timetableEntries', 'gradeBands'].every(
      (k) => Array.isArray(data[k]),
    ),
  );
  check(
    'export round-trips real rows',
    data.semesters.length >= 2 && data.units.length >= 3 && data.assessments.length >= 11,
    `${data.semesters.length} semesters, ${data.units.length} units, ${data.assessments.length} assessments`,
  );
  // The values must survive as their real types, not stringified.
  const graded = data.assessments.find((a) => a.completed === true && a.mark !== null);
  check(
    'export preserves types (boolean completed, numeric mark, ISO date)',
    typeof graded?.completed === 'boolean' &&
      typeof graded?.mark === 'number' &&
      /^\d{4}-\d{2}-\d{2}$/.test(graded?.dueDate ?? ''),
    JSON.stringify({ completed: graded?.completed, mark: graded?.mark, dueDate: graded?.dueDate }),
  );
  check('export includes the grade bands', data.gradeBands.length === 5);
}

// --- Clean up before capturing --------------------------------------------
// Removing the rows this run created BEFORE the screenshots, so the captures
// show the real app rather than "E2E Unit 1789122326492" sitting in a bay.
async function cleanup() {
  const { createClient } = await import('@libsql/client');
  const { resolveDatabaseUrl } = await import('../lib/db/path.ts');
  const client = createClient({ url: resolveDatabaseUrl() });
  await client.execute('PRAGMA foreign_keys = ON');
  const s = await client.execute("DELETE FROM semesters WHERE name LIKE 'E2E %'");
  const u = await client.execute("DELETE FROM units WHERE name LIKE 'E2E Unit%'");
  const a = await client.execute("DELETE FROM assessments WHERE name = ''");
  client.close();
  console.log(
    `cleanup: removed ${s.rowsAffected} semesters, ${u.rowsAffected} units, ` +
      `${a.rowsAffected} untitled strips`,
  );
}
await cleanup();

// --- Captures --------------------------------------------------------------
for (const [name, url] of [
  ['board', `${BASE}/`],
  ['semesters', `${BASE}/semesters`],
  ['semester-detail', `${BASE}/semesters/1`],
  ['unit', `${BASE}/units/1`],
  ['settings', `${BASE}/settings`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const [name, url] of [
  ['board', `${BASE}/`],
  ['semesters', `${BASE}/semesters`],
  ['semester-detail', `${BASE}/semesters/1`],
  ['unit', `${BASE}/units/1`],
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

// A second sweep, in case a check between cleanup and here added a row.
await cleanup();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
