-- CreateTable
CREATE TABLE "Thematic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Thematic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SoignantThematics" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SoignantThematics_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Thematic_name_key" ON "Thematic"("name");

-- CreateIndex
CREATE INDEX "_SoignantThematics_B_index" ON "_SoignantThematics"("B");

-- AddForeignKey
ALTER TABLE "_SoignantThematics" ADD CONSTRAINT "_SoignantThematics_A_fkey" FOREIGN KEY ("A") REFERENCES "Soignant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SoignantThematics" ADD CONSTRAINT "_SoignantThematics_B_fkey" FOREIGN KEY ("B") REFERENCES "Thematic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
