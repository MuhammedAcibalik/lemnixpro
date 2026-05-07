"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Gauge,
  Home,
  Layers3,
  Menu,
  Scissors,
  ShieldCheck
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { LogoutButton } from "@/features/auth/logout-button";
import {
  workspaceNavigation,
  workspaceNavigationGroups,
  type ModuleIcon,
  type WorkspaceNavigationItem
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  isWorkspaceQueryKey,
  prefetchWorkspaceRoute,
  prefetchWorkspaceWarmCache
} from "@/lib/workspace-query";
import { InlineRefresh } from "@/ui/inline-refresh";

import { CommandSearch } from "./command-search";
import { RouteTransition } from "./route-transition";
import { SystemStatusCluster } from "./system-status-cluster";
import { WorkspaceMutationInvalidator } from "./workspace-mutation-invalidator";

type AppShellProps = {
  children: ReactNode;
};

type NavIcon = ComponentType<{ className?: string }>;

const iconByName: Record<ModuleIcon, NavIcon> = {
  analytics: BarChart3,
  "cut-list": Scissors,
  home: Home,
  optimization: Gauge,
  "production-plan": ClipboardList,
  profile: Layers3
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const activeItem = workspaceNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const startMark = "lemnix:navigation:start";
    const readyMark = "lemnix:navigation:content-ready";
    const startEntries = performance.getEntriesByName(startMark, "mark");

    if (startEntries.length === 0) {
      return;
    }

    performance.mark(readyMark);
    performance.measure(`lemnix:navigation:${pathname}`, startMark, readyMark);

    const measures = performance.getEntriesByName(
      `lemnix:navigation:${pathname}`,
      "measure"
    );
    const latestMeasure = measures[measures.length - 1];

    if (latestMeasure && isNavigationMetricsEnabled()) {
      console.debug("[LemnixPRO] route content ready", {
        durationMs: Math.round(latestMeasure.duration),
        pathname
      });
    }

    performance.clearMarks(startMark);
    performance.clearMarks(readyMark);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88">
        <div className="flex h-16 min-w-0 items-center gap-3 px-3 md:px-5">
          <MobileNavigation pathname={pathname} />
          <ShellBrand />
          <TopNavigation pathname={pathname} />
          <CommandSearch items={workspaceNavigation} />
          <SystemStatusCluster />
          <BackgroundRefreshIndicator />
          <UserMenu />
        </div>
        <div className="border-t bg-card/65 px-3 py-2 md:hidden">
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {activeItem
              ? `LemnixPRO / ${groupLabel(activeItem)} / ${activeItem.label}`
              : "LemnixPRO"}
          </p>
        </div>
      </header>

      <main className="min-w-0 px-3 py-4 md:px-5 lg:px-6">
        <div className="mx-auto w-full max-w-[1920px]">
          <RouteTransition>{children}</RouteTransition>
        </div>
      </main>
      <WorkspaceDataWarmup />
      <WorkspaceMutationInvalidator />
    </div>
  );
}

function ShellBrand() {
  return (
    <Link
      className="flex shrink-0 items-center gap-3 rounded-md pr-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
      href="/ana-sayfa"
      prefetch
    >
      <div className="grid size-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-[0_8px_20px_rgba(37,99,235,0.18)]">
        LP
      </div>
      <div className="hidden min-w-0 lg:block">
        <p className="text-xs font-semibold uppercase text-primary">LemnixPRO</p>
        <p className="truncate text-sm font-semibold text-foreground">
          Üretim Kontrol Merkezi
        </p>
      </div>
    </Link>
  );
}

function TopNavigation({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Ana menü"
      className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
    >
      {workspaceNavigation.map((item) => (
        <WorkspaceNavItem
          item={item}
          key={item.href}
          mode="top"
          pathname={pathname}
        />
      ))}
    </nav>
  );
}

