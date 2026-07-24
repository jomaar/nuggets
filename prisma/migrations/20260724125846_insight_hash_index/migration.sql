-- DropIndex
DROP INDEX "insights_kind_inputHash_key";

-- CreateIndex
CREATE INDEX "insights_kind_inputHash_idx" ON "insights"("kind", "inputHash");
