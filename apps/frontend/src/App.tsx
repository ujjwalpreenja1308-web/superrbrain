import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
      window.location.href = AUTH_URL;
      return null;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** If already logged in on auth domain, redirect to home */
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
      window.location.href = HOME_URL;
      return null;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <Login />;
}

function AppRoutes() {
  // In production: auth.covable.app only serves login, home.covable.app serves the app
  // In dev: both on localhost, routes coexist
  const authDomain = isAuthDomain();
  const homeDomain = isHomeDomain();

  // On auth subdomain in production: only render login
  if (import.meta.env.PROD && authDomain && !homeDomain) {
    return (
      <Routes>
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
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
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
