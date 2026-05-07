"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { WorkspaceNavigationItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { prefetchWorkspaceRoute } from "@/lib/workspace-query";

type CommandSearchProps = {
  items: WorkspaceNavigationItem[];
  className?: string;
};

export function CommandSearch({ className, items }: CommandSearchProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const matches = useMemo(() => {
    if (!normalizedQuery) {
      return items.slice(0, 5);
    }

    return items
      .filter((item) => {
        const haystack = [
          item.label,
          item.description,
          item.group,
          ...(item.keywords ?? [])
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        return haystack.includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [items, normalizedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  const activeItem = matches[activeIndex];
  const activeOptionId =
    isOpen && activeItem ? `${listboxId}-${activeItem.href}` : undefined;

  function warmItem(item: WorkspaceNavigationItem) {
    router.prefetch(item.href);
    prefetchWorkspaceRoute(queryClient, item.href);
  }

  function navigateTo(item: WorkspaceNavigationItem) {
    warmItem(item);
    setIsOpen(false);
    setQuery("");

    if (process.env.NODE_ENV !== "production") {
      performance.mark("lemnix:navigation:start");
    }

    router.push(item.href);
  }

  return (
    <div
      className={cn("relative hidden w-full max-w-sm xl:block", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label="Modül ara"
        className="h-9 bg-muted/45 pl-9 shadow-none"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          if (activeItem) {
            warmItem(activeItem);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) =>
              matches.length === 0 ? 0 : Math.min(current + 1, matches.length - 1)
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
          }

          if (event.key === "Enter" && activeItem) {
            event.preventDefault();
            navigateTo(activeItem);
          }
        }}
        placeholder="Modül ara..."
        role="combobox"
        type="search"
        value={query}
      />
      {isOpen ? (
        <div
          className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
          id={listboxId}
          role="listbox"
        >
          <div className="grid p-1">
            {matches.map((item, index) => {
              const isActive = index === activeIndex;

              return (
                <Link
                  aria-selected={isActive}
                  className={cn(
                    "grid gap-0.5 rounded-md px-3 py-2 text-sm outline-none transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                  href={item.href}
                  id={`${listboxId}-${item.href}`}
                  key={item.href}
                  onClick={() => {
                    if (process.env.NODE_ENV !== "production") {
                      performance.mark("lemnix:navigation:start");
                    }
                    setIsOpen(false);
                    setQuery("");
                  }}
                  onFocus={() => {
                    setActiveIndex(index);
                    warmItem(item);
                  }}
                  onPointerEnter={() => {
                    setActiveIndex(index);
                    warmItem(item);
                  }}
                  prefetch
                  role="option"
                >
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </Link>
              );
            })}
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground" role="status">
                Eşleşen modül bulunamadı.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
