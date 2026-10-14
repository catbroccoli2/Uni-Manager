/**
 * Drives the real app in Chrome and checks what it actually renders.
 *
 * Runs against a THROWAWAY database, seeded fresh, on its own port. An earlier
 * version pointed at the real one and created and deleted rows there to test the
 * Server Actions — which meant a test run mutated real coursework and the
 * assertions drifted the moment any of it was edited. Nothing here touches
 * ~/.unimanager.
 *
 * Usage: node scripts/verify-ui.mjs [outDir]
 */
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3210;
/*
  localhost, not 127.0.0.1. Next 16 treats a numeric-IP origin as cross-origin
  in dev: HMR's WebSocket handshake is refused and hydration never completes, so
  every form on the page silently stops submitting. The failure looks like a
  broken Server Action, not like a hostname problem.
*/
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? '.impeccable/review';

const SCRATCH = path.join(tmpdir(), 'uni-manager-verify', 'verify.db');
rmSync(path.dirname(SCRATCH), { recursive: true, force: true });
mkdirSync(path.dirname(SCRATCH), { recursive: true });
mkdirSync(OUT, { recursive: true });

const env = { ...process.env, UNI_MANAGER_DB_PATH: SCRATCH };

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, shell: true, stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/*
  Next 16 refuses to start a second dev server for the same project directory,
  so a server left running from ordinary development blocks this script. Rather
  than fail with a confusing connection error, say what is in the way and let
  the developer decide: killing someone's running server without asking is not
  this script's call.
*/
for (const port of [3000, PORT]) {
  try {
    const res = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      console.error(
        `\nA dev server is already running on ${port}.\n` +
          'Next will not start a second one for this project, and this script needs its own\n' +
          'so it can point at a throwaway database instead of your real one.\n' +
          'Stop that server and re-run.\n',
      );
      process.exit(2);
    }
  } catch {
    /* nothing listening, which is what we want */
  }
}

console.log('Seeding a throwaway database…');
await run('npx', ['tsx', 'scripts/seed-demo.ts']);

console.log(`Starting a dev server on ${PORT}…`);
const server = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
  env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

/*
  These pipes MUST be drained. An unread stdio pipe fills at around 64KB and
  then blocks the writer — so the dev server would serve a few requests, fill
  its buffer logging them, and hang forever mid-request. The symptom is a
  timeout on an assertion rather than anything that points at logging.
*/
const serverLog = [];
const drain = (buf) => {
  serverLog.push(String(buf));
  if (serverLog.length > 200) serverLog.shift();
};
server.stdout.on('data', drain);
server.stderr.on('data', drain);
const dumpServerLog = () => {
  const text = serverLog.join('');
  const interesting = text
    .split('\n')
    .filter((line) => /error|⨯|failed|warn/i.test(line))
    .slice(-15);
  if (interesting.length > 0) console.log('\n--- dev server ---\n' + interesting.join('\n'));
};
/*
  Killing the spawned pid is not enough on Windows: `shell: true` puts a cmd
  wrapper in front of node, and killing the wrapper leaves the server running
  and holding the port. The orphan then serves stale bundles to the next run,
  which shows up as "Failed to find Server Action" rather than as a dead port —
  a genuinely confusing way to lose an afternoon. taskkill /T takes the tree.
*/
let stopped = false;
const stopServer = () => {
  if (stopped) return;
  stopped = true;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      server.kill('SIGKILL');
    }
  }
};
process.on('exit', stopServer);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopServer();
    process.exit(1);
  });
}
// An assertion that throws must not leave a server behind either.
process.on('uncaughtException', (error) => {
  dumpServerLog();
  stopServer();
  console.error(error);
  process.exit(1);
});

// Poll the port rather than trusting the startup banner: Next prints "Ready"
// before it will actually answer, and on a cold Turbopack build the first
// request compiles the route, which can take a while.
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    up = res.ok;
  } catch {
    /* not listening yet */
  }
  if (!up) await new Promise((r) => setTimeout(r, 1000));
}
if (!up) {
  stopServer();
  throw new Error(`dev server never answered on ${BASE}`);
}
console.log('Dev server is up.');

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

// --- Server Actions: semesters and units ----------------------------------
await page.goto(`${BASE}/semesters`, { waitUntil: 'networkidle' });
const before = await page.locator('ul li').count();

