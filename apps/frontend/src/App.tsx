import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { Prompts } from "@/pages/Prompts";
import { ContentMoat } from "@/pages/ContentMoat";
import { PromptLab } from "@/pages/PromptLab";
import { PagesList } from "@/pages/PagesList";
import { PageEditor } from "@/pages/PageEditor";
import { Publishers } from "@/pages/Publishers";
import { ReinforcementQueue } from "@/pages/ReinforcementQueue";
import { Login } from "@/pages/Login";
import { useAuth, getSignInUrl, isHomeDomain } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { usePlan, useActivateTrial } from "@/hooks/usePlan";

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const SIGN_IN_PATH = "/auth/sign-in";
const SIGN_UP_PATH = "/auth/sign-up";
const LEGACY_SIGN_IN_PATH = "/sign-in";
const LEGACY_SIGN_UP_PATH = "/sign-up";
const LEGACY_GET_STARTED_PATH = "/get-started";
const LEGACY_LOGIN_PATH = "/login";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Auth guard: if not logged in, redirect to covable.app/sign-in */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (loading || user || redirectedRef.current) return;
    redirectedRef.current = true;
    const planParam = new URLSearchParams(window.location.search).get("plan");
    window.location.replace(getSignInUrl(planParam));
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    if (!import.meta.env.PROD) {
      // Dev: skip auth entirely
      return <>{children}</>;
    }
    // Show spinner while useEffect fires the redirect
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

const DODO_PRODUCTS: Record<string, string> = {
  starter: import.meta.env.VITE_DODO_PRODUCT_STARTER_MONTHLY ?? "",
  growth:  import.meta.env.VITE_DODO_PRODUCT_GROWTH_MONTHLY  ?? "",
  pro:     import.meta.env.VITE_DODO_PRODUCT_PRO_MONTHLY     ?? "",
};

/**
 * Plan guard: activates trial on first load, blocks expired-trial users.
 * Handles ?plan= param from landing page CTA → redirects to Dodo checkout after auth.
 */
function PlanGuard({ children }: { children: React.ReactNode }) {
  useActivateTrial();
  const plan = usePlan();
  const { user } = useAuth();
  const didHandleParams = useRef(false);
  const location = useLocation();

  // Handle return from Dodo checkout OR ?plan= redirect — run once only
  useEffect(() => {
    if (didHandleParams.current) return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      didHandleParams.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      window.location.href = `${HOME_URL}/onboarding`;
      return;
    }
    if (payment === "cancelled") {
      didHandleParams.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // If came from landing page with ?plan=, redirect straight to Dodo checkout.
    // Wait for user to be loaded before handling — don't mark done if user isn't ready yet.
    const planParam = params.get("plan");
    if (planParam) {
      if (!user) return; // wait for auth to resolve, effect will re-run
      didHandleParams.current = true;
      const productId = DODO_PRODUCTS[planParam];
      if (productId) {
        const checkoutParams = new URLSearchParams({
          email: user.email ?? "",
          "metadata[user_id]": user.id,
          redirect_url: `${HOME_URL}?payment=success`,
          cancel_url: `${HOME_URL}?payment=cancelled`,
        });
        window.history.replaceState({}, "", window.location.pathname);
        window.location.href = `https://checkout.dodopayments.com/buy/${productId}?${checkoutParams.toString()}`;
        return;
      }
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // No relevant params — mark done
    didHandleParams.current = true;
  }, [user]);

  // Allow /settings through even when trial has expired so the user can upgrade
  if (plan.trialExpired && location.pathname !== "/settings") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-4xl">⏱</div>
          <h2 className="text-xl font-semibold">Your trial has ended</h2>
          <p className="text-sm text-muted-foreground">
            Choose a plan to continue using Covable. Your data is safe and waiting for you.
          </p>
          <a
            href="/settings?tab=billing"
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
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (loading || !user || redirectedRef.current) return;
    redirectedRef.current = true;

    const planParam = new URLSearchParams(window.location.search).get("plan");
    const base = planParam ? `${HOME_URL}?plan=${planParam}` : HOME_URL;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=magiclink`;
        window.location.replace(`${base}#${hash}`);
      } else {
        window.location.replace(base);
      }
    });
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user && import.meta.env.PROD) {
    // Show spinner while the useEffect redirect fires
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    const planParam = new URLSearchParams(window.location.search).get("plan");
    return <Navigate to={planParam ? `/?plan=${planParam}` : "/dashboard"} replace />;
  }

  return <Login />;
}

function AppRoutes() {
  // In production: covable.app serves auth routes, home.covable.app serves the app.
  // In dev: both live on localhost, so routes coexist.
  const homeDomain = isHomeDomain();

  if (import.meta.env.PROD && !homeDomain) {
    return (
      <Routes>
        <Route path={SIGN_IN_PATH} element={<AuthPage />} />
        <Route path={SIGN_UP_PATH} element={<AuthPage />} />
        <Route path={LEGACY_SIGN_IN_PATH} element={<Navigate to={SIGN_IN_PATH} replace />} />
        <Route path={LEGACY_SIGN_UP_PATH} element={<Navigate to={SIGN_UP_PATH} replace />} />
        <Route path={LEGACY_GET_STARTED_PATH} element={<Navigate to={SIGN_UP_PATH} replace />} />
        <Route path={LEGACY_LOGIN_PATH} element={<Navigate to={SIGN_IN_PATH} replace />} />
        <Route path="*" element={<Navigate to={SIGN_IN_PATH} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Auth routes */}
      <Route path={SIGN_IN_PATH} element={<AuthPage />} />
      <Route path={SIGN_UP_PATH} element={<AuthPage />} />
      <Route path={LEGACY_SIGN_IN_PATH} element={<Navigate to={SIGN_IN_PATH} replace />} />
      <Route path={LEGACY_SIGN_UP_PATH} element={<Navigate to={SIGN_UP_PATH} replace />} />
      <Route path={LEGACY_GET_STARTED_PATH} element={<Navigate to={SIGN_UP_PATH} replace />} />
      <Route path={LEGACY_LOGIN_PATH} element={<Navigate to={SIGN_IN_PATH} replace />} />

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
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/content-moat" element={<ContentMoat />} />
        <Route path="/content-moat/prompts" element={<PromptLab />} />
        <Route path="/content-moat/pages" element={<PagesList />} />
        <Route path="/content-moat/pages/:id" element={<PageEditor />} />
        <Route path="/content-moat/publishers" element={<Publishers />} />
        <Route path="/content-moat/reinforcement" element={<ReinforcementQueue />} />
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
