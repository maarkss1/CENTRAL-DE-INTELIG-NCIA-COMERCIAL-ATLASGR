-- Enable RLS and Force it (even for table owners)
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" FORCE ROW LEVEL SECURITY;

ALTER TABLE "TimelineEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimelineEvent" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

-- Create Policies

-- Organization
CREATE POLICY tenant_isolation_policy ON "Organization" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = id
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

-- Entities with organizationId
CREATE POLICY tenant_isolation_policy ON "Company" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY tenant_isolation_policy ON "Contact" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY tenant_isolation_policy ON "Lead" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY tenant_isolation_policy ON "Activity" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY tenant_isolation_policy ON "user" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

-- Child Entities (No direct organizationId, filtering via parent)
CREATE POLICY tenant_isolation_policy ON "Note" FOR ALL
USING (
    "leadId" IN (
        SELECT id FROM "Lead" 
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

CREATE POLICY tenant_isolation_policy ON "TimelineEvent" FOR ALL
USING (
    "leadId" IN (
        SELECT id FROM "Lead" 
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);