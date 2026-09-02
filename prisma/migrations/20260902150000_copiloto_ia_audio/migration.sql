-- AlterTable
ALTER TABLE "CopilotoConversation" ADD COLUMN     "audioDurationMs" INTEGER,
ADD COLUMN     "audioMimeType" TEXT,
ADD COLUMN     "audioObjectKey" TEXT,
ADD COLUMN     "audioSizeBytes" INTEGER,
ADD COLUMN     "transcriptionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "transcriptionError" TEXT,
ADD COLUMN     "transcriptionStartedAt" TIMESTAMP(3);
