import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
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
import { PlanChooser } from "@/pages/PlanChooser";
import { ContentMoat } from "@/pages/ContentMoat";
import { PromptLab } from "@/pages/PromptLab";
import { PagesList } from "@/pages/PagesList";
import { PageEditor } from "@/pages/PageEditor";
import { Publishers } from "@/pages/Publishers";
import { ReinforcementQueue } from "@/pages/ReinforcementQueue";
import { Login } from "@/pages/Login";
import { useAuth, getSignInUrl, isHomeDomain } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

const DODO_PRODUCTS: Record<string, string> = {
  starter: import.meta.env.VITE_DODO_PRODUCT_STARTER_MONTHLY ?? "",
  growth:  import.meta.env.VITE_DODO_PRODUCT_GROWTH_MONTHLY  ?? "",
  pro:     import.meta.env.VITE_DODO_PRODUCT_PRO_MONTHLY     ?? "",
};

/** Blocks access to paid-only routes. Trial users (active or expired) are redirected to /plan. */
function PlanGuard({ children }: { children: React.ReactNode }) {
  const plan = usePlan();
  const navigate = useNavigate();
  const location = useLocation();

  // Still loading — don't flash the gate
  if (plan.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
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
    navigate("/plan", { replace: true });
    return null;
  }

  return <>{children}</>;
}

/**
 * Post-auth plan page.
 * - ?payment=success → /onboarding
 * - ?payment=cancelled → stay, show chooser again
 * - paid plan → skip straight to /dashboard
 * - trial → show PlanChooser
 */
function PlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paymentTimeout, setPaymentTimeout] = useState(false);

  const isAwaitingPayment = new URLSearchParams(window.location.search).get("payment") === "success";

  // If webhook doesn't fire within 15s, assume payment failed — show chooser again
  useEffect(() => {
    if (!isAwaitingPayment) return;
    const t = setTimeout(() => {
      window.history.replaceState({}, "", "/plan");
      setPaymentTimeout(true);
    }, 15_000);
    return () => clearTimeout(t);
  }, [isAwaitingPayment]);

  const { data: me, isLoading: meLoading, isFetching: meFetching, isError: meError } = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => api.get<{ plan: string }>("/api/me"),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: isAwaitingPayment ? 3000 : false,
    retry: 2,
  });

  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");

  // Wait for fresh plan — meLoading is false when stale cache exists, so also check meFetching
  if (meLoading || meFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Came back from Dodo checkout — poll until webhook confirms plan activation
  if (payment === "success" && !paymentTimeout) {
    if (!meError && me && me.plan !== "trial") {
      // Webhook already fired — go to onboarding
      window.history.replaceState({}, "", "/plan");
      window.location.href = `${HOME_URL}/onboarding`;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }
    // Still waiting for webhook — show spinner and keep refetching
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Confirming your payment…</p>
        </div>
      </div>
    );
  }

  // Already on a paid plan — skip chooser
  if (!meError && me && me.plan !== "trial") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  // Trial — show chooser
  return <PlanChooser />;
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
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
