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

// Use Cases
import { NoteUseCases } from '../../features/notes/application/NoteUseCases';
import { ActivityUseCases } from '../../features/activities/application/ActivityUseCases';
import { ContactUseCases } from '../../features/contacts/application/ContactUseCases';
import { CompanyUseCases } from '../../features/companies/application/CompanyUseCases';
import { LeadUseCases } from '../../features/crm/application/LeadUseCases';
import { AutomationUseCases } from '../../features/automations/application/AutomationUseCases';
import { AnalyticsUseCases } from '../../features/analytics/application/AnalyticsUseCases';

// Controllers
import { NoteController } from '../../features/notes/presentation/NoteController';
import { ActivityController } from '../../features/activities/presentation/ActivityController';
import { ContactController } from '../../features/contacts/presentation/ContactController';
import { CompanyController } from '../../features/companies/presentation/CompanyController';
import { LeadController } from '../../features/crm/presentation/LeadController';
import { AutomationController } from '../../features/automations/presentation/AutomationController';
import { AnalyticsController } from '../../features/analytics/presentation/AnalyticsController';

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

    container.register('NoteRepository', noteRepository);
    container.register('ActivityRepository', activityRepository);
    container.register('ContactRepository', contactRepository);
    container.register('CompanyRepository', companyRepository);
    container.register('LeadRepository', leadRepository);
    container.register('AutomationRepository', automationRepository);
    container.register('AnalyticsRepository', analyticsRepository);

    // 3. Use Cases
    const noteUseCases = new NoteUseCases(noteRepository);
    const activityUseCases = new ActivityUseCases(activityRepository);
    const contactUseCases = new ContactUseCases(contactRepository);
    const companyUseCases = new CompanyUseCases(companyRepository);
    const leadUseCases = new LeadUseCases(leadRepository);
    const automationUseCases = new AutomationUseCases(automationRepository);
    const analyticsUseCases = new AnalyticsUseCases(analyticsRepository);

    container.register('NoteUseCases', noteUseCases);
    container.register('ActivityUseCases', activityUseCases);
    container.register('ContactUseCases', contactUseCases);
    container.register('CompanyUseCases', companyUseCases);
    container.register('LeadUseCases', leadUseCases);
    container.register('AutomationUseCases', automationUseCases);
    container.register('AnalyticsUseCases', analyticsUseCases);

    // 4. Controllers
    container.register('NoteController', new NoteController(noteUseCases));
    container.register('ActivityController', new ActivityController(activityUseCases));
    container.register('ContactController', new ContactController(contactUseCases));
    container.register('CompanyController', new CompanyController(companyUseCases));
    container.register('LeadController', new LeadController(leadUseCases));
    container.register('AutomationController', new AutomationController(automationUseCases));
    container.register('AnalyticsController', new AnalyticsController(analyticsUseCases));
}
