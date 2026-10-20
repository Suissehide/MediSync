-- CreateTable
CREATE TABLE "TaskSoignant" (
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "soignantId" TEXT NOT NULL,

    CONSTRAINT "TaskSoignant_pkey" PRIMARY KEY ("taskId","soignantId")
);

-- CreateIndex
CREATE INDEX "TaskSoignant_serviceId_idx" ON "TaskSoignant"("serviceId");

-- CreateIndex
CREATE INDEX "TaskSoignant_soignantId_idx" ON "TaskSoignant"("soignantId");

-- AddForeignKey
ALTER TABLE "TaskSoignant" ADD CONSTRAINT "TaskSoignant_taskId_serviceId_fkey" FOREIGN KEY ("taskId", "serviceId") REFERENCES "Task"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSoignant" ADD CONSTRAINT "TaskSoignant_soignantId_serviceId_fkey" FOREIGN KEY ("soignantId", "serviceId") REFERENCES "Soignant"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;
