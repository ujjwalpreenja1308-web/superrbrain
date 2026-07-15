import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth, getSignInUrl, isHomeDomain } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import { api } from "@/lib/api";

const Onboarding = lazy(() => import("@/pages/Onboarding").then((module) => ({ default: module.Onboarding })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const GapQueue = lazy(() => import("@/pages/GapQueue").then((module) => ({ default: module.GapQueue })));
const ContentWorkbench = lazy(() => import("@/pages/ContentWorkbench").then((module) => ({ default: module.ContentWorkbench })));
const Outcomes = lazy(() => import("@/pages/Outcomes").then((module) => ({ default: module.Outcomes })));
const Settings = lazy(() => import("@/pages/Settings").then((module) => ({ default: module.Settings })));
const Help = lazy(() => import("@/pages/Help").then((module) => ({ default: module.Help })));
const Prompts = lazy(() => import("@/pages/Prompts").then((module) => ({ default: module.Prompts })));
const PlanChooser = lazy(() => import("@/pages/PlanChooser").then((module) => ({ default: module.PlanChooser })));
const ContentMoat = lazy(() => import("@/pages/ContentMoat").then((module) => ({ default: module.ContentMoat })));
const PromptLab = lazy(() => import("@/pages/PromptLab").then((module) => ({ default: module.PromptLab })));
const PagesList = lazy(() => import("@/pages/PagesList").then((module) => ({ default: module.PagesList })));
const PageEditor = lazy(() => import("@/pages/PageEditor").then((module) => ({ default: module.PageEditor })));
const Publishers = lazy(() => import("@/pages/Publishers").then((module) => ({ default: module.Publishers })));
const ReinforcementQueue = lazy(() => import("@/pages/ReinforcementQueue").then((module) => ({ default: module.ReinforcementQueue })));
const Login = lazy(() => import("@/pages/Login").then((module) => ({ default: module.Login })));

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const MARKETING_URL =
  import.meta.env.VITE_MARKETING_URL ||
  (import.meta.env.PROD ? "https://covable.app" : "http://localhost:5173");

function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(`${MARKETING_URL}${to}`);
  }, [to]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

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

// Invalidate /api/me cache on auth events so plan status is always fresh.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
    if (event === "SIGNED_IN") sessionStorage.removeItem("plan_chooser_dismissed");
    queryClient.invalidateQueries({ queryKey: ["me"] });
  }
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

/** Blocks access to paid-only routes. Trial users (active or expired) are redirected to /plan. */
function PlanGuard({ children }: { children: React.ReactNode }) {
  if (import.meta.env.DEV) return <>{children}</>;

  const plan = usePlan();
  const location = useLocation();

  // Still loading — don't flash the gate
  if (plan.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (plan.isError) {
    return <PlanStatusError onRetry={plan.refetch} />;
  }

  // Trial (active or expired) → must pick a plan. Settings always accessible.
  if (plan.tier === "trial" && location.pathname !== "/settings") {
    // Expired trial — show hard block with billing link
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
              href="/plan"
              className="inline-block w-full rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View plans
            </a>
            <p className="text-xs text-muted-foreground">Cancel anytime · No hidden fees</p>
          </div>
        </div>
      );
    }
    // Active trial — redirect to /plan to pick a plan
    return <Navigate to="/plan" replace />;
  }

  return <>{children}</>;
}

/**
 * Post-auth plan page. New trial users choose a plan here.
 * Paid users, including plan_override users, never see the chooser.
 */
