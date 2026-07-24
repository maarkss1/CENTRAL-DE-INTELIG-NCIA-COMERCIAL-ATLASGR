import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { TabType } from './components/layout/nav';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { BrandProvider } from './contexts/BrandContext';
import { ClickSpark } from './components/ui/ClickSpark';
import { FloatingChatbook } from './components/ui/FloatingChatbook';

import { Login } from './features/auth/components/Login';
import { ProspectingHub } from './features/prospecting/components/ProspectingHub';
import { EnricherHub } from './features/prospecting/components/EnricherHub';
import { CrmBoard } from './components/CrmBoard';
import { IntelligenceHub } from './features/intelligence/components/IntelligenceHub';
import { PromptStudio } from './features/intelligence/components/PromptStudio';
import { Dashboard } from './features/dashboard/components/Dashboard';
import { CompanyList } from './features/companies/components/CompanyList';
import { ContactList } from './features/contacts/components/ContactList';
import { ActivityList } from './features/activities/components/ActivityList';
import { RoleplayHub } from './features/roleplay/components/RoleplayHub';
import { ChatbotAssistente } from './features/chatbot/components/ChatbotAssistente';
import { EditorDocumentos } from './features/document-editor/components/EditorDocumentos';
import { Analytics } from './features/analytics/components/Analytics';
import { Automations } from './features/automations/components/Automations';
import { Team } from './features/team/components/Team';
import { Reports } from './features/reports/components/Reports';
import { Integrations } from './features/integrations/components/Integrations';
import { Billing } from './features/billing/components/Billing';
import { Calendar } from './features/calendar/components/Calendar';
import { Settings } from './features/settings/components/Settings';
import { Notifications } from './features/notifications/components/Notifications';
import { Base } from './features/knowledge/components/Base';

function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    const getActiveTab = (): TabType => {
        const path = location.pathname;
        if (path.includes('/companies')) return 'companies';
        if (path.includes('/contacts')) return 'contacts';
        if (path.includes('/crm')) return 'crm';
        if (path.includes('/activities')) return 'activities';
        if (path.includes('/prospect')) return 'prospect';
        if (path.includes('/enrich')) return 'enrich';
        if (path.includes('/intelligence')) return 'intelligence';
        if (path.includes('/prompts')) return 'prompts';
        if (path.includes('/roleplay')) return 'roleplay';
        if (path.includes('/chatbot')) return 'chatbot';
        if (path.includes('/document-editor')) return 'document-editor';
        if (path.includes('/analytics')) return 'analytics';
        if (path.includes('/automations')) return 'automations';
        if (path.includes('/team')) return 'team';
        if (path.includes('/reports')) return 'reports';
        if (path.includes('/integrations')) return 'integrations';
        if (path.includes('/billing')) return 'billing';
        if (path.includes('/calendar')) return 'calendar';
        if (path.includes('/settings')) return 'settings';
        if (path.includes('/notifications')) return 'notifications';
        if (path.includes('/knowledge')) return 'knowledge';

        return 'dashboard';
    };

    const handleTabChange = (tab: TabType) => {
        if (tab === 'dashboard') navigate('/app');
        else navigate(`/app/${tab}`);
    };

    return (
        <MainLayout activeTab={getActiveTab()} onTabChange={handleTabChange}>
            <ClickSpark />
            <FloatingChatbook />
            <Routes>
                <Route path="/" element={<Dashboard onNavigate={handleTabChange} />} />
                <Route path="companies" element={<CompanyList />} />
                <Route path="contacts" element={<ContactList />} />
                <Route path="crm" element={<CrmBoard />} />
                <Route path="activities" element={<ActivityList />} />
                <Route path="prospect" element={<ProspectingHub />} />
                <Route path="enrich" element={<EnricherHub />} />
                <Route path="intelligence" element={<IntelligenceHub />} />
                <Route path="prompts" element={<PromptStudio />} />
                <Route path="roleplay" element={<RoleplayHub />} />
                <Route path="chatbot" element={<ChatbotAssistente />} />
                <Route path="document-editor" element={<EditorDocumentos />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="automations" element={<Automations />} />
                <Route path="team" element={<Team />} />
                <Route path="reports" element={<Reports />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="billing" element={<Billing />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="settings" element={<Settings />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="knowledge" element={<Base />} />
            </Routes>
        </MainLayout>
    );
}

export default function App() {
    return (
        <BrandProvider>
            <Routes>
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="/login" element={<Login />} />
                <Route
                    path="/app/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrandProvider>
    );
}
