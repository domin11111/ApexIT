-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('CPU', 'MEMORY', 'GPU', 'MOTHERBOARD');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'COMING_SOON', 'PREVIEW');

-- CreateEnum
CREATE TYPE "CompareDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER', 'NONE');

-- CreateEnum
CREATE TYPE "CompatibilityLevel" AS ENUM ('SUPPORTED', 'VALIDATING');

-- CreateEnum
CREATE TYPE "ModelPreset" AS ENUM ('CPU_SP5', 'CPU_SP7', 'RDIMM', 'GPU_DUAL_SLOT', 'MOTHERBOARD');

-- CreateEnum
CREATE TYPE "HotspotVisibility" AS ENUM ('ALWAYS', 'ASSEMBLED', 'EXPLODED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('GLB', 'IMAGE', 'VIDEO', 'HDRI');

-- CreateEnum
CREATE TYPE "AssetVariant" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('QUOTE', 'INFO');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "codename" TEXT,
    "headline" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL,
    "availabilityWindow" TEXT,
    "availabilityNote" TEXT,
    "accentColor" TEXT NOT NULL,
    "accentColorAlt" TEXT,
    "modelPreset" "ModelPreset" NOT NULL,
    "modelAssetId" UUID,
    "heroImageId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "i18n" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecGroup" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "i18n" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SpecGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spec" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "unit" TEXT,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "compareDirection" "CompareDirection" NOT NULL DEFAULT 'NONE',
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "i18n" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotspot" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "anchorNode" TEXT,
    "position" JSONB NOT NULL,
    "cameraPosition" JSONB NOT NULL,
    "cameraTarget" JSONB,
    "visibility" "HotspotVisibility" NOT NULL DEFAULT 'ALWAYS',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "i18n" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Hotspot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "variant" "AssetVariant" NOT NULL DEFAULT 'DESKTOP',
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cdnUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "sourceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Platform" (
    "id" UUID NOT NULL,
    "socket" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpuFamily" TEXT NOT NULL,
    "memoryChannels" INTEGER NOT NULL,
    "dimmsPerChannel" INTEGER,
    "maxMemorySpeedMts" INTEGER NOT NULL,
    "maxMrdimmSpeedMts" INTEGER,
    "pcieGen" INTEGER NOT NULL,
    "pcieLanes1P" INTEGER NOT NULL,
    "pcieLanes2P" INTEGER,
    "cxlVersion" TEXT,
    "maxSockets" INTEGER NOT NULL,
    "maxCpuTdpW" INTEGER NOT NULL,
    "status" "ProductStatus" NOT NULL,
    "availabilityWindow" TEXT,
    "availabilityNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "i18n" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compatibility" (
    "productId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "level" "CompatibilityLevel" NOT NULL DEFAULT 'SUPPORTED',
    "notes" TEXT,
    "i18n" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Compatibility_pkey" PRIMARY KEY ("productId","platformId")
);

-- CreateTable
CREATE TABLE "Motherboard" (
    "id" UUID NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "platformId" UUID NOT NULL,
    "formFactor" TEXT NOT NULL,
    "sockets" INTEGER NOT NULL,
    "dimmSlots" INTEGER NOT NULL,
    "maxMemoryGb" INTEGER,
    "maxCpuTdpW" INTEGER,
    "pcieX16Slots" INTEGER,
    "mcioX8Ports" INTEGER,
    "features" TEXT[],
    "status" "ProductStatus" NOT NULL,
    "availabilityWindow" TEXT,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "i18n" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motherboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" UUID NOT NULL,
    "shareCode" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "intent" "LeadIntent" NOT NULL,
    "productSlug" TEXT,
    "configurationId" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadComment" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaPassed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_category_status_idx" ON "Product"("category", "status");

-- CreateIndex
CREATE INDEX "Product_publishedAt_sortOrder_idx" ON "Product"("publishedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "SpecGroup_productId_order_idx" ON "SpecGroup"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SpecGroup_productId_key_key" ON "SpecGroup"("productId", "key");

-- CreateIndex
CREATE INDEX "Spec_groupId_order_idx" ON "Spec"("groupId", "order");

-- CreateIndex
CREATE INDEX "Spec_key_idx" ON "Spec"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Spec_productId_key_key" ON "Spec"("productId", "key");

-- CreateIndex
CREATE INDEX "Hotspot_productId_order_idx" ON "Hotspot"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Hotspot_productId_key_key" ON "Hotspot"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_type_status_idx" ON "Asset"("type", "status");

-- CreateIndex
CREATE INDEX "Asset_sourceId_idx" ON "Asset"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_socket_key" ON "Platform"("socket");

-- CreateIndex
CREATE INDEX "Compatibility_platformId_idx" ON "Compatibility"("platformId");

-- CreateIndex
CREATE INDEX "Motherboard_platformId_sortOrder_idx" ON "Motherboard"("platformId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Motherboard_vendor_model_key" ON "Motherboard"("vendor", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_shareCode_key" ON "Configuration"("shareCode");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "LeadComment_leadId_createdAt_idx" ON "LeadComment"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_modelAssetId_fkey" FOREIGN KEY ("modelAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecGroup" ADD CONSTRAINT "SpecGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spec" ADD CONSTRAINT "Spec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spec" ADD CONSTRAINT "Spec_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SpecGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compatibility" ADD CONSTRAINT "Compatibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compatibility" ADD CONSTRAINT "Compatibility_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motherboard" ADD CONSTRAINT "Motherboard_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComment" ADD CONSTRAINT "LeadComment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComment" ADD CONSTRAINT "LeadComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
