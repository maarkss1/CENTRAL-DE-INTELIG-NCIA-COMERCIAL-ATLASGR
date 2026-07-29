import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { TabType } from './components/layout/Header';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { BrandProvider } from './contexts/BrandContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Skeleton } from './components/ui/Skeleton';
import { ClickSpark } from './components/ui/ClickSpark';

// Lazy loaded feature modules
const SinglePageDashboard = lazy(() => import('./features/dashboard/components/SinglePageDashboard').then((m) => ({ default: m.SinglePageDashboard })));
const Login = lazy(() => import('./features/auth/components/Login').then((m) => ({ default: m.Login })));
const ProspectingHub = lazy(() => import('./features/prospecting/components/ProspectingHub').then(m => ({ default: m.ProspectingHub })));
const CrmBoard = lazy(() => import('./components/CrmBoard').then(m => ({ default: m.CrmBoard })));
const IntelligenceHub = lazy(() => import('./features/intelligence/components/IntelligenceHub').then(m => ({ default: m.IntelligenceHub })));
const CompanyList = lazy(() => import('./features/companies/components/CompanyList').then(m => ({ default: m.CompanyList })));
const ContactList = lazy(() => import('./features/contacts/components/ContactList').then(m => ({ default: m.ContactList })));
const ActivityList = lazy(() => import('./features/activities/components/ActivityList').then(m => ({ default: m.ActivityList })));
const ChatbookHub = lazy(() => import('./features/chatbook/components/ChatbookHub').then(m => ({ default: m.ChatbookHub })));
const Integrations = lazy(() => import('./features/integrations/components/Integrations').then(m => ({ default: m.Integrations })));
const GameWidget = lazy(() => import('./features/gamification/components/GameWidget').then(m => ({ default: m.GameWidget })));
const AIDockWidget = lazy(() => import('./features/intelligence/components/AIDockWidget').then(m => ({ default: m.AIDockWidget })));
const OnboardingTour = lazy(() => import('./features/onboarding/components/OnboardingTour').then(m => ({ default: m.OnboardingTour })));

function PageFallback() {
  return (
    <div className="p-8 space-y-6 w-full max-w-7xl mx-auto animate-pulse">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-48 bg-white/10" />
        <Skeleton className="h-10 w-32 bg-white/10" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-32 bg-white/5 rounded-2xl" />
        <Skeleton className="h-32 bg-white/5 rounded-2xl" />
        <Skeleton className="h-32 bg-white/5 rounded-2xl" />
      </div>
      <Skeleton className="h-96 w-full bg-white/5 rounded-3xl" />
    </div>
  );
}

function AppLayout() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  return (
    <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Suspense fallback={<PageFallback />}>
        {activeTab === 'dashboard' && <SinglePageDashboard onSelectModule={(tab: TabType | string) => setActiveTab(tab as TabType)} />}
        {activeTab === 'prospect' && <ProspectingHub />}
        {activeTab === 'crm' && <CrmBoard />}
        {activeTab === 'intelligence' && <IntelligenceHub />}
        {activeTab === 'companies' && <CompanyList />}
        {activeTab === 'contacts' && <ContactList />}
        {activeTab === 'activities' && <ActivityList />}
        {activeTab === 'chatbook' && <ChatbookHub />}
        {activeTab === 'integrations' && <Integrations />}
        {activeTab === 'knowledge' && (
          <div className="flex-1 overflow-y-auto bg-white p-8">
             <div className="max-w-6xl mx-auto space-y-6">
                <GameWidget />
             </div>
          </div>
        )}
      </Suspense>

      {/* Gamification and Navigation Global Layers */}
      <Suspense fallback={null}>
        <GameWidget />
        <OnboardingTour />
        <AIDockWidget />
      </Suspense>
    </MainLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrandProvider>
        <AuthProvider>
          <ClickSpark />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Navigate to="/app" replace />} />
              <Route
                path="/app/*"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <AppLayout />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}
