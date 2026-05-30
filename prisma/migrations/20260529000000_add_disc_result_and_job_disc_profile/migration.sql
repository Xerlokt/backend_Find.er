-- AddColumn: discProfile to Job table (DISC-03 optional field)
ALTER TABLE "Job" ADD COLUMN "discProfile" TEXT;

-- CreateTable: DiscResult (DISC-01, DISC-04 upsert support)
CREATE TABLE "DiscResult" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "scoreD" INTEGER NOT NULL,
    "scoreI" INTEGER NOT NULL,
    "scoreS" INTEGER NOT NULL,
    "scoreC" INTEGER NOT NULL,
    "dominant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique candidateId on DiscResult (one DISC result per candidate)
CREATE UNIQUE INDEX "DiscResult_candidateId_key" ON "DiscResult"("candidateId");

-- AddForeignKey: DiscResult.candidateId → CandidateProfile.id (onDelete: Cascade)
ALTER TABLE "DiscResult" ADD CONSTRAINT "DiscResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