const stamp = `E2E ${Date.now()}`;
await page.fill('input[name="name"]', stamp);
await page.fill('input[name="year"]', '2027');
await page.selectOption('select[name="status"]', 'upcoming');
await page.click('button[type="submit"]');
await page.waitForFunction((n) => document.querySelectorAll('ul li').length > n, before, {
  timeout: 10000,
});
check('createSemester action persists a new semester', (await page.getByText(stamp).count()) > 0);

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

await page.goto(`${BASE}/semesters/1`, { waitUntil: 'networkidle' });
const unitsBefore = await page.locator('ul li').count();
const unitName = `E2E Unit ${Date.now()}`;
await page.fill('input[name="name"]', unitName);
await page.fill('input[name="code"]', 'E2E1000');
await page.click('button[type="submit"]');
await page.waitForFunction((n) => document.querySelectorAll('ul li').length > n, unitsBefore, {
  timeout: 10000,
});
check('createUnit action persists a new unit', (await page.getByText(unitName).count()) > 0);

await page.goto(`${BASE}/semesters/1`, { waitUntil: 'networkidle' });
check('new unit survives a fresh load', (await page.getByText(unitName).count()) > 0);

// --- The rack: inline editing ---------------------------------------------
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
// Scoped to the assessments bay: the unit page now also renders class-time
// strips, so a bare `li.strip` counts both.
const rack = () => page.locator('section', { hasText: 'Assessments' }).last().locator('li.strip');
check('rack renders a strip per assessment', (await rack().count()) === 4);

const firstStrip = () => rack().first();

const newName = `Renamed ${Date.now()}`;
const nameCell = firstStrip().getByLabel('Assessment name');
await nameCell.fill(newName);
await nameCell.blur();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check(
  'name edit commits on blur and persists',
  (await firstStrip().getByLabel('Assessment name').inputValue()) === newName,
);

const escCell = firstStrip().getByLabel('Assessment name');
await escCell.fill('THROWAWAY');
await escCell.press('Escape');
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'networkidle' });
check(
  'Escape reverts without saving',
  (await firstStrip().getByLabel('Assessment name').inputValue()) === newName,
);

// --- The marks model -------------------------------------------------------
// Seeded: Assessment 1 is 17 out of 20, weighted 10% => 8.5 points.
check(
  'mark and "out of" both render',
  (await firstStrip().getByLabel('Mark earned').inputValue()) === '17' &&
    (await firstStrip().getByLabel('Mark is out of').inputValue()) === '20',
);
check(
  'raw % derives from mark / out-of',
  ((await firstStrip().textContent()) ?? '').includes('85%'),
  '17/20 is 85%',
);

// Change it to 18 out of 25 on the 40% assessment: (18/25)*40 = 28.8
const second = rack().nth(1);
await second.getByLabel('Mark earned').fill('18');
await second.getByLabel('Mark earned').blur();
await page.waitForTimeout(500);
await second.getByLabel('Mark is out of').fill('25');
await second.getByLabel('Mark is out of').blur();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
const gauge = () => page.locator('section', { hasText: 'Where this unit stands' }).first();
const afterEdit = (await gauge().textContent()) ?? '';
// 8.5 + 28.8 = 37.3 banked over 50 graded => 74.6%
check('weighted contribution uses mark / out-of', afterEdit.includes('74.6'), '(18/25)*40 = 28.8');

// Put it back so the remaining checks read the seeded figures.
await second.getByLabel('Mark earned').fill('23');
await second.getByLabel('Mark earned').blur();
await page.waitForTimeout(400);
await second.getByLabel('Mark is out of').fill('25');
await second.getByLabel('Mark is out of').blur();
await page.waitForTimeout(900);

// A blank "out of" must fall back to 100, never score the row zero.
await second.getByLabel('Mark is out of').fill('');
await second.getByLabel('Mark is out of').blur();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check(
  'a cleared "out of" falls back to 100 rather than zeroing the row',
  (await rack().nth(1).getByLabel('Mark is out of').inputValue()) === '100',
);
await rack().nth(1).getByLabel('Mark is out of').fill('25');
await rack().nth(1).getByLabel('Mark is out of').blur();
await page.waitForTimeout(900);

