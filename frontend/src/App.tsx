import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ApprovalQueue from './components/ApprovalQueue';
import ActivityFeed from './components/ActivityFeed';
import PolicyConfig from './components/PolicyConfig';
import StudentPortal from './components/StudentPortal';
import AdminStudents from './components/AdminStudents';
import { api } from './api/client';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notificationCount, setNotificationCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || user.role === 'student') return;
    const fetchCount = async () => {
      try {
        const stats = await api.getDashboardStats();
        setNotificationCount(stats.pending + (stats.pendingStudentRequests || 0));
      } catch { /* silent */ }
    };
    fetchCount();
    pollRef.current = setInterval(fetchCount, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user]);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#64748b' }}>
      Loading...
    </div>
  );

  if (!user) return <Login />;
  if (user.role === 'student') return <StudentPortal />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onNavigate={setActiveTab} />;
      case 'queue': return <ApprovalQueue />;
      case 'activity': return <ActivityFeed />;
      case 'config': return <PolicyConfig />;
      case 'students': return <AdminStudents />;
      default: return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} notificationCount={notificationCount}>
      {renderContent()}
    </Layout>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
