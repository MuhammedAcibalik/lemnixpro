"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Workflow
} from "lucide-react";

import {
  COLOR_SAFETY_MARGIN_POLICIES,
  DEFAULT_OPTIMIZATION_CONFIG,
  classifyMaterialColor,
  type CutListSnapshotDetail,
  type OptimizationConfig,
  type OptimizationProfileGroupOverride,
  type OptimizationStockBar
} from "@lemnixpro/shared-contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  postOptimizationDryRun,
  postOptimizationFromSnapshot
} from "./optimization-queries";

type OptimizationWizardProps = {
  detail: CutListSnapshotDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProfileGroupDraft = {
  mainProfileId: string;
  mainProfileCode: string;
  mainProfileName: string;
  materialColor: string;
  materialColorClass: "painted" | "anodized";
  workOrderNumbers: string[];
  cuttingLineCount: number;
  totalPieceLengthMm: number;
  primaryStockLengthMm: number;
  secondaryStockLengthMm: number | null;
  displayCode: string;
  displayName: string;
};

type Step = "select" | "configure" | "submitting";

function buildGroupKey(profileCode: string, color: string): string {
  return `${profileCode.toUpperCase()}::${classifyMaterialColor(color)}`;
}

function buildInitialGroups(
  detail: CutListSnapshotDetail
): Map<string, ProfileGroupDraft> {
  const drafts = new Map<string, ProfileGroupDraft>();

  for (const item of detail.items) {
    const colorClass = classifyMaterialColor(item.materialColor);

    for (const cuttingLine of item.cuttingLines) {
      const key = buildGroupKey(cuttingLine.profileCode, item.materialColor);
      const length = cuttingLine.cuttingLengthMm * cuttingLine.cuttingQuantity;
      const existing = drafts.get(key);
      if (existing) {
        if (item.workOrderNumber && !existing.workOrderNumbers.includes(item.workOrderNumber)) {
          existing.workOrderNumbers.push(item.workOrderNumber);
        }
        existing.cuttingLineCount += 1;
        existing.totalPieceLengthMm += length;
      } else {
        drafts.set(key, {
          mainProfileId: cuttingLine.profileCode,
          mainProfileCode: cuttingLine.profileCode,
          mainProfileName: cuttingLine.profileName,
          materialColor: item.materialColor,
          materialColorClass: colorClass,
          workOrderNumbers: item.workOrderNumber ? [item.workOrderNumber] : [],
          cuttingLineCount: 1,
          totalPieceLengthMm: length,
          primaryStockLengthMm: cuttingLine.stockLengthMm,
          secondaryStockLengthMm: null,
          displayCode: cuttingLine.profileCode,
          displayName: cuttingLine.profileName
        });
      }
    }
  }

  return drafts;
}

export function OptimizationWizard({
  detail,
  open,
  onOpenChange
}: OptimizationWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [groups, setGroups] = useState<Map<string, ProfileGroupDraft>>(() =>
    buildInitialGroups(detail)
  );
  const [selectedWorkOrders, setSelectedWorkOrders] = useState<Set<string>>(() => {
    const all = new Set<string>();
    for (const item of detail.items) {
      if (item.workOrderNumber) {
        all.add(item.workOrderNumber);
      }
    }
    return all;
  });
  const [allWorkOrdersSelected, setAllWorkOrdersSelected] = useState<boolean>(true);
  const [config, setConfig] = useState<OptimizationConfig>({
    ...DEFAULT_OPTIMIZATION_CONFIG
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const allWorkOrders = useMemo(() => {
    const acc = new Set<string>();
    for (const item of detail.items) {
      if (item.workOrderNumber) {
        acc.add(item.workOrderNumber);
      }
    }
    return Array.from(acc).sort();
  }, [detail.items]);

  const groupList = useMemo(() => Array.from(groups.values()), [groups]);

  const submitMutation = useMutation({
    mutationFn: () => {
      const overrides = buildOverrides(groupList);
      return postOptimizationFromSnapshot({
        cutListSnapshotId: detail.snapshot.id,
        selectedWorkOrderNumbers: allWorkOrdersSelected
          ? "ALL"
          : Array.from(selectedWorkOrders),
        overrides,
        config
      });
    },
    onSuccess: (response) => {
      onOpenChange(false);
      router.push(`/enterprise-optimizasyon/${response.request.id}`);
    },
    onError: (error: unknown) => {
      setSubmitError(error instanceof Error ? error.message : "Bilinmeyen hata.");
      setStep("configure");
    }
  });

  const dryRunMutation = useMutation({
    mutationFn: () => {
      const overrides = buildOverrides(groupList);
      return postOptimizationDryRun({
        cutListSnapshotId: detail.snapshot.id,
        selectedWorkOrderNumbers: allWorkOrdersSelected
          ? "ALL"
          : Array.from(selectedWorkOrders),
        overrides,
        config
      });
    }
  });

  function updateGroup(
    key: string,
    updater: (draft: ProfileGroupDraft) => ProfileGroupDraft
  ) {
    setGroups((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (!existing) return prev;
      next.set(key, updater({ ...existing }));
      return next;
    });
  }

  function toggleWorkOrder(workOrder: string) {
    setSelectedWorkOrders((prev) => {
      const next = new Set(prev);
      if (next.has(workOrder)) {
        next.delete(workOrder);
      } else {
        next.add(workOrder);
      }
      setAllWorkOrdersSelected(next.size === allWorkOrders.length);
      return next;
    });
  }

  function toggleAllWorkOrders() {
    if (allWorkOrdersSelected) {
      setSelectedWorkOrders(new Set());
      setAllWorkOrdersSelected(false);
    } else {
      setSelectedWorkOrders(new Set(allWorkOrders));
      setAllWorkOrdersSelected(true);
    }
  }

  function moveToConfigure() {
    setSubmitError(null);
    void dryRunMutation.mutate();
    setStep("configure");
  }

  function handleSubmit() {
    setStep("submitting");
    submitMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="size-5 text-primary" />
            Enterprise Optimizasyon — {detail.snapshot.planYear} / Hafta{" "}
            {detail.snapshot.weekNumber}
          </DialogTitle>
          <DialogDescription>
            OR-Tools CP-SAT solver. Düzenlemeleriniz session-level override olarak
            uygulanır; master data ve snapshot değişmez.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} onValueChange={(value) => setStep(value as Step)}>
          <TabsList>
            <TabsTrigger value="select">1. Seçim &amp; Düzenleme</TabsTrigger>
            <TabsTrigger value="configure" disabled={groupList.length === 0}>
              2. Yapılandırma
            </TabsTrigger>
          </TabsList>

          <TabsContent value="select">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">
                  Profil grupları (renk sınıfına göre)
                </h3>
                <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-2">
                  {groupList.map((group) => {
                    const key = buildGroupKey(
                      group.mainProfileCode,
                      group.materialColor
                    );
                    const policy = COLOR_SAFETY_MARGIN_POLICIES[group.materialColorClass];
                    const usable =
                      group.primaryStockLengthMm - policy.frontTrimMm - policy.endTrimMm;
                    return (
                      <div
                        className="rounded-md border border-zinc-200 bg-white p-3"
                        key={key}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-sm font-semibold">
                              {group.mainProfileCode}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {group.mainProfileName}
                            </div>
                          </div>
                          <Badge
                            variant={
                              group.materialColorClass === "anodized"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {group.materialColorClass === "anodized"
                              ? `${group.materialColor} (Eloksal)`
                              : group.materialColor || "Boyalı"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor={`${key}-stock`} className="text-xs">
                              Birincil stok (mm)
                            </Label>
                            <Input
                              id={`${key}-stock`}
                              type="number"
                              min={1}
                              value={group.primaryStockLengthMm}
                              onChange={(event) =>
                                updateGroup(key, (draft) => ({
                                  ...draft,
                                  primaryStockLengthMm:
                                    Number(event.target.value) || draft.primaryStockLengthMm
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`${key}-secondary`}
                              className="text-xs"
                            >
                              İkincil stok (mm, opsiyonel)
                            </Label>
                            <div className="flex items-center gap-1">
                              <Input
                                id={`${key}-secondary`}
                                type="number"
                                min={0}
                                value={group.secondaryStockLengthMm ?? ""}
                                placeholder="—"
                                onChange={(event) =>
                                  updateGroup(key, (draft) => ({
                                    ...draft,
                                    secondaryStockLengthMm: event.target.value
                                      ? Number(event.target.value)
                                      : null
                                  }))
                                }
                              />
                              {group.secondaryStockLengthMm != null ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    updateGroup(key, (draft) => ({
                                      ...draft,
                                      secondaryStockLengthMm: null
                                    }))
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    updateGroup(key, (draft) => ({
                                      ...draft,
                                      secondaryStockLengthMm:
                                        draft.primaryStockLengthMm
                                    }))
                                  }
                                >
                                  <Plus className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${key}-code`} className="text-xs">
                              Görünen profil kodu
                            </Label>
                            <Input
                              id={`${key}-code`}
                              value={group.displayCode}
                              onChange={(event) =>
                                updateGroup(key, (draft) => ({
                                  ...draft,
                                  displayCode: event.target.value
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${key}-name`} className="text-xs">
                              Görünen profil adı
                            </Label>
                            <Input
                              id={`${key}-name`}
                              value={group.displayName}
                              onChange={(event) =>
                                updateGroup(key, (draft) => ({
                                  ...draft,
                                  displayName: event.target.value
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                          <span>İş emri: {group.workOrderNumbers.length}</span>
                          <span>Kesim satırı: {group.cuttingLineCount}</span>
                          <span>
                            Toplam üretim: {group.totalPieceLengthMm.toLocaleString("tr-TR")} mm
                          </span>
                          <span>
                            Güvenlik payı: {policy.frontTrimMm}+{policy.endTrimMm} mm →
                            kullanılabilir {usable.toLocaleString("tr-TR")} mm
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">İş emri seçimi</h3>
                <div className="rounded-md border border-zinc-200 bg-white p-3">
                  <label className="flex items-center gap-2 border-b border-zinc-200 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allWorkOrdersSelected}
                      onChange={toggleAllWorkOrders}
                    />
                    <span className="font-medium">Tümünü seç</span>
                    <span className="text-zinc-500">({allWorkOrders.length})</span>
                  </label>
                  <div className="max-h-[45vh] overflow-y-auto pt-2">
                    {allWorkOrders.map((workOrder) => (
                      <label
                        className="flex items-center gap-2 py-1 text-sm"
                        key={workOrder}
                      >
                        <input
                          type="checkbox"
                          checked={
                            allWorkOrdersSelected ||
                            selectedWorkOrders.has(workOrder)
                          }
                          onChange={() => toggleWorkOrder(workOrder)}
                        />
                        <span className="font-mono">{workOrder}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Vazgeç
              </Button>
              <Button onClick={moveToConfigure} disabled={groupList.length === 0}>
                Devam <ArrowRight className="ml-1 size-4" />
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="configure">
            <div className="space-y-4">
              <Alert>
                <Settings2 className="size-4" />
                <AlertTitle>Solver yapılandırması</AlertTitle>
                <AlertDescription>
                  Lex hedef: önce minimum stok bar adedi, sonra minimum fire (mm).
                  Tek algoritma: OR-Tools CP-SAT v9.15.6755.
                </AlertDescription>
              </Alert>
              {dryRunMutation.data ? (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs sm:grid-cols-4">
                  <SummaryStat
                    label="Profil grubu"
                    value={dryRunMutation.data.totalProfileGroups}
                  />
                  <SummaryStat
                    label="Talep satırı"
                    value={dryRunMutation.data.totalDemandItems}
                  />
                  <SummaryStat
                    label="Toplam parça"
                    value={dryRunMutation.data.totalCuttingPieces}
                  />
                  <SummaryStat
                    label="Üretim metresi"
                    value={`${(dryRunMutation.data.totalProductivePieceLengthMm / 1000).toLocaleString("tr-TR")} m`}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ConfigField
                  label="Kerf payı (mm)"
                  value={config.kerfMm}
                  onChange={(value) =>
                    setConfig((prev) => ({ ...prev, kerfMm: value }))
                  }
                  hint="Bıçak ağzı kalınlığı, parçalar arasında düşülür."
                />
                <ConfigField
                  label="Min. yeniden kullanılabilir artık (mm)"
                  value={config.minReusableScrapMm}
                  onChange={(value) =>
                    setConfig((prev) => ({ ...prev, minReusableScrapMm: value }))
                  }
                  hint="Bu eşiğin altındaki kalan hurdaya yazılır."
                />
                <ConfigField
                  label="Solver zaman limiti (sn)"
                  value={config.solverTimeLimitSec}
                  onChange={(value) =>
                    setConfig((prev) => ({ ...prev, solverTimeLimitSec: value }))
                  }
                  hint="Üst sınır. Çoğu zaman daha hızlı bitirir."
                />
                <ConfigField
                  label="Rastgelelik tohumu"
                  value={config.randomSeed}
                  onChange={(value) =>
                    setConfig((prev) => ({ ...prev, randomSeed: value }))
                  }
                  hint="Aynı tohum + aynı snapshot = byte-identical sonuç."
                />
                <ConfigField
                  label="Min. profil verimliliği (%, opsiyonel)"
                  value={config.minProfileEfficiencyPct ?? 0}
                  onChange={(value) =>
                    setConfig((prev) => ({
                      ...prev,
                      minProfileEfficiencyPct: value > 0 ? value : null
                    }))
                  }
                  hint="Bu eşiğin altında kalan plan reddedilir."
                />
                <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white p-3">
                  <input
                    type="checkbox"
                    id="allow-mixing"
                    checked={config.allowMixingStockBars}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        allowMixingStockBars: event.target.checked
                      }))
                    }
                  />
                  <Label htmlFor="allow-mixing" className="text-sm">
                    Birincil + ikincil stok aynı çözümde karıştırılabilsin
                  </Label>
                </div>
              </div>
            </div>

            {submitError ? (
              <Alert className="mt-4" variant="destructive">
                <AlertTitle>Optimizasyon başlatılamadı</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setStep("select")}>
                Geri
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || step === "submitting"}
              >
                {submitMutation.isPending || step === "submitting" ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" /> Başlatılıyor…
                  </>
                ) : (
                  <>
                    Optimizasyonu başlat <ArrowRight className="ml-1 size-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function buildOverrides(
  drafts: ProfileGroupDraft[]
): OptimizationProfileGroupOverride[] {
  return drafts.map((group) => {
    const stockBars: OptimizationStockBar[] = [
      { lengthMm: group.primaryStockLengthMm, role: "primary" }
    ];
    if (group.secondaryStockLengthMm && group.secondaryStockLengthMm > 0) {
      stockBars.push({
        lengthMm: group.secondaryStockLengthMm,
        role: "secondary"
      });
    }
    return {
      mainProfileId: group.mainProfileId,
      stockBars,
      displayCode: group.displayCode,
      displayName: group.displayName
    };
  });
}

function ConfigField({
  label,
  value,
  onChange,
  hint
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <div className="space-y-1 rounded-md border border-zinc-200 bg-white p-3">
      <Label className="text-xs font-semibold text-zinc-700">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function SummaryStat({
  label,
  value
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold text-zinc-900">
        {value}
      </div>
    </div>
  );
}