function WorkspaceNav({
  pathname
}: {
  pathname: string;
}) {
  return (
    <nav aria-label="Ana menü" className="grid gap-4">
      {workspaceNavigationGroups.map((group) => {
        const items = workspaceNavigation.filter((item) => item.group === group.id);

        return (
          <div className="grid gap-1" key={group.id}>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
              {group.label}
            </p>
            {items.map((item) => (
              <WorkspaceNavItem
                item={item}
                key={item.href}
                mode="sheet"
                pathname={pathname}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function WorkspaceNavItem({
  item,
  mode,
  pathname
}: {
  item: WorkspaceNavigationItem;
  mode: "sheet" | "top";
  pathname: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const Icon = iconByName[item.icon] ?? Home;
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const isTop = mode === "top";
  const warmRoute = () => {
    router.prefetch(item.href);
    prefetchWorkspaceRoute(queryClient, item.href);
  };
  const markNavigationStart = () => {
    warmRoute();

    if (process.env.NODE_ENV !== "production") {
      performance.mark("lemnix:navigation:start");
    }
  };

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/35",
        isTop &&
          "shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        !isTop && "text-foreground hover:bg-accent hover:text-accent-foreground",
        isActive &&
          isTop &&
          "bg-primary/10 text-primary hover:bg-primary/12 hover:text-primary",
        isActive && !isTop && "bg-primary text-primary-foreground"
      )}
      href={item.href}
      onClick={markNavigationStart}
      onFocus={warmRoute}
      onPointerEnter={warmRoute}
      prefetch
    >
      <Icon className="size-4 shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
      {isActive && isTop ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-primary"
        />
      ) : null}
    </Link>
  );
}

function BackgroundRefreshIndicator() {
  const fetchingCount = useIsFetching({
    predicate: (query) => isWorkspaceQueryKey(query.queryKey)
  });

  if (fetchingCount === 0) {
    return null;
  }

  return <InlineRefresh className="hidden py-1.5 lg:inline-flex" />;
}

function WorkspaceDataWarmup() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const run = () => {
      void prefetchWorkspaceWarmCache(queryClient);
    };
    const win = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
    };

    if (win.requestIdleCallback && win.cancelIdleCallback) {
      const idleId = win.requestIdleCallback(run, { timeout: 1500 });

      return () => win.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(run, 400);

    return () => globalThis.clearTimeout(timeoutId);
  }, [queryClient]);

  return null;
}

function isNavigationMetricsEnabled() {
  if (process.env.NEXT_PUBLIC_DEBUG_PERF === "1") {
    return true;
  }

  try {
    return globalThis.localStorage?.getItem("lemnix:nav-metrics") === "1";
  } catch {
    return false;
  }
}

function MobileNavigation({ pathname }: { pathname: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="md:hidden" size="icon" type="button" variant="outline">
          <Menu />
          <span className="sr-only">Menüyü aç</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-dvh w-screen max-w-[380px] flex-col bg-background p-0" side="left">
        <SheetHeader className="px-5 py-4">
          <SheetTitle>LemnixPRO</SheetTitle>
          <SheetDescription>Üretim kontrol navigasyonu</SheetDescription>
        </SheetHeader>
        <Separator />
        <ScrollArea className="flex-1 px-3 py-4">
          <WorkspaceNav pathname={pathname} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2" type="button" variant="outline">
          <span className="grid size-6 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">
            LP
          </span>
          <span className="hidden text-xs font-semibold md:inline">Operasyon</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="grid gap-1">
            <span>LemnixPRO</span>
            <span className="text-xs font-normal text-muted-foreground">
              Operasyon oturumu
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid gap-2 px-2 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>Cookie korumalı oturum</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Hazır</Badge>
            <span>Servis sınırları aktif</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-1">
          <LogoutButton />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function groupLabel(item?: WorkspaceNavigationItem) {
  if (!item) {
    return "Operasyon";
  }

  return (
    workspaceNavigationGroups.find((group) => group.id === item.group)?.label ??
    "Operasyon"
  );
}
