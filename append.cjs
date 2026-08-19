const fs = require('fs');

const models = `
// --- FASE 1: LDR Account Intelligence ---

model AccountIntelligenceSnapshot {
  id           String   @id @default(cuid())
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  version      Int
  summary      String?  @db.Text
  structuredFacts Json?
  sourceStatus String?
  generatedAt  DateTime @default(now())
  expiresAt    DateTime?

  @@index([companyId])
}

model AccountSignal {
  id          String   @id @default(cuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  type        String
  title       String
  description String?  @db.Text
  source      String
  sourceUrl   String?
  confidence  Float?
  status      String   @default("active")
  dedupeKey   String?
  detectedAt  DateTime @default(now())
  effectiveAt DateTime?

  @@index([companyId, type])
  @@index([companyId, detectedAt])
}

model DecisionMaker {
  id           String   @id @default(cuid())
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  name         String
  role         String?
  department   String?
  seniority    String?
  buyingRole   String?
  phone        String?
  email        String?
  source       String?
  confidence   Float?
  verifiedAt   DateTime?
  createdAt    DateTime @default(now())

  @@index([companyId])
}

model EconomicRelationship {
  id              String   @id @default(cuid())
  sourceCompanyId String
  sourceCompany   Company  @relation("SourceRelationship", fields: [sourceCompanyId], references: [id], onDelete: Cascade)
  targetCompanyId String
  targetCompany   Company  @relation("TargetRelationship", fields: [targetCompanyId], references: [id], onDelete: Cascade)
  relationType    String
  evidence        String?  @db.Text
  confidence      Float?
  createdAt       DateTime @default(now())

  @@index([sourceCompanyId])
  @@index([targetCompanyId])
}

model IntelligenceEvidence {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  factKey     String
  value       String?  @db.Text
  source      String
  sourceUrl   String?
  confidence  Float?
  evidenceType String?
  collectedAt DateTime @default(now())

  @@index([entityType, entityId])
}

model AccountScore {
  id           String   @id @default(cuid())
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  total        Int
  fit          Int?
  timing       Int?
  intent       Int?
  relationship Int?
  reasons      Json?
  scoreVersion String?
  calculatedAt DateTime @default(now())

  @@index([companyId])
}

model AccountRecommendation {
  id             String   @id @default(cuid())
  companyId      String
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  actionType     String
  title          String
  rationale      String?  @db.Text
  priority       String?
  expectedImpact String?
  status         String   @default("pending")
  externalRef    String?
  generatedAt    DateTime @default(now())
  executedAt     DateTime?

  @@index([companyId, status])
}
`;

fs.appendFileSync('prisma/schema.prisma', models);
console.log('Appended successfully.');
