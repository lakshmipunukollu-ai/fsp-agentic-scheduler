import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import type { DashboardStats, InsightsData } from '../types';

type DashboardDataContextValue = {
  stats: DashboardStats | null;
  insights: InsightsData | null;
  lastAgentRun: Date | null;
  /** Monthly recovered $ from analysis/revenue-breakdown (hero card) */
  monthlyRevenueRecovered: number | null;
  loading: boolean;
  error: string;
  /** Stats + insights only (used on interval) */
  refreshCore: () => Promise<void>;
  /** Full refresh including last agent run + revenue breakdown */
  refreshFull: () => Promise<void>;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [lastAgentRun, setLastAgentRun] = useState<Date | null>(null);
  const [monthlyRevenueRecovered, setMonthlyRevenueRecovered] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCore = useCallback(async () => {
    const [data, ins] = await Promise.all([api.getDashboardStats(), api.getInsights()]);
    setStats(data);
    setInsights(ins);
  }, []);

  const refreshFull = useCallback(async () => {
    const [data, ins, lastRun, revenue] = await Promise.all([
      api.getDashboardStats(),
      api.getInsights(),
      api.getLastAgentRun().catch(() => ({ last_run_at: null as string | null })),
      api.getRevenueBreakdown().catch(() => null),
    ]);
    setStats(data);
    setInsights(ins);
    setLastAgentRun(lastRun.last_run_at ? new Date(lastRun.last_run_at) : null);
    setMonthlyRevenueRecovered(revenue?.revenue_recovered_usd ?? null);
    setError('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await refreshFull();
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const id = setInterval(() => {
      fetchCore().catch(() => { /* keep last good stats */ });
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshFull, fetchCore]);

  const value = useMemo(
    () => ({
      stats,
      insights,
      lastAgentRun,
      monthlyRevenueRecovered,
      loading,
      error,
      refreshCore: fetchCore,
      refreshFull,
    }),
    [stats, insights, lastAgentRun, monthlyRevenueRecovered, loading, error, fetchCore, refreshFull]
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error('useDashboardData must be used within DashboardDataProvider');
  }
  return ctx;
}
