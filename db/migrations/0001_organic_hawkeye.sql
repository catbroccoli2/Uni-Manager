ALTER TABLE `assessments` ADD `max_mark` real DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `grade_bands` ADD `grade_point` real DEFAULT 0 NOT NULL;--> statement-breakpoint
--
-- Hand-added backfills. The two ALTERs above are generated; everything below is
-- deliberate and must not be regenerated away.
--
-- Before this migration, `mark` held the weighted points earned directly: a
-- 40%-weighted assessment scored 92% was stored as 36.8. After it, `mark` holds
-- raw marks and the contribution is derived as (mark / max_mark) * weighting.
--
-- Accepting the DEFAULT 100 above would therefore rewrite every existing row's
-- result: 36.8 would become (36.8/100)*40 = 14.72 instead of 36.8. Setting
-- max_mark to the weighting makes the new formula collapse to the old value —
-- (mark/weighting)*weighting = mark — so every figure already on screen is
-- preserved exactly. This is only true while every row still uses the old
-- semantics, which is precisely now, at migration time.
--
-- Rows with a zero weighting are left at 100: they contribute nothing either
-- way, and dividing by a zero max_mark would be worse than the default.
UPDATE `assessments` SET `max_mark` = `weighting` WHERE `weighting` > 0;--> statement-breakpoint
--
-- Australian GPA scale for the default bands (PRD.md §7's thresholds). Matched
-- by code so a band the user has renamed or added keeps the 0 default rather
-- than being assigned a point value nobody chose.
UPDATE `grade_bands` SET `grade_point` = CASE `code`
  WHEN 'HD' THEN 4
  WHEN 'D' THEN 3
  WHEN 'C' THEN 2
  WHEN 'P' THEN 1
  WHEN 'N' THEN 0
  ELSE `grade_point`
END;
