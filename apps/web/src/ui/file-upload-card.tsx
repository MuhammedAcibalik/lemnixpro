"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileUploadCardProps = {
  action: (formData: FormData) => void | Promise<void>;
  accept?: string;
  buttonLabel: string;
  helpText?: string;
  name?: string;
  title: string;
  compact?: boolean;
};

export function FileUploadCard({
  action,
  accept = ".xlsx",
  buttonLabel,
  name = "file",
  title,
  compact = false
}: FileUploadCardProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileLabel, setFileLabel] = useState<string>("Dosya seçilmedi");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action={action}
      className={cn(
        "flex flex-wrap items-center gap-2",
        !compact && "rounded-md border bg-muted/30 p-3"
      )}
      ref={formRef}
    >
      <input
        accept={accept}
        aria-label={title}
        className="sr-only"
        name={name}
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0];

          if (!selectedFile) {
            setFileLabel("Dosya seçilmedi");
            return;
          }

          setFileLabel(
            `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB`
          );
          setIsSubmitting(true);
          window.setTimeout(() => formRef.current?.requestSubmit(), 0);
        }}
        ref={inputRef}
        required
        type="file"
      />
      <Button
        disabled={isSubmitting}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Upload />
        {isSubmitting ? "Yükleniyor..." : buttonLabel}
      </Button>
      {compact ? (
        <span className="sr-only">{fileLabel}</span>
      ) : (
        <span className="text-sm text-muted-foreground" title={title}>
          {fileLabel}
        </span>
      )}
    </form>
  );
}
