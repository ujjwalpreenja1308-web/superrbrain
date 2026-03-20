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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppShell />}>
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
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
