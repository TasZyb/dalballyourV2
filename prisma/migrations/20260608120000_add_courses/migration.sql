-- CreateEnum
CREATE TYPE "CourseAccessSource" AS ENUM ('PURCHASE', 'ADMIN_GRANT', 'PROMO');

-- CreateEnum
CREATE TYPE "CourseOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "coverUrl" TEXT,
    "level" TEXT,
    "duration" TEXT,
    "lessonsCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "orderId" TEXT,
    "source" "CourseAccessSource" NOT NULL DEFAULT 'PURCHASE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CourseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "CourseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "paymentProvider" TEXT,
    "providerCheckoutSessionId" TEXT,
    "providerPaymentIntentId" TEXT,
    "providerRawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "CourseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_isPublished_idx" ON "Course"("isPublished");

-- CreateIndex
CREATE INDEX "Course_priceCents_idx" ON "Course"("priceCents");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_userId_courseId_key" ON "CourseAccess"("userId", "courseId");

-- CreateIndex
CREATE INDEX "CourseAccess_courseId_idx" ON "CourseAccess"("courseId");

-- CreateIndex
CREATE INDEX "CourseAccess_orderId_idx" ON "CourseAccess"("orderId");

-- CreateIndex
CREATE INDEX "CourseAccess_userId_revokedAt_idx" ON "CourseAccess"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "CourseOrder_userId_status_idx" ON "CourseOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "CourseOrder_courseId_idx" ON "CourseOrder"("courseId");

-- CreateIndex
CREATE INDEX "CourseOrder_providerCheckoutSessionId_idx" ON "CourseOrder"("providerCheckoutSessionId");

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CourseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOrder" ADD CONSTRAINT "CourseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOrder" ADD CONSTRAINT "CourseOrder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
