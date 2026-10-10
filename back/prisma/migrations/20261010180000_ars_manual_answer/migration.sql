-- CreateTable
CREATE TABLE "ArsManualAnswer" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "numberValue" INTEGER,
    "textValue" TEXT,
    "boolValue" BOOLEAN,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArsManualAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArsManualAnswer_serviceId_idx" ON "ArsManualAnswer"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ArsManualAnswer_serviceId_year_code_key" ON "ArsManualAnswer"("serviceId", "year", "code");

