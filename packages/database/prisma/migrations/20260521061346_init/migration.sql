-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('COMMUNITY', 'STARTER', 'AGENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FunnelStatus" AS ENUM ('ACTIVE', 'TRASHED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('OPTIN', 'SALES', 'CHECKOUT', 'UPSELL', 'DOWNSELL', 'THANKYOU', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('COURSE', 'COURSE_BUNDLE', 'TAG', 'COMMUNITY', 'CALENDAR_EVENT');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'TRIAL', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('SALE', 'REFUND', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('COMPLETED', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PAGE_VIEW', 'FORM_SUBMIT', 'PURCHASE', 'TAG_ADDED', 'TAG_REMOVED', 'EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'EMAIL_BOUNCED', 'EMAIL_UNSUBSCRIBED', 'SEQUENCE_ENROLLED', 'SEQUENCE_COMPLETED', 'SEQUENCE_EXITED');

-- CreateEnum
CREATE TYPE "EmailTemplateCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BroadcastTarget" AS ENUM ('ALL_CONTACTS', 'TAG', 'SEGMENT');

-- CreateEnum
CREATE TYPE "EmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('NEW_SALE', 'SALE_CANCELED', 'SUBSCRIPTION_PAYMENT_FAILED', 'FORM_SUBMIT', 'TAG_ADDED', 'TAG_REMOVED', 'EMAIL_LINK_CLICKED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SEND_EMAIL', 'ADD_TAG', 'REMOVE_TAG', 'WEBHOOK', 'START_SEQUENCE', 'END_SEQUENCE');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'COMMUNITY',
    "licenseKey" TEXT,
    "licenseExpiresAt" TIMESTAMP(3),
    "licenseVerifiedAt" TIMESTAMP(3),
    "instanceId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelDomain" (
    "funnelId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelDomain_pkey" PRIMARY KEY ("funnelId","domainId")
);

-- CreateTable
CREATE TABLE "Funnel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "favicon" TEXT,
    "status" "FunnelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelStep" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "StepType" NOT NULL,
    "order" INTEGER NOT NULL,
    "offerType" "OfferType",
    "physicalProductId" TEXT,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "couponIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageJson" JSONB NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "type" "StepType" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageJson" JSONB NOT NULL DEFAULT '{}',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedBlock" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "weight" DOUBLE PRECISION,
    "limitStock" BOOLEAN NOT NULL DEFAULT false,
    "stockLimit" INTEGER,
    "images" TEXT[],
    "hasOptions" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "variants" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepPricePlan" (
    "id" TEXT NOT NULL,
    "funnelStepId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PriceType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT,
    "trialDays" INTEGER,
    "stripePriceId" TEXT,
    "paypalPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepPricePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBump" (
    "id" TEXT NOT NULL,
    "funnelStepId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "headline" TEXT,
    "offerType" "OfferType",
    "physicalProductId" TEXT,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderBump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBumpPricePlan" (
    "id" TEXT NOT NULL,
    "orderBumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PriceType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT,
    "trialDays" INTEGER,
    "stripePriceId" TEXT,
    "paypalPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderBumpPricePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBumpResource" (
    "id" TEXT NOT NULL,
    "orderBumpId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderBumpResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "streetAddress" TEXT,
    "streetNumber" TEXT,
    "neighborhood" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "company" TEXT,
    "taxNumber" TEXT,
    "language" TEXT DEFAULT 'en',
    "ip" TEXT,
    "customFields" JSONB,
    "providerCustomerIds" JSONB,
    "consentedAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "ContactEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "data" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "funnelStepId" TEXT,
    "stepPricePlanId" TEXT,
    "orderBumpPricePlanId" TEXT,
    "subscriptionId" TEXT,
    "physicalProductId" TEXT,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "couponCode" TEXT,
    "orderItemSnapshot" JSONB,
    "bumpItems" JSONB,
    "status" "OrderStatus" NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT 'stripe',
    "paymentMethod" TEXT,
    "providerOrderId" TEXT,
    "paymentMethodId" TEXT,
    "invoiceId" TEXT,
    "isRenewal" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "refundedByUserId" TEXT,
    "contactSnapshot" JSONB,
    "shippingAddress" JSONB,
    "gatewayData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT,
    "status" "TxStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "funnelStepId" TEXT,
    "stepPricePlanId" TEXT,
    "orderBumpPricePlanId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT 'stripe',
    "providerSubId" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEnd" TIMESTAMP(3),
    "planSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("workspaceId","provider","eventId")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "workspaceId" TEXT NOT NULL,
    "stripe" JSONB,
    "paypal" JSONB,
    "smtp" JSONB,
    "storage" JSONB,
    "ai" JSONB,
    "emailFooter" JSONB,
    "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "toolCallId" TEXT,
    "toolName" TEXT,
    "toolStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelStepResource" (
    "id" TEXT NOT NULL,
    "funnelStepId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelStepResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactResourceAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ContactResourceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "category" "EmailTemplateCategory" NOT NULL DEFAULT 'MARKETING',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "templateId" TEXT,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "targetType" "BroadcastTarget" NOT NULL DEFAULT 'ALL_CONTACTS',
    "targetTagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeUnsubscribed" BOOLEAN NOT NULL DEFAULT true,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "toEmail" TEXT NOT NULL,
    "broadcastId" TEXT,
    "templateId" TEXT,
    "automationId" TEXT,
    "automationRunId" TEXT,
    "automationActionId" TEXT,
    "sequenceId" TEXT,
    "sequenceStepId" TEXT,
    "enrollmentId" TEXT,
    "transactionalKey" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" "EmailSendStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "TriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "timesTriggered" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationAction" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "actionType" "ActionType" NOT NULL,
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "emailTemplateId" TEXT,
    "emailSubject" TEXT,
    "emailHtmlBody" TEXT,
    "emailFromName" TEXT,
    "emailFromEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggerData" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderIdentity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEnrolled" INTEGER NOT NULL DEFAULT 0,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "exitedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "emailTemplateId" TEXT,
    "emailSubject" TEXT NOT NULL,
    "emailHtmlBody" TEXT NOT NULL,
    "emailFromName" TEXT NOT NULL,
    "emailFromEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3) NOT NULL,
    "exitReason" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "enrolledByAutomationId" TEXT,
    "enrolledByRunId" TEXT,

    CONSTRAINT "ContactSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ownerId_key" ON "Organization"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_roleId_idx" ON "WorkspaceMember"("roleId");

-- CreateIndex
CREATE INDEX "Role_workspaceId_idx" ON "Role"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_workspaceId_name_key" ON "Role"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "FunnelDomain_domainId_idx" ON "FunnelDomain"("domainId");

-- CreateIndex
CREATE INDEX "Funnel_workspaceId_status_idx" ON "Funnel"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FunnelStep_funnelId_order_idx" ON "FunnelStep"("funnelId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "FunnelStep_funnelId_slug_key" ON "FunnelStep"("funnelId", "slug");

-- CreateIndex
CREATE INDEX "PageTemplate_workspaceId_type_isDefault_idx" ON "PageTemplate"("workspaceId", "type", "isDefault");

-- CreateIndex
CREATE INDEX "PageTemplate_workspaceId_idx" ON "PageTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "PageTemplate_isActive_idx" ON "PageTemplate"("isActive");

-- CreateIndex
CREATE INDEX "PageTemplate_tags_idx" ON "PageTemplate" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "SavedBlock_workspaceId_kind_idx" ON "SavedBlock"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "SavedBlock_workspaceId_createdAt_idx" ON "SavedBlock"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedBlock_tags_idx" ON "SavedBlock" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "OrderBump_funnelStepId_order_idx" ON "OrderBump"("funnelStepId", "order");

-- CreateIndex
CREATE INDEX "OrderBumpResource_type_resourceId_idx" ON "OrderBumpResource"("type", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderBumpResource_orderBumpId_type_resourceId_key" ON "OrderBumpResource"("orderBumpId", "type", "resourceId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_createdAt_idx" ON "Contact"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_email_key" ON "Contact"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- CreateIndex
CREATE INDEX "ContactEvent_contactId_createdAt_idx" ON "ContactEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactEvent_type_createdAt_idx" ON "ContactEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_idx" ON "Order"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Order_contactId_idx" ON "Order"("contactId");

-- CreateIndex
CREATE INDEX "Order_providerOrderId_idx" ON "Order"("providerOrderId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_status_idx" ON "Subscription"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Subscription_providerSubId_idx" ON "Subscription"("providerSubId");

-- CreateIndex
CREATE INDEX "Subscription_contactId_idx" ON "Subscription"("contactId");

-- CreateIndex
CREATE INDEX "Coupon_workspaceId_idx" ON "Coupon"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_workspaceId_code_key" ON "Coupon"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "AiConversation_workspaceId_userId_idx" ON "AiConversation"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConversation_workspaceId_userId_key" ON "AiConversation"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelStepResource_type_resourceId_idx" ON "FunnelStepResource"("type", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FunnelStepResource_funnelStepId_type_resourceId_key" ON "FunnelStepResource"("funnelStepId", "type", "resourceId");

-- CreateIndex
CREATE INDEX "ContactResourceAccess_orderId_idx" ON "ContactResourceAccess"("orderId");

-- CreateIndex
CREATE INDEX "ContactResourceAccess_contactId_type_idx" ON "ContactResourceAccess"("contactId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ContactResourceAccess_contactId_type_resourceId_orderId_key" ON "ContactResourceAccess"("contactId", "type", "resourceId", "orderId");

-- CreateIndex
CREATE INDEX "EmailTemplate_workspaceId_category_idx" ON "EmailTemplate"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_workspaceId_systemKey_key" ON "EmailTemplate"("workspaceId", "systemKey");

-- CreateIndex
CREATE INDEX "Broadcast_workspaceId_status_idx" ON "Broadcast"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Broadcast_scheduledAt_status_idx" ON "Broadcast"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "EmailSend_workspaceId_status_queuedAt_idx" ON "EmailSend"("workspaceId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailSend_contactId_queuedAt_idx" ON "EmailSend"("contactId", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailSend_broadcastId_idx" ON "EmailSend"("broadcastId");

-- CreateIndex
CREATE INDEX "EmailSend_automationId_idx" ON "EmailSend"("automationId");

-- CreateIndex
CREATE INDEX "EmailSend_sequenceId_idx" ON "EmailSend"("sequenceId");

-- CreateIndex
CREATE INDEX "EmailSend_enrollmentId_idx" ON "EmailSend"("enrollmentId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_status_idx" ON "Automation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Automation_triggerType_status_idx" ON "Automation"("triggerType", "status");

-- CreateIndex
CREATE INDEX "AutomationAction_automationId_order_idx" ON "AutomationAction"("automationId", "order");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_startedAt_idx" ON "AutomationRun"("automationId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_contactId_startedAt_idx" ON "AutomationRun"("contactId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_workspaceId_status_idx" ON "AutomationRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "SenderIdentity_workspaceId_idx" ON "SenderIdentity"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SenderIdentity_workspaceId_email_key" ON "SenderIdentity"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "EmailSequence_workspaceId_status_idx" ON "EmailSequence"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_order_idx" ON "SequenceStep"("sequenceId", "order");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_status_nextSendAt_idx" ON "ContactSequenceEnrollment"("status", "nextSendAt");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_sequenceId_status_idx" ON "ContactSequenceEnrollment"("sequenceId", "status");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_contactId_status_idx" ON "ContactSequenceEnrollment"("contactId", "status");

-- CreateIndex
CREATE INDEX "ContactSequenceEnrollment_workspaceId_status_idx" ON "ContactSequenceEnrollment"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelDomain" ADD CONSTRAINT "FunnelDomain_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelDomain" ADD CONSTRAINT "FunnelDomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funnel" ADD CONSTRAINT "Funnel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelStep" ADD CONSTRAINT "FunnelStep_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelStep" ADD CONSTRAINT "FunnelStep_physicalProductId_fkey" FOREIGN KEY ("physicalProductId") REFERENCES "PhysicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalProduct" ADD CONSTRAINT "PhysicalProduct_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepPricePlan" ADD CONSTRAINT "StepPricePlan_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBump" ADD CONSTRAINT "OrderBump_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBump" ADD CONSTRAINT "OrderBump_physicalProductId_fkey" FOREIGN KEY ("physicalProductId") REFERENCES "PhysicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBumpPricePlan" ADD CONSTRAINT "OrderBumpPricePlan_orderBumpId_fkey" FOREIGN KEY ("orderBumpId") REFERENCES "OrderBump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBumpResource" ADD CONSTRAINT "OrderBumpResource_orderBumpId_fkey" FOREIGN KEY ("orderBumpId") REFERENCES "OrderBump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEvent" ADD CONSTRAINT "ContactEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_stepPricePlanId_fkey" FOREIGN KEY ("stepPricePlanId") REFERENCES "StepPricePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderBumpPricePlanId_fkey" FOREIGN KEY ("orderBumpPricePlanId") REFERENCES "OrderBumpPricePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_refundedByUserId_fkey" FOREIGN KEY ("refundedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_stepPricePlanId_fkey" FOREIGN KEY ("stepPricePlanId") REFERENCES "StepPricePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orderBumpPricePlanId_fkey" FOREIGN KEY ("orderBumpPricePlanId") REFERENCES "OrderBumpPricePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelStepResource" ADD CONSTRAINT "FunnelStepResource_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactResourceAccess" ADD CONSTRAINT "ContactResourceAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactResourceAccess" ADD CONSTRAINT "ContactResourceAccess_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_automationActionId_fkey" FOREIGN KEY ("automationActionId") REFERENCES "AutomationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_sequenceStepId_fkey" FOREIGN KEY ("sequenceStepId") REFERENCES "SequenceStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ContactSequenceEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdentity" ADD CONSTRAINT "SenderIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSequenceEnrollment" ADD CONSTRAINT "ContactSequenceEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
