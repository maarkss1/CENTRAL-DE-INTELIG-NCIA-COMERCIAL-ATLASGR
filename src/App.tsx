import { lazy, Suspense, useCallback, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { RequireRole } from './components/layout/RequireRole';
import { COMMERCIAL_INTELLIGENCE_ROLES } from './lib/auth/authorization';
import { BrandProvider } from './contexts/BrandContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ActiveRecordProvider } from './contexts/ActiveRecordContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Skeleton } from './components/ui/Skeleton';
import { ClickSpark } from './components/ui/ClickSpark';

// Lazy loaded feature modules
const SinglePageDashboard = lazy(() => import('./features/dashboard/components/SinglePageDashboard').then((m) => ({ default: m.SinglePageDashboard })));
const LoginScreen = lazy(() => import('./features/auth/components/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const ResetPasswordScreen = lazy(() => import('./features/auth/components/ResetPasswordScreen').then((m) => ({ default: m.ResetPasswordScreen })));
const ProspectingHub = lazy(() => import('./features/prospecting/components/ProspectingHub').then(m => ({ default: m.ProspectingHub })));
const CrmBoard = lazy(() => import('./components/CrmBoard').then(m => ({ default: m.CrmBoard })));
const CrmOverview = lazy(() => import('./features/crm360/components/CrmOverview').then(m => ({ default: m.CrmOverview })));
const IntelligenceHub = lazy(() => import('./features/intelligence/components/IntelligenceHub').then(m => ({ default: m.IntelligenceHub })));
const CompanyList = lazy(() => import('./features/companies/components/CompanyList').then(m => ({ default: m.CompanyList })));
const ContactList = lazy(() => import('./features/contacts/components/ContactList').then(m => ({ default: m.ContactList })));
const ActivityList = lazy(() => import('./features/activities/components/ActivityList').then(m => ({ default: m.ActivityList })));
const CadenceHub = lazy(() => import('./features/cadence/components/CadenceHub').then(m => ({ default: m.CadenceHub })));
const RoleplayHub = lazy(() => import('./features/roleplay/components/RoleplayHub').then(m => ({ default: m.RoleplayHub })));
const QualificationMatrixPage = lazy(() => import('./features/playbook/components/QualificationMatrixPage').then(m => ({ default: m.QualificationMatrixPage })));
const ObjectionsMatrixPage = lazy(() => import('./features/playbook/components/ObjectionsMatrixPage').then(m => ({ default: m.ObjectionsMatrixPage })));
const TopicTrainingAcademy = lazy(() => import('./features/intelligence/components/TopicTrainingAcademy').then(m => ({ default: m.TopicTrainingAcademy })));
const BitrixGuideHub = lazy(() => import('./features/intelligence/components/BitrixGuideHub').then(m => ({ default: m.BitrixGuideHub })));
const ReportsHub = lazy(() => import('./features/intelligence/components/ReportsHub').then(m => ({ default: m.ReportsHub })));
const ChatbookHub = lazy(() => import('./features/chatbook/components/ChatbookHub').then(m => ({ default: m.ChatbookHub })));
const Integrations = lazy(() => import('./features/integrations/components/Integrations').then(m => ({ default: m.Integrations })));
const KnowledgeBase = lazy(() => import('./features/knowledge/components/Base').then(m => ({ default: m.Base })));
const Analytics = lazy(() => import('./features/analytics/components/Analytics').then(m => ({ default: m.Analytics })));
const WinLossAnalysis = lazy(() => import('./features/analytics/components/WinLossAnalysis').then(m => ({ default: m.WinLossAnalysis })));
const CommercialIntelligenceHub = lazy(() => import('./features/commercial-intelligence/components/CommercialIntelligenceHub').then(m => ({ default: m.CommercialIntelligenceHub })));
const Calendar = lazy(() => import('./features/calendar/components/Calendar').then(m => ({ default: m.Calendar })));
const Notifications = lazy(() => import('./features/notifications/components/Notifications').then(m => ({ default: m.Notifications })));
const Automations = lazy(() => import('./features/automations/components/Automations').then(m => ({ default: m.Automations })));
const Usage = lazy(() => import('./features/billing/components/Billing').then(m => ({ default: m.Billing })));
const DocumentEditor = lazy(() => import('./features/document-editor/components/Editor').then(m => ({ default: m.Editor })));
const Team = lazy(() => import('./features/team/components/Team').then(m => ({ default: m.Team })));
const Settings = lazy(() => import('./features/settings/components/Settings').then(m => ({ default: m.Settings })));
const OnboardingTour = lazy(() => import('./features/onboarding/components/OnboardingTour').then(m => ({ default: m.OnboardingTour })));
const WelcomeScreen = lazy(() => import('./features/auth/components/WelcomeScreen').then(m => ({ default: m.WelcomeScreen })));
const SelectionScreen = lazy(() => import('./features/auth/components/SelectionScreen').then(m => ({ default: m.SelectionScreen })));
import { MarketIntelligence } from './pages/MarketIntelligence';

function PageFallback() {
  return (
    // data-testid: sinal determinístico de "módulo lazy ainda carregando" para os testes E2E
    // (tests/e2e/helpers.ts → waitForAppReady). Substitui waitForLoadState('networkidle'), que
    // nunca podia funcionar aqui: CrmBoard.tsx mantém um EventSource (SSE) aberto em /app/crm, e
    // uma conexão de longa duração impede a rede de ficar ociosa por definição.
    <div data-testid="page-fallback" className="p-8 space-y-6 w-full max-w-7xl mx-auto animate-pulse">
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
  // OnboardingTour importa AtlasOrb (@react-three/fiber/three), um chunk de ~900kB — React.lazy
  // só adia QUANDO o import roda, não SE ele roda. Sem esta checagem aqui, <OnboardingTour />
  // sendo renderizado incondicionalmente disparava esse import em toda montagem do MainLayout
  // (ou seja, em toda navegação autenticada), mesmo para quem já viu o tour — a checagem de
  // "já viu?" só existia dentro do próprio componente, tarde demais para evitar o fetch do chunk.
  const [showOnboardingTour] = useState(
    () => typeof window !== 'undefined' && !window.localStorage.getItem('@prospector:has_seen_tour')
  );
  const navigate = useNavigate();
  // CrmOverview dispara navegação entre tabs a partir de cards de atalho (ex.: KPI -> board de
  // leads); reaproveita a mesma URL de rota usada pelo Sidebar em vez de um mecanismo à parte.
  const handleCrmOverviewNavigate = useCallback((tab: string) => navigate(`/app/${tab}`), [navigate]);

  return (
    <MainLayout>
      {/* Rotas relativas a /app — a wildcard "/app/*" na Route pai (mais abaixo) faz o React
          Router casar estes paths aninhados contra o restante da URL automaticamente. */}
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<SinglePageDashboard />} />
          <Route path="prospect" element={<ProspectingHub />} />
          <Route path="crm" element={<CrmBoard />} />
          <Route path="crm360" element={<CrmOverview onNavigate={handleCrmOverviewNavigate} />} />
          <Route path="intelligence" element={<IntelligenceHub />} />
          <Route path="companies" element={<CompanyList />} />
          <Route path="contacts" element={<ContactList />} />
          <Route path="activities" element={<ActivityList />} />
          <Route path="cadence" element={<CadenceHub />} />
          <Route path="chatbook" element={<ChatbookHub />} />
          <Route path="roleplay" element={<RoleplayHub />} />
          <Route path="qualification_matrix" element={<QualificationMatrixPage />} />
          <Route path="objections_matrix" element={<ObjectionsMatrixPage />} />
          <Route path="topic_training" element={<TopicTrainingAcademy />} />
          <Route path="bitrix" element={<BitrixGuideHub />} />
          <Route path="reports" element={<ReportsHub />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="winloss" element={<WinLossAnalysis />} />
          <Route path="market-intelligence" element={<MarketIntelligence />} />
          {/* Comercial Inteligente — módulo executivo restrito. RequireRole bloqueia acesso
              direto por URL (não só o item de menu); a autorização real (que nunca confia no
              frontend) está em requireRole no backend — ver commercialIntelligence.routes.ts. */}
          <Route
            path="commercial_intelligence"
            element={
              <RequireRole allowedRoles={[...COMMERCIAL_INTELLIGENCE_ROLES]}>
                <CommercialIntelligenceHub />
              </RequireRole>
            }
          />
          <Route path="calendar" element={<Calendar />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="automations" element={<Automations />} />
          <Route path="usage" element={<Usage />} />
          <Route path="editor" element={<DocumentEditor />} />
          <Route path="team" element={<RequireRole allowedRoles={['ADMIN']}><Team /></RequireRole>} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>

      {/* Gamification and Navigation Global Layers */}
      {showOnboardingTour && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}
    </MainLayout>
  );
}

export default function App() {
  return (
    // reducedMotion="user" faz o framer-motion respeitar prefers-reduced-motion do SO/navegador,
    // complementando o @media (prefers-reduced-motion: reduce) já aplicado às animações CSS puras
    // em globals.css (que não cobre transitions/animate props do framer-motion).
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <BrandProvider>
        <AuthProvider>
        <ActiveRecordProvider>
          <ClickSpark />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route path="/welcome" element={<WelcomeScreen />} />
              <Route path="/select-brand" element={<SelectionScreen />} />
              <Route path="/login" element={<LoginScreen />} />
              <Route path="/reset-password" element={<ResetPasswordScreen />} />
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
              <Route path="*" element={<Navigate to="/welcome" replace />} />
            </Routes>
          </Suspense>
        </ActiveRecordProvider>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
