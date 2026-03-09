-- CreateTable
CREATE TABLE "ForbiddenWeek" (
    "id" TEXT NOT NULL,
    "startOfWeek" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForbiddenWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForbiddenWeek_startOfWeek_key" ON "ForbiddenWeek"("startOfWeek");
