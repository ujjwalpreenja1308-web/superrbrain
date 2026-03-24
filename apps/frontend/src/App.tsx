import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Onboarding } from "@/pages/Onboarding";
import { Dashboard } from "@/pages/Dashboard";
import { GapQueue } from "@/pages/GapQueue";
import { ContentWorkbench } from "@/pages/ContentWorkbench";
import { Outcomes } from "@/pages/Outcomes";
import { Settings } from "@/pages/Settings";
import { Help } from "@/pages/Help";
import { Blog } from "@/pages/Blog";
import { Prompts } from "@/pages/Prompts";
import { Login } from "@/pages/Login";
import { useAuth, isAuthDomain, isHomeDomain } from "@/hooks/useAuth";
import { usePlan, useActivateTrial } from "@/hooks/usePlan";

const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ||
  (import.meta.env.PROD ? "https://auth.covable.app" : "http://localhost:5173");

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      onError: (error) => {
        toast.error(error.message || "Something went wrong. Please try again.");
      },
    },
  },
});

/** Auth guard: if not logged in, redirect to auth.covable.app */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    if (import.meta.env.PROD) {
      // Preserve ?plan= param so we can redirect to checkout after login
      const planParam = new URLSearchParams(window.location.search).get("plan");
      const redirectTo = planParam ? `${AUTH_URL}?plan=${planParam}` : AUTH_URL;
      window.location.href = redirectTo;
      return null;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * Plan guard: activates trial on first load, blocks expired-trial users.
 * Handles ?plan= param from landing page CTA → redirects to Dodo checkout after auth.
 */
function PlanGuard({ children }: { children: React.ReactNode }) {
  useActivateTrial();
  const plan = usePlan();
  const { user } = useAuth();

  // If came from landing page with ?plan=, redirect to settings billing
  useEffect(() => {
    const planParam = new URLSearchParams(window.location.search).get("plan");
    if (planParam && user) {
      // Remove param from URL, let user pick plan in billing tab
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [user]);

  if (plan.trialExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-4xl">⏱</div>
          <h2 className="text-xl font-semibold">Your trial has ended</h2>
          <p className="text-sm text-muted-foreground">
            Choose a plan to continue using Covable. Your data is safe and waiting for you.
          </p>
          <a
            href="/settings"
            className="inline-block w-full rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View plans
          </a>
          <p className="text-xs text-muted-foreground">Cancel anytime · No hidden fees</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** If already logged in on auth domain, redirect to home (preserving ?plan=) */
function AuthPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    if (import.meta.env.PROD) {
      const planParam = new URLSearchParams(window.location.search).get("plan");
      const dest = planParam ? `${HOME_URL}/settings?plan=${planParam}` : HOME_URL;
      window.location.href = dest;
      return null;
    }
    const planParam = new URLSearchParams(window.location.search).get("plan");
    return <Navigate to={planParam ? `/settings?plan=${planParam}` : "/dashboard"} replace />;
  }

  return <Login />;
}

function AppRoutes() {
  // In production: auth.covable.app only serves login, home.covable.app serves the app
  // In dev: both on localhost, routes coexist
  const authDomain = isAuthDomain();
  const homeDomain = isHomeDomain();

  // On auth subdomain in production: only render login/get-started
  if (import.meta.env.PROD && authDomain && !homeDomain) {
    return (
      <Routes>
        <Route path="/get-started" element={<AuthPage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<AuthPage />} />

      {/* Protected app routes */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <PlanGuard>
              <Onboarding />
            </PlanGuard>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <PlanGuard>
              <AppShell />
            </PlanGuard>
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/gap-queue" element={<GapQueue />} />
        <Route path="/content/:jobId" element={<ContentWorkbench />} />
        <Route path="/outcomes" element={<Outcomes />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
