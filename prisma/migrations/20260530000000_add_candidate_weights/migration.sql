-- CreateTable
CREATE TABLE "CandidateWeights" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "professionWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "skillsWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "locationWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "modalityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "salaryWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateWeights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateWeights_candidateId_key" ON "CandidateWeights"("candidateId");

-- AddForeignKey
ALTER TABLE "CandidateWeights" ADD CONSTRAINT "CandidateWeights_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
