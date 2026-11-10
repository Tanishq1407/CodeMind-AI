-- Add precise source ranges and optional corrected examples without altering
-- any saved analysis or finding data.
ALTER TABLE "AnalysisFinding"
  ADD COLUMN "lineEnd" INTEGER,
  ADD COLUMN "suggestedCode" TEXT;
