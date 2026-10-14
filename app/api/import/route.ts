import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db, ensureDatabaseReady } from '@/lib/db';
import {
  assessments,
  contentSources,
  gradeBands,
  semesters,
  timetableEntries,
  units,
} from '@/db/schema';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

const CHUNK = 50; // keeps each INSERT well under SQLite's variable limit
const SUPPORTED_VERSION = 1;

const TABLE_KEYS = [
  'gradeBands',
  'semesters',
  'units',
  'assessments',
  'timetableEntries',
  'contentSources',
] as const;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Export turned Date columns into ISO strings; turn them back. */
function revive(row: Row): Row {
  const out: Row = { ...row };
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof out[key] === 'string') out[key] = new Date(out[key] as string);
  }
  return out;
}

async function insertAll(table: SQLiteTable, rows: Row[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table).values(rows.slice(i, i + CHUNK).map(revive) as never);
  }
}

function idSet(rows: Row[]): Set<unknown> {
  return new Set(rows.map((r) => r.id));
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('That file is not valid JSON.');
  }

  if (body.schemaVersion !== SUPPORTED_VERSION) {
    return fail(`Unsupported export version: ${String(body.schemaVersion)}.`);
  }

  // Validate everything before touching the database.
  const data = {} as Record<(typeof TABLE_KEYS)[number], Row[]>;
  for (const key of TABLE_KEYS) {
    const value = body[key];
    if (
      !Array.isArray(value) ||
      !value.every((r) => typeof r === 'object' && r !== null && typeof (r as Row).id === 'number')
    ) {
      return fail(`The file is missing a valid "${key}" list.`);
    }
    data[key] = value as Row[];
  }

  const semesterIds = idSet(data.semesters);
  const unitIds = idSet(data.units);
  if (data.units.some((u) => !semesterIds.has(u.semesterId))) {
    return fail('A unit points at a semester that is not in the file.');
  }
  for (const key of ['assessments', 'timetableEntries', 'contentSources'] as const) {
    if (data[key].some((r) => !unitIds.has(r.unitId))) {
      return fail(`An entry in "${key}" points at a unit that is not in the file.`);
    }
  }

  await ensureDatabaseReady();

  try {
    // Children first, so foreign keys never object.
    await db.delete(assessments);
    await db.delete(timetableEntries);
    await db.delete(contentSources);
    await db.delete(units);
    await db.delete(semesters);
    await db.delete(gradeBands);

    // Parents first.
    await insertAll(gradeBands, data.gradeBands);
    await insertAll(semesters, data.semesters);
    await insertAll(units, data.units);
    await insertAll(assessments, data.assessments);
    await insertAll(timetableEntries, data.timetableEntries);
    await insertAll(contentSources, data.contentSources);
  } catch (error) {
    console.error('Import failed', error);
    return fail('The import failed partway. Re-run it with the same file.', 500);
  }

  revalidatePath('/', 'layout');

  return NextResponse.json({
    ok: true,
    counts: Object.fromEntries(TABLE_KEYS.map((k) => [k, data[k].length])),
  });
}