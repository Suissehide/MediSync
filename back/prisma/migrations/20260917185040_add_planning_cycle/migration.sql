-- CreateTable
CREATE TABLE "PlanningCycle" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "startOfWeek" DATE NOT NULL,
    "weekCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningCycle_pkey" PRIMARY KEY ("id")
);
