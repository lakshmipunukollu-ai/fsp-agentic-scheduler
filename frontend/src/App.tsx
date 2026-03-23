import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardDataProvider, useDashboardData } from './context/DashboardDataContext';
import Login from './components/Login';
import Layout from './components/Layout';
import StudentPortal from './components/StudentPortal';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import PageSkeleton from './components/PageSkeleton';
import { defaultHomePath } from './constants/nav';
import type { UserRole } from './types';

const Dashboard = lazy(() => import('./components/Dashboard'));
const ApprovalQueue = lazy(() => import('./components/ApprovalQueue'));
const ActivityFeed = lazy(() => import('./components/ActivityFeed'));
const PolicyConfig = lazy(() => import('./components/PolicyConfig'));
const AdminStudents = lazy(() => import('./components/AdminStudents'));
const AnalysisTab = lazy(() => import('./components/AnalysisTab'));
const Account = lazy(() => import('./components/Account'));

function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to={defaultHomePath(user?.role ?? 'viewer')} replace />;
  }
  return <>{children}</>;
}

function RoleBasedHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultHomePath(user.role)} replace />;
}

function QueueRoute() {
  const { suggestionId } = useParams<{ suggestionId?: string }>();
  return <ApprovalQueue focusSuggestionId={suggestionId} />;
}

function StaffRoutes() {
  const { stats } = useDashboardData();
  const notificationCount = (stats?.pending ?? 0) + (stats?.pendingStudentRequests ?? 0);

  return (
    <Routes>
      <Route path="/" element={<Layout notificationCount={notificationCount} />}>
        <Route index element={<RoleBasedHome />} />
        <Route path="dashboard" element={<RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense></RouteErrorBoundary>} />
        <Route path="queue" element={<RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><QueueRoute /></Suspense></RouteErrorBoundary>} />
        <Route path="queue/:suggestionId" element={<RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><QueueRoute /></Suspense></RouteErrorBoundary>} />
        <Route path="activity" element={<RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><ActivityFeed /></Suspense></RouteErrorBoundary>} />
        <Route
          path="students"
          element={
            <RequireRole roles={['admin']}>
              <RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><AdminStudents /></Suspense></RouteErrorBoundary>
            </RequireRole>
          }
        />
        <Route
          path="analysis"
          element={
            <RequireRole roles={['admin', 'scheduler']}>
              <RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><AnalysisTab /></Suspense></RouteErrorBoundary>
            </RequireRole>
          }
        />
        <Route
          path="config"
          element={
            <RequireRole roles={['admin']}>
              <RouteErrorBoundary><Suspense fallback={<PageSkeleton />}><PolicyConfig /></Suspense></RouteErrorBoundary>
            </RequireRole>
          }
        />
        <Route
          path="account"
          element={
            <RouteErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Account />
              </Suspense>
            </RouteErrorBoundary>
          }
        />
        <Route path="*" element={<RoleBasedHome />} />
      </Route>
    </Routes>
  );
}

function StaffShell() {
  return (
    <DashboardDataProvider>
      <StaffRoutes />
    </DashboardDataProvider>
  );
}

/** Staff or student app — only mounted when `user` is set (see `AppContent`). */
function AuthenticatedApp() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'student') return <StudentPortal />;
  return <StaffShell />;
}

/** Cinematic login at `/login`; redirects home if already signed in. */
function LoginGateway() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#64748b' }}>
      Loading...
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginGateway />} />
      <Route
        path="/*"
        element={
          user ? (
            <AuthenticatedApp />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return <ThemeProvider><AuthProvider><AppContent /></AuthProvider></ThemeProvider>;
}
