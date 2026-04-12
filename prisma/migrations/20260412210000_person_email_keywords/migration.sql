-- AlterTable: Add emailKeywords array field to people for Gmail keyword matching
ALTER TABLE "people" ADD COLUMN "emailKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
