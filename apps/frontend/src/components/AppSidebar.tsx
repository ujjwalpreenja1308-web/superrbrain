import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import {
  LayoutDashboard,
  ListChecks,
  TrendingUp,
  Settings,
  HelpCircle,
  LogOut,
  ChevronsUpDown,
  FileText,
  MessageSquare,
  Plus,
  Check,
  Globe,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Gap Queue", to: "/gap-queue", icon: ListChecks },
  { title: "Blog", to: "/blog", icon: FileText },
  { title: "Prompts", to: "/prompts", icon: MessageSquare },
  { title: "Outcomes", to: "/outcomes", icon: TrendingUp },
];

const bottomNavItems = [
  { title: "Settings", to: "/settings", icon: Settings },
  { title: "Help", to: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const navigate = useNavigate();
  const { activeBrand, brands, setActiveBrandId } = useActiveBrand();

  function handleAddBrand() {
    navigate("/onboarding");
  }

  function handleSwitchBrand(id: string) {
    setActiveBrandId(id);
  }

  return (
    <Sidebar collapsible="icon" side="left">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Covable">
              <NavLink to="/dashboard">
                <img src="/logo.svg" alt="Covable" className="h-5 w-auto" />
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Brand switcher */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={activeBrand?.name ?? "Select brand"}
                  className="cursor-pointer"
                >
                  <div className="flex size-7 items-center justify-center rounded-md bg-secondary">
                    <Globe className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none min-w-0">
                    <span className="text-xs font-medium truncate">
                      {activeBrand?.name ?? "No brand"}
                    </span>
                    {activeBrand?.url && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {activeBrand.url.replace(/^https?:\/\//, "")}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-auto size-3.5 opacity-40" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side={isCollapsed ? "right" : "bottom"}
                align="start"
              >
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Brands</p>
                </div>
                {brands.map((brand) => (
                  <DropdownMenuItem
                    key={brand.id}
                    onClick={() => handleSwitchBrand(brand.id)}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded bg-secondary shrink-0">
                      <Globe className="size-3 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate">{brand.name ?? brand.url}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {brand.url.replace(/^https?:\/\//, "")}
                      </span>
                    </div>
                    {brand.id === activeBrand?.id && (
                      <Check className="size-3.5 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleAddBrand}
                  className="cursor-pointer text-muted-foreground"
                >
                  <Plus className="size-4" />
                  Add brand
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to}>
                    {({ isActive }) => (
                      <SidebarMenuButton isActive={isActive} tooltip={item.title}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {bottomNavItems.map((item) => (
            <SidebarMenuItem key={item.to}>
              <NavLink to={item.to}>
                {({ isActive }) => (
                  <SidebarMenuButton isActive={isActive} tooltip={item.title}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={user?.email ?? "Profile"}
                  className="cursor-pointer"
                >
                  <Avatar className="size-6 rounded-md">
                    <AvatarFallback className="rounded-md bg-primary/20 text-primary text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none min-w-0">
                    <span className="text-xs font-medium truncate">
                      {user?.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side={isCollapsed ? "right" : "top"}
                align="start"
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/settings" className="cursor-pointer">
                    <Settings className="size-4" />
                    Settings
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