// --- The weighting cap -----------------------------------------------------
// Seeded weightings are 10 + 40 + 20 + 30 = 100. For the second row, the OTHER
// rows already take 10 + 20 + 30 = 60, so its allowance is 40.
await page.reload({ waitUntil: 'networkidle' });
const weightCell = rack().nth(1).getByLabel(/^Weighting/);
await weightCell.fill('95');
await weightCell.blur();
await page.waitForTimeout(900);
const cappedText = (await page.locator('body').textContent()) ?? '';
check(
  'typing over the allowance is capped, and says so',
  cappedText.includes('Capped at 40%'),
  cappedText.match(/Capped[^.]*\./)?.[0],
);
await page.reload({ waitUntil: 'networkidle' });
const cappedValue = await rack().nth(1).getByLabel(/^Weighting/).inputValue();
check('the capped weighting saved as the allowance, not the typed value', cappedValue === '40', cappedValue);
check(
  'total weighting never exceeds 100',
  ((await page.locator('body').textContent()) ?? '').includes('Weight 100/100'),
);
await rack().nth(1).getByLabel(/^Weighting/).fill('40');
await rack().nth(1).getByLabel(/^Weighting/).blur();
await page.waitForTimeout(900);

// --- Achieved grade, beside the target ------------------------------------
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
const standing = (await gauge().textContent()) ?? '';
check('gauge shows the grade actually achieved', standing.includes('90.6'), '45.3 of 50 graded');
check('achieved grade is banded HD, not the target band', /90\.6\s*%?\s*HD/.test(standing.replace(/\s+/g, ' ')), standing.replace(/\s+/g,' ').slice(0, 120));
check('achieved grade is labelled as on marked work', standing.includes('work marked so far'));

// The §7 target system still works alongside it.
await page.getByRole('button', { name: 'D', exact: true }).click();
await page.waitForTimeout(250);
check(
  'target still computes the needed average',
  ((await gauge().textContent()) ?? '').includes('49.4'),
  '70 - 45.3 = 24.7 over 50 remaining',
);
await page.getByLabel('Target percentage').last().fill('96');
await page.waitForTimeout(300);
check(
  'unreachable target still flagged',
  ((await gauge().textContent()) ?? '').includes('Out of reach'),
);

// A fully graded unit: achieved is final, and the target band never mislabels it.
await page.goto(`${BASE}/units/3`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'C', exact: true }).click();
await page.waitForTimeout(250);
const settled = (await gauge().textContent()) ?? '';
check('settled unit shows its final grade', settled.includes('75'));
check('settled unit is banded D while the target is C', /75\s*%?\s*D/.test(settled.replace(/\s+/g, ' ')), settled.replace(/\s+/g,' ').slice(0, 120));
check('settled unit says the grade is final', settled.includes('Final grade'));
check('no Infinity or NaN when nothing remains', !/Infinity|NaN/.test(settled));

// --- GPA -------------------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const board = (await page.locator('body').textContent()) ?? '';
check('board shows a confirmed GPA', board.includes('Confirmed GPA'));
check('board shows a projected GPA', board.includes('Projected GPA'));
// Only Ethics is settled: D = 3.00 from 1 unit.
check('confirmed GPA counts only settled units', board.includes('3.00'), 'Ethics D = 3');
// HD(4) + HD(4) + D(3) over three units = 3.67.
check('projected GPA includes in-progress units', board.includes('3.67'), '(4+4+3)/3');

// --- Grade bands and the GPA scale ----------------------------------------
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
check(
  'grade points are editable',
  (await page.getByLabel('High Distinction grade point').inputValue()) === '4',
);
await page.getByLabel('High Distinction threshold').fill('85');
await page.getByRole('button', { name: 'Save bands' }).click();
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check(
  'grade band threshold persists',
  (await page.getByLabel('High Distinction threshold').inputValue()) === '85',
);
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
check('board shows near-term items', boardText.includes('Mid-semester Test'));
const wide = boardText.includes('Final Examination');
await page.goto(`${BASE}/?days=7`, { waitUntil: 'networkidle' });
const narrowText = (await page.locator('body').textContent()) ?? '';
check(
  'window filter changes what is listed',
  !wide && narrowText.includes('Assessment 3: Presentation'),
);

