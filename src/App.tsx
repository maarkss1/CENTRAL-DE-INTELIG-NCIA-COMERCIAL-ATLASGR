import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { TabType } from './components/layout/nav';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

import { Login } from './features/auth/components/Login';
import { ProspectingHub } from './features/prospecting/components/ProspectingHub';
import { EnricherHub } from './features/prospecting/components/EnricherHub';
import { CrmBoard } from './components/CrmBoard';
import { IntelligenceHub } from './features/intelligence/components/IntelligenceHub';
import { Dashboard } from './features/dashboard/components/Dashboard';
import { CompanyList } from './features/companies/components/CompanyList';
import { ContactList } from './features/contacts/components/ContactList';
import { ActivityList } from './features/activities/components/ActivityList';

function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    // Map pathname to active tab
    const getActiveTab = (): TabType => {
        const path = location.pathname;
        if (path.includes('/companies')) return 'companies';
        if (path.includes('/contacts')) return 'contacts';
        if (path.includes('/crm')) return 'crm';
        if (path.includes('/activities')) return 'activities';
        if (path.includes('/prospect')) return 'prospect';
        if (path.includes('/enrich')) return 'enrich';
        if (path.includes('/intelligence')) return 'intelligence';
        return 'dashboard';
    };

    const handleTabChange = (tab: TabType) => {
        if (tab === 'dashboard') navigate('/app');
        else navigate(`/app/${tab}`);
    };

    return (
        <MainLayout activeTab={getActiveTab()} onTabChange={handleTabChange}>
            <Routes>
                <Route path="/" element={<Dashboard onNavigate={handleTabChange} />} />
                <Route path="companies" element={<CompanyList />} />
                <Route path="contacts" element={<ContactList />} />
                <Route path="crm" element={<CrmBoard />} />
                <Route path="activities" element={<ActivityList />} />
                <Route path="prospect" element={<ProspectingHub />} />
                <Route path="enrich" element={<EnricherHub />} />
                <Route path="intelligence" element={<IntelligenceHub />} />
            </Routes>
        </MainLayout>
    );
}

export default function App() {
    return (
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
    );
}
