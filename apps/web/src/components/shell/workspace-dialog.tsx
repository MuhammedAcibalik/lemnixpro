"use client";

import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const workspaceDialogVariants = cva(
  "grid overflow-hidden p-0 shadow-xl sm:rounded-lg",
  {
    variants: {
      size: {
        sm: "w-[calc(100vw-1rem)] max-w-md",
        md: "w-[calc(100vw-1rem)] max-w-2xl",
        lg: "w-[calc(100vw-1rem)] max-w-5xl",
        workspace:
          "h-[100dvh] w-screen max-w-none rounded-none sm:h-[92dvh] sm:w-[96vw] sm:max-w-[1680px]"
      }
    },
    defaultVariants: {
      size: "md"
    }
  }
);

type WorkspaceDialogContentProps = ComponentProps<typeof DialogContent> &
  VariantProps<typeof workspaceDialogVariants>;

function WorkspaceDialogContent({
  className,
  size,
  ...props
}: WorkspaceDialogContentProps) {
  return (
    <DialogContent
      className={cn(workspaceDialogVariants({ size }), className)}
      {...props}
    />
  );
}

function WorkspaceDialogHeader({
  className,
  ...props
}: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn(
        "sticky top-0 z-10 border-b bg-card px-5 py-4 text-left",
        className
      )}
      {...props}
    />
  );
}

function WorkspaceDialogBody({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 overflow-auto px-5 py-4", className)}
      data-slot="workspace-dialog-body"
      {...props}
    />
  );
}

function WorkspaceDialogFooter({
  className,
  ...props
}: ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn("sticky bottom-0 border-t bg-card px-5 py-4", className)}
      {...props}
    />
  );
}

type WorkspaceDialogTitleBlockProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
};

function WorkspaceDialogTitleBlock({
  aside,
  description,
  eyebrow,
  title
}: WorkspaceDialogTitleBlockProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase text-primary">
            {eyebrow}
          </p>
        ) : null}
        <DialogTitle className="truncate text-base font-semibold">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="mt-1">{description}</DialogDescription>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export {
  Dialog as WorkspaceDialog,
  WorkspaceDialogBody,
  WorkspaceDialogContent,
  WorkspaceDialogFooter,
  WorkspaceDialogHeader,
  WorkspaceDialogTitleBlock
};