// --- Export ----------------------------------------------------------------
{
  const res = await page.request.get(`${BASE}/api/export`);
  check('export responds 200', res.status() === 200, String(res.status()));
  check(
    'export is served as a dated download',
    /attachment; filename="uni-manager-\d{4}-\d{2}-\d{2}\.json"/.test(
      res.headers()['content-disposition'] ?? '',
    ),
  );
  const data = JSON.parse(await res.text());
  check('export carries a schema version', data.schemaVersion === 1);
  check(
    'export includes every table',
    ['semesters', 'units', 'assessments', 'contentSources', 'timetableEntries', 'gradeBands'].every(
      (k) => Array.isArray(data[k]),
    ),
  );
  const graded = data.assessments.find((a) => a.completed === true && a.mark !== null);
  check(
    'export preserves types and the new maxMark',
    typeof graded?.completed === 'boolean' &&
      typeof graded?.mark === 'number' &&
      typeof graded?.maxMark === 'number' &&
      /^\d{4}-\d{2}-\d{2}$/.test(graded?.dueDate ?? ''),
    JSON.stringify({ mark: graded?.mark, maxMark: graded?.maxMark }),
  );
  check('export carries the GPA scale', data.gradeBands.every((b) => typeof b.gradePoint === 'number'));
}

// --- Outline import (PRD §9, offline variant) ------------------------------
const OUTLINE = `Unit Outline
MKTG3120 Digital Marketing Strategy
12 credit points

Classes
Monday 10:00 - 12:00 Lecture Building 3 Room 14
Wednesday 2pm-3pm Tutorial Room B12

Assessment Task                 Weighting   Due Date
Assessment 1: Online Quiz       15%         16/03/2026
Assessment 2: Campaign Report   35%         14/04/2026
Assessment 3: Group Pitch       20%         12/05/2026
Final Examination               30%         19/06/2026

Consultation is by appointment with the unit coordinator.`;

await page.goto(`${BASE}/semesters/1/import`, { waitUntil: 'networkidle' });

// PDF.js runs in the browser: a chosen file must fill the textarea without any
// upload. Uses a real PDF from disk when one is present, since a synthetic one
// would not exercise the text-layer extraction that matters.
// Forward slashes: Windows accepts them, and they survive being a JS string
// literal, where `\U` and `\D` would silently become `U` and `D`.
const SAMPLE_PDF = 'C:/Users/catbr/Downloads/MarkingRubricSummary.pdf';
if (existsSync(SAMPLE_PDF)) {
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await page.waitForFunction(
    () => {
      const area = document.querySelector('textarea');
      return (area?.value.length ?? 0) > 100;
    },
    undefined,
    { timeout: 30000 },
  );
  const extracted = await page.locator('textarea').inputValue();
  check(
    'a PDF is read in the browser, with no upload',
    extracted.length > 100,
    `${extracted.length} characters extracted`,
  );
  check(
    'the PDF read reports how many pages it got',
    ((await page.locator('body').textContent()) ?? '').includes('Read '),
  );
} else {
  console.log('SKIP  PDF extraction (no sample PDF on this machine)');
}

await page.getByLabel('Outline text').fill(OUTLINE);
await page.getByRole('button', { name: 'Read the outline' }).click();
await page.waitForTimeout(600);

const review = (await page.locator('body').textContent()) ?? '';
// The unit fields are inputs, and input values are not in textContent.
check(
  'import reads the unit code and name',
  (await page.getByLabel('Code').inputValue()) === 'MKTG3120' &&
    (await page.getByLabel('Unit name').inputValue()).includes('Digital Marketing'),
);
check('import reads the assessments', review.includes('Assessment 2: Campaign Report'));
check('import reads the class times', review.includes('Class times') && review.includes('10:00'));
check(
  'import lists lines it could not place',
  review.includes('Not placed') && review.includes('Consultation'),
);
// Every row must show the line it was read from, so the user can check the
// parser's working rather than trust a clean-looking answer.
check(
  'import shows each row the source line it came from',
  review.includes('Assessment 1: Online Quiz 15% 16/03/2026') &&
    review.includes('Monday 10:00 - 12:00 Lecture Building 3 Room 14'),
);
check(
  'table headers are not reported as unplaced content',
  !review.includes('Assessment Task Weighting Due Date'),
);

// The review screen is the one that matters, so capture it while it is up.
await page.screenshot({ path: `${OUT}/import-review-desktop.png`, fullPage: true });

