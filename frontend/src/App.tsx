import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { ToastHost } from './components/ui/Toast';
import { PageSpinner } from './components/ui/Spinner';
import { useAuth } from './hooks/useAuth';

import LoginPage from './pages/auth/Login';
import RegisterPage from './pages/auth/Register';
import VerifyEmailPage from './pages/auth/VerifyEmail';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';
import MfaSetupPage from './pages/auth/MfaSetup';
import MfaChallengePage from './pages/auth/MfaChallenge';

import DashboardPage from './pages/dashboard/Dashboard';
import PortfoliosPage from './pages/portfolios/Portfolios';
import PortfolioDetailPage from './pages/portfolios/PortfolioDetail';
import WatchlistsPage from './pages/watchlists/Watchlists';
import InsightsPage from './pages/insights/Insights';
import GoalsPage from './pages/goals/Goals';
import GoalDetailPage from './pages/goals/GoalDetail';
import ResearchPage from './pages/research/Research';
import ResearchNoteDetailPage from './pages/research/ResearchNoteDetail';
import ClientsPage from './pages/clients/Clients';
import ClientDetailPage from './pages/clients/ClientDetail';
import ReportsPage from './pages/reports/Reports';
import NotificationsPage from './pages/notifications/Notifications';
import SettingsPage from './pages/settings/Settings';
import OnboardingPage from './pages/onboarding/Onboarding';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, status } = useAuth();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return <PageSpinner />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function AuthOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, status } = useAuth();
  if (status === 'idle' || status === 'loading') {
    return <PageSpinner />;
  }
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, status } = useAuth();

  // Redirect onboarded-but-not-setup users to onboarding (only on main routes).
  useEffect(() => {
    if (
      status === 'authenticated' &&
      profile &&
      profile.onboarded &&
      !location.pathname.startsWith('/auth') &&
      location.pathname !== '/onboarding'
    ) {
      navigate('/onboarding', { replace: true });
    }
  }, [status, profile, location.pathname, navigate]);

  return (
    <>
      <ToastHost />
      <Routes>
        {/* Auth */}
        <Route path="/auth" element={<AuthLayout />}>
          <Route
            path="login"
            element={
              <AuthOnlyRoute>
                <LoginPage />
              </AuthOnlyRoute>
            }
          />
          <Route
            path="register"
            element={
              <AuthOnlyRoute>
                <RegisterPage />
              </AuthOnlyRoute>
            }
          />
          <Route path="verify-email/:token?" element={<VerifyEmailPage />} />
          <Route
            path="forgot-password"
            element={
              <AuthOnlyRoute>
                <ForgotPasswordPage />
              </AuthOnlyRoute>
            }
          />
          <Route
            path="reset-password/:token?"
            element={
              <AuthOnlyRoute>
                <ResetPasswordPage />
              </AuthOnlyRoute>
            }
          />
          <Route path="mfa" element={<MfaChallengePage />} />
          <Route path="mfa/setup" element={<MfaSetupPage />} />
          <Route path="verified" element={<VerifiedRedirect />} />
        </Route>

        {/* App */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portfolios" element={<PortfoliosPage />} />
          <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
          <Route path="/watchlists" element={<WatchlistsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/research/:id" element={<ResearchNoteDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:tab" element={<SettingsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function VerifiedRedirect() {
  return <Navigate to="/auth/login" replace />;
}