function PlanPage() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const payment = searchParams.get("payment");
  const subscriptionId = searchParams.get("subscription_id");
  const dodoStatus = searchParams.get("status");
  const isAwaitingPayment = payment === "success";
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [confirmationRetry, setConfirmationRetry] = useState(0);
  const [confirmationFailed, setConfirmationFailed] = useState(false);
  const confirmationStartedRef = useRef(false);
  const plan = usePlan({ refetchInterval: isAwaitingPayment ? 3000 : false });

  useEffect(() => {
    if (plan.isLoading || plan.isError || plan.tier === "trial") return;
    navigate(isAwaitingPayment ? "/onboarding" : "/dashboard", { replace: true });
  }, [isAwaitingPayment, navigate, plan.isError, plan.isLoading, plan.tier]);

  useEffect(() => {
    if (
      !isAwaitingPayment ||
      !subscriptionId ||
      dodoStatus !== "active" ||
      plan.isLoading ||
      plan.isError ||
      plan.tier !== "trial" ||
      confirmationStartedRef.current
    ) {
      return;
    }

    confirmationStartedRef.current = true;
    setConfirmationFailed(false);
    api
      .post("/api/me/confirm-subscription", { subscription_id: subscriptionId })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["me"] });
        plan.refetch();
      })
      .catch((error) => {
        console.error("Failed to confirm Dodo subscription", error);
        setConfirmationFailed(true);
      });
  }, [
    confirmationRetry,
    dodoStatus,
    isAwaitingPayment,
    plan.isError,
    plan.isLoading,
    plan.refetch,
    plan.tier,
    subscriptionId,
  ]);

  useEffect(() => {
    if (!isAwaitingPayment || plan.tier !== "trial" || plan.isError) {
      setConfirmationTimedOut(false);
      return;
    }

    setConfirmationTimedOut(false);
    const timeout = window.setTimeout(() => setConfirmationTimedOut(true), 45_000);
    return () => window.clearTimeout(timeout);
  }, [confirmationRetry, isAwaitingPayment, plan.isError, plan.tier]);

  function retryConfirmation() {
    setConfirmationTimedOut(false);
    setConfirmationFailed(false);
    confirmationStartedRef.current = false;
    setConfirmationRetry((current) => current + 1);
    plan.refetch();
  }

  if (isAwaitingPayment && (confirmationTimedOut || confirmationFailed) && plan.tier === "trial" && !plan.isError) {
    return <PaymentConfirmationDelayed onRetry={retryConfirmation} />;
  }

  if (plan.isLoading || (isAwaitingPayment && plan.tier === "trial" && !plan.isError)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center text-sm text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p>{isAwaitingPayment ? "Confirming your payment..." : "Checking your plan..."}</p>
        </div>
      </div>
    );
  }

  if (plan.isError) {
    return <PlanStatusError onRetry={plan.refetch} />;
  }

  if (plan.tier !== "trial") {
    return null;
  }

  return <PlanChooser />;
}

function PaymentConfirmationDelayed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm space-y-4 text-center">
        <h2 className="text-xl font-semibold">Payment is taking longer to confirm</h2>
        <p className="text-sm text-muted-foreground">
          Your checkout may have succeeded, but billing has not activated your account yet. Retry in a moment, or contact support if this keeps happening.
        </p>
        <button
          onClick={onRetry}
          className="inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry confirmation
        </button>
        <p className="text-xs text-muted-foreground">
          Need help?{" "}
          <a href="mailto:support@covable.app" className="underline underline-offset-2 hover:text-foreground">
            support@covable.app
          </a>
        </p>
      </div>
    </div>
  );
}

function PlanStatusError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm space-y-4 text-center">
        <h2 className="text-xl font-semibold">We could not check your plan</h2>
        <p className="text-sm text-muted-foreground">
          Your account may already be active. Retry before choosing a plan again.
        </p>
        <button
          onClick={onRetry}
          className="inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/** If already logged in on auth domain, redirect to home/plan */
function AuthPage() {
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (loading || !user || redirectedRef.current) return;
    redirectedRef.current = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=magiclink`;
        window.location.replace(`${HOME_URL}/plan#${hash}`);
      } else {
        window.location.replace(`${HOME_URL}/plan`);
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/plan" replace />;
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
      {/* Auth routes — on home domain, redirect to covable.app/auth */}
      <Route path={SIGN_IN_PATH} element={<ExternalRedirect to={SIGN_IN_PATH} />} />
      <Route path={SIGN_UP_PATH} element={<ExternalRedirect to={SIGN_UP_PATH} />} />
      <Route path={LEGACY_SIGN_IN_PATH} element={<ExternalRedirect to={SIGN_IN_PATH} />} />
      <Route path={LEGACY_SIGN_UP_PATH} element={<ExternalRedirect to={SIGN_UP_PATH} />} />
      <Route path={LEGACY_GET_STARTED_PATH} element={<ExternalRedirect to={SIGN_UP_PATH} />} />
      <Route path={LEGACY_LOGIN_PATH} element={<ExternalRedirect to={SIGN_IN_PATH} />} />

      {/* Plan chooser — shown after every auth, user picks a plan or skips */}
      <Route
        path="/plan"
        element={
          <RequireAuth>
            <PlanPage />
          </RequireAuth>
        }
      />

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
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
