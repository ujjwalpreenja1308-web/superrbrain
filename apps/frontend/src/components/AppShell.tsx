import { Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Separator } from "@/components/ui/separator";
import { ActiveBrandProvider } from "@/hooks/useActiveBrand";

export function AppShell() {
  return (
    <ActiveBrandProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 !h-4" />
          </header>
          <main className="flex-1 overflow-hidden p-6 animate-fade-in h-[calc(100vh-3rem)]">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ActiveBrandProvider>
  );
}