// Drop one assessment; it must not be created.
await page.getByRole('checkbox', { name: 'Import Assessment 3: Group Pitch' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.waitForURL(/\/units\/\d+$/, { timeout: 15000 });

const imported = (await page.locator('body').textContent()) ?? '';
check('import lands on the new unit', imported.includes('Digital Marketing Strategy'));

// Assessment names live in inputs on the rack, so read their values.
const importedNames = await page.locator('li.strip').getByLabel('Assessment name').all();
const names = await Promise.all(importedNames.map((cell) => cell.inputValue()));
check(
  'imported assessments are on the rack',
  names.includes('Assessment 2: Campaign Report'),
  names.join(' | '),
);
check(
  'the unticked assessment was not created',
  !names.includes('Assessment 3: Group Pitch') && names.length === 3,
  `${names.length} strips`,
);
check('imported class times are visible on the unit', imported.includes('Class times'));
check(
  'imported weightings are correct',
  (await page.locator('li.strip').nth(1).getByLabel(/^Weighting/).inputValue()) === '35',
);
check(
  'imported assessments default to out-of-100 and ungraded',
  (await rack().first().getByLabel('Mark is out of').inputValue()) === '100' &&
    (await rack().first().getByLabel('Mark earned').inputValue()) === '',
);

// Re-importing the same outline must offer to merge rather than duplicate.
await page.goto(`${BASE}/semesters/1/import`, { waitUntil: 'networkidle' });
await page.getByLabel('Outline text').fill(OUTLINE);
await page.getByRole('button', { name: 'Read the outline' }).click();
await page.waitForTimeout(600);
const targetValue = await page.getByLabel('Import into').inputValue();
check(
  'a matching unit code defaults to merging, not duplicating',
  targetValue !== 'new',
  `target=${targetValue}`,
);

// Prose with no table must produce nothing rather than an invented assessment.
await page.goto(`${BASE}/semesters/1/import`, { waitUntil: 'networkidle' });
await page.getByLabel('Outline text').fill(
  'Welcome to the unit. Students must achieve 50% overall to pass. ' +
    'Attendance of 80% at scheduled classes is expected throughout the semester.',
);
await page.getByRole('button', { name: 'Read the outline' }).click();
await page.waitForTimeout(600);
const prose = (await page.locator('body').textContent()) ?? '';
check('unparseable prose invents nothing', prose.includes('Nothing recognisable'));
check(
  'the import button is disabled when nothing was found',
  await page.getByRole('button', { name: 'Import', exact: true }).isDisabled(),
);

// --- Timetable (PRD §8) ----------------------------------------------------
await page.goto(`${BASE}/timetable`, { waitUntil: 'networkidle' });
const week = (await page.locator('body').textContent()) ?? '';
check('timetable renders the seeded classes', week.includes('BUSM2301') && week.includes('STAT1020'));
check('timetable shows class types', week.includes('lecture') && week.includes('tutorial'));
check('timetable shows locations', week.includes('Computer Lab 4'));

// Deadlines share the grid, which is why the week has to be a real one.
const dueBand = await page.locator('span', { hasText: /^due$/ }).count();
check('deadlines ride in their own band above the clock', dueBand > 0);

// Week navigation must actually move, and "This week" must come back.
const thisWeekLabel = await page.locator('nav[aria-label="Week"]').textContent();
await page.getByRole('link', { name: 'Next week' }).click();
await page.waitForURL(/week=/, { timeout: 10000 });
const nextLabel = await page.locator('nav[aria-label="Week"]').textContent();
check('next week changes the displayed range', nextLabel !== thisWeekLabel, `${thisWeekLabel?.trim()} -> ${nextLabel?.trim()}`);
check('a moved week is held in the URL', page.url().includes('week='));
await page.getByRole('link', { name: 'This week' }).click();
await page.waitForURL((url) => !url.search.includes('week='), { timeout: 10000 });
check(
  'This week returns to the current range',
  (await page.locator('nav[aria-label="Week"]').textContent()) === thisWeekLabel,
);

// Classes are edited on the unit page, and the grid must reflect an edit.
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
check(
  'the unit page lists its class times as editable rows',
  (await page.getByLabel('Location').count()) >= 2,
);
const location = page.getByLabel('Location').first();
await location.fill('Moved Room 99');
await page.waitForTimeout(900);
await page.goto(`${BASE}/timetable`, { waitUntil: 'networkidle' });
check(
  'editing a class on the unit page reaches the week grid',
  ((await page.locator('body').textContent()) ?? '').includes('Moved Room 99'),
);

// Adding and removing a class round-trips.
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
const classesBefore = await page.getByLabel('Location').count();
await page.getByRole('button', { name: 'Add a class' }).first().click();
await page.waitForFunction(
  (n) => document.querySelectorAll('input[aria-label="Location"]').length > n,
  classesBefore,
  { timeout: 10000 },
);
check('a class can be added', true);
await page.getByRole('button', { name: /^Remove the/ }).last().click();
await page.waitForFunction(
  (n) => document.querySelectorAll('input[aria-label="Location"]').length === n,
  classesBefore,
  { timeout: 10000 },
);
check('a class can be removed', true);

// The board carries today only, not the whole week.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const boardToday = (await page.locator('body').textContent()) ?? '';
const hasTodayClasses = boardToday.includes('Whole week');
check(
  'the board links to the week when today has classes',
  hasTodayClasses || !boardToday.includes('Today'),
  hasTodayClasses ? 'today strip present' : 'no classes today, strip correctly hidden',
);

// --- Accessibility ---------------------------------------------------------
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const parseRgb = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);

for (const [label, url] of [
  ['board', `${BASE}/`],
  ['unit', `${BASE}/units/1`],
  ['settings', `${BASE}/settings`],
  ['semester', `${BASE}/semesters/1`],
  ['import', `${BASE}/semesters/1/import`],
  ['timetable', `${BASE}/timetable`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' });

  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((el) => {
        if (el.type === 'hidden') return false;
        const name =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.labels?.length ? [...el.labels].map((l) => l.textContent).join('') : '') ||
          el.textContent ||
          '';
        return name.trim() === '';
      })
      .map((el) => el.tagName.toLowerCase()),
  );
  check(`${label}: every control has an accessible name`, unnamed.length === 0, unnamed.join(', '));

  const measured = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent?.trim())
        .join('');
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
      let bg = 'rgba(0, 0, 0, 0)';
      let node = el;
      while (node && bg === 'rgba(0, 0, 0, 0)') {
        bg = getComputedStyle(node).backgroundColor;
        if (bg === 'rgba(0, 0, 0, 0)') node = node.parentElement;
      }
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      out.push({
        text: text.slice(0, 30),
        fg: cs.color,
        bg,
        large: size >= 24 || (bold && size >= 18.66),
      });
    }
    return out;
  });

  const failures = measured
    .map((item) => ({
      ...item,
      ratio: contrast(parseRgb(item.fg), parseRgb(item.bg)),
      min: item.large ? 3 : 4.5,
    }))
    .filter((item) => item.ratio < item.min);

  check(
    `${label}: text meets WCAG AA contrast`,
    failures.length === 0,
    failures
      .slice(0, 3)
      .map((f) => `"${f.text}" ${f.ratio.toFixed(2)}:1 (needs ${f.min})`)
      .join(' | '),
  );
}

