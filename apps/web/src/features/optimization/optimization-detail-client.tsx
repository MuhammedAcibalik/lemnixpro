"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CircleDashed,
  CircleX,
  Cpu,
  Loader2,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { OptimizationRequestDiagnosticsResponse } from "@lemnixpro/shared-contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isWorkspaceRequestError } from "@/lib/workspace-query";

import { optimizationQueries } from "./optimization-queries";
import { OptimizationResultDashboard } from "./optimization-result-dashboard";

type OptimizationDetailClientProps = {
  requestId: string;
};

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "failed_preparation",
  "failed_with_quality_floor"
]);

const INFEASIBLE_USER_HINT_TR = [
  "OR-Tools, bu talep için modeli «uygulanamaz» (INFEASIBLE) olarak sınıflandırdı: seçilen talep miktarları, stok uzunluğu, kerf ve renk güvenlik kırpması kuralları aynı anda sağlanamıyor.",
  "Çoğu zaman sebep: bir veya daha fazla parça, kullanılabilir stok boyundan (çıplak boy değil; önden–sondan kırpma çıktıktan sonra kalan kullanılabilir uzunluk + kerf) uzun kalıyor; veya uyumsuz ikincil çubuk / override.",
  "Ne deneyebilirsiniz: Enterprise optimizasyon adımında bu profilin stok çubuğu tanımını uzatın veya secondary bar ekleyin, kerfi kontrol edin, ilgili iş emirleriyle daha küçük bir alt küme seçerek tekrar dry-run/start yapın.",
  `Profil kodu mesaj içinde görünüyorsa doğrudan o satıra odaklanın (örnek: solverın verdiği "profile … (color …)" satırı).`
].join(" ");

