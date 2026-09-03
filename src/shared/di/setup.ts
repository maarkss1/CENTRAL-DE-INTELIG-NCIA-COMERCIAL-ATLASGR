import { container } from './container.js';
import { InMemoryEventBus } from '../infra/events/InMemoryEventBus.js';

// Repositories
import { PrismaNoteRepository } from '../../features/notes/infra/PrismaNoteRepository';
import { PrismaActivityRepository } from '../../features/activities/infra/PrismaActivityRepository';
import { PrismaContactRepository } from '../../features/contacts/infra/PrismaContactRepository';
import { PrismaCompanyRepository } from '../../features/companies/infra/PrismaCompanyRepository';
import { PrismaLeadRepository } from '../../features/crm/infra/PrismaLeadRepository';
import { PrismaAutomationRepository } from '../../features/automations/infra/PrismaAutomationRepository';
import { PrismaAnalyticsRepository } from '../../features/analytics/infra/PrismaAnalyticsRepository';
import { PrismaCommercialIntelligenceRepository } from '../../features/commercial-intelligence/infra/PrismaCommercialIntelligenceRepository';
import { CommercialIntelligenceAiService } from '../../features/commercial-intelligence/infra/CommercialIntelligenceAiService';
import { PrismaForecastSnapshotStore } from '../../features/commercial-intelligence/infra/PrismaForecastSnapshotStore';
import { PrismaCrm360Repository } from '../../features/crm360/infra/PrismaCrm360Repository';
import { PrismaQualificationMatrixRepository } from '../../features/playbook/qualification-matrix/infra/PrismaQualificationMatrixRepository';
import { PrismaObjectionMatrixRepository } from '../../features/playbook/objection-matrix/infra/PrismaObjectionMatrixRepository';
import { PrismaBugReportRepository } from '../../features/bug-reports/infra/PrismaBugReportRepository';
import { PrismaUsageRepository } from '../../features/billing/infra/PrismaUsageRepository';
import { PrismaFeatureFlagRepository } from '../../features/feature-flags/infra/PrismaFeatureFlagRepository';
import { PrismaCopilotoIaRepository } from '../../features/copiloto-ia/infra/PrismaCopilotoIaRepository';
import { CopilotoVoiceIngestionAdapter } from '../../features/copiloto-ia/infra/CopilotoVoiceIngestionAdapter';
import { BitrixLeadWritebackAdapter } from '../../features/integrations/bitrix/infra/BitrixLeadWritebackAdapter';
import { MeetingSynthesisService } from '../../features/chatbook/services/meeting-synthesis.service';

// Use Cases
import { NoteUseCases } from '../../features/notes/application/NoteUseCases';
import { ActivityUseCases } from '../../features/activities/application/ActivityUseCases';
import { ContactUseCases } from '../../features/contacts/application/ContactUseCases';
import { CompanyUseCases } from '../../features/companies/application/CompanyUseCases';
import { LeadUseCases } from '../../features/crm/application/LeadUseCases';
import { AutomationUseCases } from '../../features/automations/application/AutomationUseCases';
import { AnalyticsUseCases } from '../../features/analytics/application/AnalyticsUseCases';
import { CommercialIntelligenceUseCases } from '../../features/commercial-intelligence/application/CommercialIntelligenceUseCases';
import { Crm360UseCases } from '../../features/crm360/application/Crm360UseCases';
import { QualificationMatrixUseCases } from '../../features/playbook/qualification-matrix/application/QualificationMatrixUseCases';
import { ObjectionMatrixUseCases } from '../../features/playbook/objection-matrix/application/ObjectionMatrixUseCases';
import { BugReportUseCases } from '../../features/bug-reports/application/BugReportUseCases';
import { UsageUseCases } from '../../features/billing/application/UsageUseCases';
import { FeatureFlagsUseCases } from '../../features/feature-flags/application/FeatureFlagsUseCases';
import { CopilotoIaUseCases } from '../../features/copiloto-ia/application/CopilotoIaUseCases';
import { CopilotoBitrixWritebackUseCases } from '../../features/copiloto-ia/application/CopilotoBitrixWritebackUseCases';

