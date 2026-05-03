-- CreateIndex
CREATE UNIQUE INDEX "Chat_candidateId_companyId_jobId_key" ON "Chat"("candidateId", "companyId", "jobId");