export function OptimizationDetailClient({
  requestId
}: OptimizationDetailClientProps) {
  const statusQuery = useQuery({
    ...optimizationQueries.status(requestId),
    retry(failureCount, error) {
      if (
        isWorkspaceRequestError(error) &&
        (error.status === 401 || error.status === 404)
      ) {
        return false;
      }
      const msg = error instanceof Error ? error.message : String(error ?? "");
      if (msg.includes("Giriş sayfasına")) {
        return false;
      }
      return failureCount < 1;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2000;
      return TERMINAL_STATUSES.has(status) ? false : 2000;
    }
  });

  const status = statusQuery.data?.status ?? null;

  const diagnosticsQuery = useQuery({
    ...optimizationQueries.diagnostics(requestId),
    enabled: Boolean(status) && !TERMINAL_STATUSES.has(status ?? ""),
    retry: 0,
    refetchInterval: (query) => {
      const diagnosticStatus = query.state.data?.request.status ?? status;
      if (!diagnosticStatus) return 2000;
      return TERMINAL_STATUSES.has(diagnosticStatus) ? false : 2000;
    }
  });

  const resultQuery = useQuery({
    ...optimizationQueries.result(requestId),
    enabled: status === "completed" || status === "failed",
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      return data.status === "missing" ? 1500 : false;
    }
  });
  const { refetch: refetchResult } = resultQuery;

  useEffect(() => {
    if (status === "completed" || status === "failed") {
      void refetchResult();
    }
  }, [status, refetchResult]);

  const lastKnownStatus = statusQuery.data?.status ?? null;

  if (statusQuery.isError) {
    if (
      isWorkspaceRequestError(statusQuery.error) &&
      statusQuery.error.status === 404
    ) {
      return (
        <NotFoundView
          gatewayRequestId={statusQuery.error.requestId}
          requestId={requestId}
        />
      );
    }

    const message =
      statusQuery.error instanceof Error
        ? statusQuery.error.message
        : "Optimizasyon durumu güncellenemedi.";
    return (
      <div className="page-stack">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/enterprise-optimizasyon">
              <ArrowLeft className="size-4" /> Geri
            </Link>
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Durum doğrulanamıyor</AlertTitle>
          <AlertDescription className="grid gap-3 text-sm">
            <span>{message}</span>
            {lastKnownStatus ? (
              <span className="text-muted-foreground">
                Son başarılı yanıt:{" "}
                <strong className="text-foreground">{lastKnownStatus}</strong>
                . Oturum veya ağ kesildiyse bu artık güncel olmayabilir; &quot;Kuyruk&quot;
                ekranında takılı kalmış gibi görünebilir.
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-destructive/40"
              onClick={() => void statusQuery.refetch()}
            >
              Yeniden dene
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!status) {
    return (
      <ProgressView label="Optimizasyon durumu yükleniyor..." stage="prep" />
    );
  }

  if (status === "failed" || status === "failed_preparation") {
    const failureReasonCode =
      resultQuery.data?.failure?.reasonCode ??
      statusQuery.data?.failureReasonCode ??
      undefined;
    const failureReasonRaw =
      resultQuery.data?.failure?.reason ?? statusQuery.data?.failureReason;
    const message =
      status === "failed_preparation"
        ? "Talep hazırlığı sırasında doğrulama başarısız oldu."
        : resolveFailedOptimizationMessage(failureReasonRaw, failureReasonCode);
    return <FailureView title="Optimizasyon başarısız" message={message} />;
  }

  if (status === "failed_with_quality_floor") {
    return (
      <FailureView
        title="Kalite tabanı altında"
        message="En az bir profil için yapılandırılan minimum verimlilik eşiğinin altında plan üretildi. Eşiği düşürün veya stok kataloğunu gözden geçirin."
      />
    );
  }

  if (status === "cancelled") {
    return (
      <FailureView
        title="Optimizasyon iptal edildi"
        message={
          statusQuery.data?.failureReason ??
          "Bu talep daha yeni bir canonical optimizasyon isteği tarafından geçersiz kılındı. Kuyruktaki eski mesaj güvenli şekilde atlanacak."
        }
      />
    );
  }

  if (status !== "completed") {
    const stage =
      status === "running" ? "solving" : status === "queued" ? "queue" : "prep";
    return (
      <ProgressView
        stage={stage}
        label={statusLabel(status)}
        queueStallHint={status === "queued"}
        queuedAtFormatted={formatUtcHint(statusQuery.data?.queuedAt)}
        diagnostics={diagnosticsQuery.data ?? null}
      />
    );
  }

  if (
    resultQuery.isLoading ||
    !resultQuery.data ||
    resultQuery.data.status === "missing"
  ) {
    return <ProgressView stage="packaging" label="Sonuç paketleniyor..." />;
  }

  if (resultQuery.data.status === "failed" || !resultQuery.data.payload) {
    return (
      <FailureView
        title="Sonuç gözlenemedi"
        message={resolveFailedOptimizationMessage(
          resultQuery.data.failure?.reason,
          resultQuery.data.failure?.reasonCode ?? null
        )}
      />
    );
  }

  return (
    <OptimizationResultDashboard
      payload={resultQuery.data.payload}
      requestId={requestId}
    />
  );
}

type ProgressStage = "prep" | "queue" | "solving" | "packaging";

function formatUtcHint(
  raw: string | null | undefined
): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    return null;
  }
  const normalized = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)
    ? s.includes("T")
      ? s
      : s.replace(" ", "T")
    : s;
  const d = new Date(
    normalized.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}Z`
  );
  if (Number.isNaN(d.valueOf())) {
    return null;
  }
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(d);
}

function statusLabel(status: string): string {
  switch (status) {
    case "created":
      return "Talep oluşturuldu";
    case "ready":
      return "Hazır";
    case "queued":
      return "Kuyrukta bekliyor";
    case "running":
      return "OR-Tools çözümlüyor";
    case "cancelled":
      return "İptal edildi";
    case "completed":
      return "Tamamlandı";
    default:
      return status;
  }
}

function ProgressView({
  label,
  stage,
  queueStallHint = false,
  queuedAtFormatted = null,
  diagnostics = null
}: {
  label: string;
  stage: ProgressStage;
  /** True when API status is still `queued` (backlog or consumer not draining). */
  queueStallHint?: boolean;
  queuedAtFormatted?: string | null;
  diagnostics?: OptimizationRequestDiagnosticsResponse | null;
}) {
  const steps: Array<{ id: ProgressStage; label: string; icon: typeof Cpu }> = [
    { id: "prep", label: "Hazırlık", icon: Sparkles },
    { id: "queue", label: "Kuyruk", icon: CircleDashed },
    { id: "solving", label: "CP-SAT", icon: Cpu },
    { id: "packaging", label: "Paketleme", icon: ShieldCheck }
  ];

  const stageOrder: Record<ProgressStage, number> = {
    prep: 0,
    queue: 1,
    solving: 2,
    packaging: 3
  };
  const activeIndex = stageOrder[stage];

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/enterprise-optimizasyon">
            <ArrowLeft className="size-4" /> Geri
          </Link>
        </Button>
      </div>
      <div className="grid place-items-center rounded-lg border border-zinc-200 bg-white p-12 shadow-sm">
        <div className="relative grid size-24 place-items-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-blue-200/60" />
          <Loader2 className="relative size-12 animate-spin text-blue-600" />
        </div>
        <p className="mt-6 text-base font-medium text-zinc-700">{label}</p>
        <p className="mt-1 text-sm text-zinc-500">
          OR-Tools CP-SAT v9.15.6755 | hedef: en az stok bar, sonra en az fire.
        </p>
        {queueStallHint ? (
          <div className="mt-4 max-w-lg text-center text-xs leading-relaxed text-amber-900/90">
            {queuedAtFormatted ? (
              <p className="mb-3">
                Talep sıraya alındı:{" "}
                <strong className="text-foreground">{queuedAtFormatted}</strong>.
              </p>
            ) : null}
            <p className="mb-3">
              <strong>FIFO sıra:</strong>{" "}
              {diagnostics?.queue.activeBlockerRequestId ? (
                <>
                  Worker şu anda{" "}
                  <span className="font-mono">
                    {diagnostics.queue.activeBlockerRequestId}
                  </span>{" "}
                  talebini işliyor. Bu iş bitmeden yeni talep CP-SAT aşamasına
                  geçmez.
                </>
              ) : (
                <>
                  Talep RabbitMQ kuyruğunda claim edilmeyi bekliyor; worker mesajı
                  aldığında ekran otomatik CP-SAT aşamasına geçer.
                </>
              )}
            </p>
            {diagnostics?.queue.estimatedBlocker ? (
              <p className="mb-3">{diagnostics.queue.estimatedBlocker}</p>
            ) : null}
            <p className="mb-3">
              <strong>Motor kapalıysa:</strong> mesaj işlenmez. Tek süreç olarak{" "}
              <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-[11px]">
                pnpm dev
              </code>{" "}
              önerilir; aynı anda ikinci engine süreci başlatmayın.
            </p>
            <p>
              Claim mekanizması stale veya iptal edilmiş eski mesajları solve
              etmeden ACK eder; küçük yeni işler duplicate backlog yüzünden
              saatlerce bloklanmaz.
            </p>
          </div>
        ) : null}
        {diagnostics?.progress ? (
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            {diagnostics.progress.completedGroups}/{diagnostics.progress.totalGroups} profil grubu tamamlandı
            {diagnostics.progress.currentProfileCode
              ? ` · ${diagnostics.progress.currentProfileCode}`
              : ""}
          </div>
        ) : null}
        <div className="mt-8 flex items-center gap-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeIndex;
            const isCompleted = idx < activeIndex;
            return (
              <div className="flex items-center gap-3" key={step.id}>
                <div
                  className={`flex size-9 items-center justify-center rounded-full ${
                    isCompleted
                      ? "bg-emerald-500 text-white"
                      : isActive
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-200 text-zinc-500"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <span
                  className={
                    isActive
                      ? "text-sm font-medium text-zinc-900"
                      : "text-sm text-zinc-500"
                  }
                >
                  {step.label}
                </span>
                {idx < steps.length - 1 ? (
                  <ArrowRight className="size-4 text-zinc-300" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NotFoundView({
  gatewayRequestId,
  requestId
}: {
  gatewayRequestId: string | null;
  requestId: string;
}) {
  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/enterprise-optimizasyon">
            <ArrowLeft className="size-4" /> Geri
          </Link>
        </Button>
      </div>
      <Alert>
        <CircleDashed className="size-4" />
        <AlertTitle>Optimizasyon talebi bulunamadı</AlertTitle>
        <AlertDescription className="grid gap-3 text-sm leading-relaxed">
          <span>
            Bu ekranın bağlı olduğu talep orchestrator tarafında canonical olarak
            bulunmuyor. Büyük olasılıkla eski bir sekme, stale route veya daha
            önce başarısız olmuş bir create akışı bu ID ile açıldı.
          </span>
          <span className="text-muted-foreground">
            Talep ID: <span className="font-mono text-foreground">{requestId}</span>
            {gatewayRequestId ? (
              <>
                {" "}
                · Gateway request ID:{" "}
                <span className="font-mono text-foreground">
                  {gatewayRequestId}
                </span>
              </>
            ) : null}
          </span>
          <Button asChild className="w-fit" size="sm">
            <Link href="/enterprise-optimizasyon">Yeni talep oluştur</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function FailureView({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/enterprise-optimizasyon">
            <ArrowLeft className="size-4" /> Geri
          </Link>
        </Button>
      </div>
      <Alert variant="destructive">
        <CircleX className="size-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="whitespace-pre-line text-sm leading-relaxed">
          {message}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function resolveFailedOptimizationMessage(
  reasonRaw: string | null | undefined,
  reasonCode: string | null | undefined
): string {
  const raw = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  const codeNorm = typeof reasonCode === "string" ? reasonCode.trim().toLowerCase() : "";
  const inferredInfeasible =
    codeNorm === "infeasible" ||
    /\bINFEASIBLE\b/i.test(raw) ||
    /non-feasible status\s+INFEASIBLE/i.test(raw);

  if (inferredInfeasible) {
    const detail = raw.length > 0 ? raw : "(Motor ayrıntısı henüz yüklenemedi)";
    return `${INFEASIBLE_USER_HINT_TR}\n\n---\nTeknik özet:\n${detail}`;
  }

  return (
    raw ||
    "OR-Tools zinciri beklenmedik şekilde sonlandı; son hata metni görünmüyor. Sonucu yenilemeyi veya günlükte optimization.failed kaydını deneyin."
  );
}
