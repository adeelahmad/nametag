-- AlterTable: add nullable type column
ALTER TABLE "important_dates" ADD COLUMN "type" TEXT;

-- Backfill: match existing titles in all 6 supported languages (case-insensitive, trimmed)
-- Note: Spanish "Memorial" matches via the English entry (same word in both languages)
UPDATE "important_dates" SET "type" = 'birthday', "title" = ''
WHERE TRIM(LOWER("title")) IN ('birthday', 'cumpleaños', 'geburtstag', '誕生日', 'bursdag', '生日');

UPDATE "important_dates" SET "type" = 'anniversary', "title" = ''
WHERE TRIM(LOWER("title")) IN ('anniversary', 'aniversario', 'jahrestag', '記念日', 'jubileum', '周年纪念');

UPDATE "important_dates" SET "type" = 'nameday', "title" = ''
WHERE TRIM(LOWER("title")) IN ('name day', 'día del santo', 'namenstag', '名前の日', 'navnedag', '命名日');

UPDATE "important_dates" SET "type" = 'memorial', "title" = ''
WHERE TRIM(LOWER("title")) IN ('memorial', 'gedenktag', '追悼日', 'minnedag', '追悼纪念日');

-- CreateIndex: partial unique index (only for non-null type on non-deleted records)
CREATE UNIQUE INDEX "important_dates_person_type_unique"
ON "important_dates" ("personId", "type")
WHERE "type" IS NOT NULL AND "deletedAt" IS NULL;