// Keyboard operability across a strip.
await page.goto(`${BASE}/units/1`, { waitUntil: 'networkidle' });
await page.getByLabel('Assessment name').first().focus();
const reachable = [];
for (let i = 0; i < 10; i++) {
  await page.keyboard.press('Tab');
  reachable.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute('aria-label') || el?.tagName.toLowerCase() || '';
    }),
  );
}
check(
  'tab walks every field of a strip, including the new "out of"',
  ['Assessment type', 'Mark earned', 'Mark is out of'].every((f) => reachable.includes(f)),
  reachable.join(' → '),
);

const ring = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { width: cs.outlineWidth, style: cs.outlineStyle };
});
check(
  'keyboard focus is visible',
  ring !== null && ring.style !== 'none' && parseFloat(ring.width) > 0,
  JSON.stringify(ring),
);

// --- Captures --------------------------------------------------------------
for (const [name, url] of [
  ['board', `${BASE}/`],
  ['semesters', `${BASE}/semesters`],
  ['semester-detail', `${BASE}/semesters/1`],
  ['unit', `${BASE}/units/1`],
  ['settings', `${BASE}/settings`],
  ['import', `${BASE}/semesters/1/import`],
  ['timetable', `${BASE}/timetable`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const [name, url] of [
  ['board', `${BASE}/`],
  ['semester-detail', `${BASE}/semesters/1`],
  ['unit', `${BASE}/units/1`],
  ['timetable', `${BASE}/timetable`],
]) {
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
}

const overflowReport = await mobile.evaluate(() => {
  const limit = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth - limit;
  const culprits = [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > limit + 1)
    .slice(0, 3)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
  return { overflow, culprits };
});
check(
  'no horizontal overflow at 390px',
  overflowReport.overflow <= 0,
  `overflow ${overflowReport.overflow}px — ${overflowReport.culprits.join(', ')}`,
);

await browser.close();
stopServer();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