// Controllers
import { NoteController } from '../../features/notes/presentation/NoteController';
import { ActivityController } from '../../features/activities/presentation/ActivityController';
import { ContactController } from '../../features/contacts/presentation/ContactController';
import { CompanyController } from '../../features/companies/presentation/CompanyController';
import { LeadController } from '../../features/crm/presentation/LeadController';
import { AutomationController } from '../../features/automations/presentation/AutomationController';
import { AnalyticsController } from '../../features/analytics/presentation/AnalyticsController';
import { CommercialIntelligenceController } from '../../features/commercial-intelligence/presentation/CommercialIntelligenceController';
import { Crm360Controller } from '../../features/crm360/presentation/Crm360Controller';
import { QualificationMatrixController } from '../../features/playbook/qualification-matrix/presentation/QualificationMatrixController';
import { ObjectionMatrixController } from '../../features/playbook/objection-matrix/presentation/ObjectionMatrixController';
import { BugReportController } from '../../features/bug-reports/presentation/BugReportController';
import { UsageController } from '../../features/billing/presentation/UsageController';
import { FeatureFlagsController } from '../../features/feature-flags/presentation/FeatureFlagsController';
import { CopilotoIaController } from '../../features/copiloto-ia/presentation/CopilotoIaController';

export function setupDI() {
  // 1. Shared
  const eventBus = new InMemoryEventBus();
  container.register('EventBus', eventBus);

  // 2. Repositories
  const noteRepository = new PrismaNoteRepository();
  const activityRepository = new PrismaActivityRepository();
  const contactRepository = new PrismaContactRepository();
  const companyRepository = new PrismaCompanyRepository();
  const leadRepository = new PrismaLeadRepository();
  const automationRepository = new PrismaAutomationRepository();
  const analyticsRepository = new PrismaAnalyticsRepository();
  const commercialIntelligenceRepository = new PrismaCommercialIntelligenceRepository();
  const crm360Repository = new PrismaCrm360Repository();
  const qualificationMatrixRepository = new PrismaQualificationMatrixRepository();
  const objectionMatrixRepository = new PrismaObjectionMatrixRepository();
  const bugReportRepository = new PrismaBugReportRepository();
  const usageRepository = new PrismaUsageRepository();
  const featureFlagRepository = new PrismaFeatureFlagRepository();
  const copilotoIaRepository = new PrismaCopilotoIaRepository();
  // Porta de composição entre features (copiloto-ia -> integrations/bitrix), ver
  // src/shared/contracts/bitrixWriteback.contract.ts — este arquivo é a única "raiz de composição"
  // com licença de conhecer as duas features ao mesmo tempo.
  const bitrixLeadWritebackAdapter = new BitrixLeadWritebackAdapter();
  // Porta de composição na direção oposta (integrations/birth-voice -> copiloto-ia), Onda 7 item 2
  // — ver src/shared/contracts/copilotoVoiceIngestion.contract.ts. Reaproveita o MESMO
  // MeetingSynthesisService de chatbook já usado pelo worker de transcrição (worker.ts/
  // src/bootstrap/workers.ts) — não duplica a integração.
  const copilotoVoiceIngestionAdapter = new CopilotoVoiceIngestionAdapter(
    new MeetingSynthesisService(),
  );

  container.register('NoteRepository', noteRepository);
  container.register('ActivityRepository', activityRepository);
  container.register('ContactRepository', contactRepository);
  container.register('CompanyRepository', companyRepository);
  container.register('LeadRepository', leadRepository);
  container.register('AutomationRepository', automationRepository);
  container.register('AnalyticsRepository', analyticsRepository);
  container.register('CommercialIntelligenceRepository', commercialIntelligenceRepository);
  container.register('Crm360Repository', crm360Repository);
  container.register('QualificationMatrixRepository', qualificationMatrixRepository);
  container.register('ObjectionMatrixRepository', objectionMatrixRepository);
  container.register('BugReportRepository', bugReportRepository);
  container.register('UsageRepository', usageRepository);
  container.register('FeatureFlagRepository', featureFlagRepository);
  container.register('CopilotoIaRepository', copilotoIaRepository);
  container.register('CopilotoVoiceIngestionPort', copilotoVoiceIngestionAdapter);

  // 3. Use Cases
  const noteUseCases = new NoteUseCases(noteRepository);
  const activityUseCases = new ActivityUseCases(activityRepository);
  const contactUseCases = new ContactUseCases(contactRepository);
  const companyUseCases = new CompanyUseCases(companyRepository);
  const leadUseCases = new LeadUseCases(leadRepository);
  const automationUseCases = new AutomationUseCases(automationRepository);
  const analyticsUseCases = new AnalyticsUseCases(analyticsRepository);
  // Store real de snapshots (model ForecastSnapshot) — sem ele, o erro histórico do Forecast e o
  // pilar "Confiabilidade de Forecast" do Health Score nunca teriam dado em produção.
  const commercialIntelligenceUseCases = new CommercialIntelligenceUseCases(
    commercialIntelligenceRepository,
    new PrismaForecastSnapshotStore(),
  );
  const commercialIntelligenceAiService = new CommercialIntelligenceAiService(
    commercialIntelligenceUseCases,
  );
  const crm360UseCases = new Crm360UseCases(crm360Repository);
  const qualificationMatrixUseCases = new QualificationMatrixUseCases(
    qualificationMatrixRepository,
  );
  const objectionMatrixUseCases = new ObjectionMatrixUseCases(objectionMatrixRepository);
  const bugReportUseCases = new BugReportUseCases(bugReportRepository);
  const usageUseCases = new UsageUseCases(usageRepository);
  const featureFlagsUseCases = new FeatureFlagsUseCases(featureFlagRepository);
  const copilotoIaUseCases = new CopilotoIaUseCases(copilotoIaRepository);
  const copilotoBitrixWritebackUseCases = new CopilotoBitrixWritebackUseCases(
    copilotoIaRepository,
    bitrixLeadWritebackAdapter,
  );

  container.register('NoteUseCases', noteUseCases);
  container.register('ActivityUseCases', activityUseCases);
  container.register('ContactUseCases', contactUseCases);
  container.register('CompanyUseCases', companyUseCases);
  container.register('LeadUseCases', leadUseCases);
  container.register('AutomationUseCases', automationUseCases);
  container.register('AnalyticsUseCases', analyticsUseCases);
  container.register('CommercialIntelligenceUseCases', commercialIntelligenceUseCases);
  container.register('Crm360UseCases', crm360UseCases);
  container.register('QualificationMatrixUseCases', qualificationMatrixUseCases);
  container.register('ObjectionMatrixUseCases', objectionMatrixUseCases);
  container.register('BugReportUseCases', bugReportUseCases);
  container.register('UsageUseCases', usageUseCases);
  container.register('FeatureFlagsUseCases', featureFlagsUseCases);
  container.register('CopilotoIaUseCases', copilotoIaUseCases);
  container.register('CopilotoBitrixWritebackUseCases', copilotoBitrixWritebackUseCases);

  // 4. Controllers
  container.register('NoteController', new NoteController(noteUseCases));
  container.register('ActivityController', new ActivityController(activityUseCases));
  container.register('ContactController', new ContactController(contactUseCases));
  container.register('CompanyController', new CompanyController(companyUseCases));
  container.register('LeadController', new LeadController(leadUseCases));
  container.register('AutomationController', new AutomationController(automationUseCases));
  container.register('AnalyticsController', new AnalyticsController(analyticsUseCases));
  container.register(
    'CommercialIntelligenceController',
    new CommercialIntelligenceController(
      commercialIntelligenceUseCases,
      commercialIntelligenceAiService,
    ),
  );
  container.register('Crm360Controller', new Crm360Controller(crm360UseCases));
  container.register(
    'QualificationMatrixController',
    new QualificationMatrixController(qualificationMatrixUseCases),
  );
  container.register(
    'ObjectionMatrixController',
    new ObjectionMatrixController(objectionMatrixUseCases),
  );
  container.register('BugReportController', new BugReportController(bugReportUseCases));
  container.register('UsageController', new UsageController(usageUseCases));
  container.register('FeatureFlagsController', new FeatureFlagsController(featureFlagsUseCases));
  container.register(
    'CopilotoIaController',
    new CopilotoIaController(copilotoIaUseCases, copilotoBitrixWritebackUseCases),
  );
}
