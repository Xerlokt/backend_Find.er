-- AlterTable
ALTER TABLE "Company" ADD COLUMN "cnpj" TEXT,
ADD COLUMN "legalName" TEXT,
ADD COLUMN "tradeName" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");
