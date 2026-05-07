"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CheckCircle2,
  Filter,
  Plus,
  Search,
  Trash2
} from "lucide-react";

import {
  WorkspaceDialog,
  WorkspaceDialogBody,
  WorkspaceDialogContent,
  WorkspaceDialogFooter,
  WorkspaceDialogHeader,
  WorkspaceDialogTitleBlock
} from "@/components/shell/workspace-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/ui/empty-state";
import { FileUploadCard } from "@/ui/file-upload-card";
import { InlineRefresh } from "@/ui/inline-refresh";
import { StatusBadge } from "@/ui/status-badge";

import {
  importMainProfiles,
  saveMainProfileProductGroup
} from "./import-actions";
import { ProductGroupCard, type ProductGroup } from "./product-group-card";

type EditableCuttingSpec = {
  id?: string;
  cuttingCode: string;
  cuttingName: string;
  cuttingLengthMm: number;
  unitQuantity: number;
  unitName: string;
};

type EditableProfile = {
  id?: string;
  code: string;
  name: string;
  stockLengthMm: number;
  isActive: boolean;
  cuttingSpecs: EditableCuttingSpec[];
};

type EditableProductGroup = {
  productCode: string;
  productName: string;
  profiles: EditableProfile[];
};

type ProfileManagementClientProps = {
  isFetching?: boolean;
  productGroups: ProductGroup[];
};

const filterLabels = [
  "Tümü",
  "Aktif",
  "Pasif",
  "Kesim Yok",
  "Ölçü = 0",
  "Stok Yok",
  "Profil Yok",
  "Çoklu Stok"
] as const;

export function ProfileManagementClient({
  isFetching = false,
  productGroups
}: ProfileManagementClientProps) {
  const [editingGroup, setEditingGroup] = useState<EditableProductGroup | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<(typeof filterLabels)[number]>("Tümü");

  const filteredGroups = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("tr-TR");

    return productGroups.filter((group) => {
      const matchesQuery =
        !normalized ||
        `${group.productCode} ${group.productName}`
          .toLocaleLowerCase("tr-TR")
          .includes(normalized);
      const hasActive = group.profiles.some((profile) => profile.isActive);

      if (activeFilter === "Aktif") {
        return matchesQuery && hasActive;
      }

      if (activeFilter === "Pasif") {
        return matchesQuery && !hasActive;
      }

      if (activeFilter === "Kesim Yok") {
        return (
          matchesQuery &&
          group.profiles.every((profile) => profile.cuttingSpecs.length === 0)
        );
      }

      if (activeFilter === "Ölçü = 0") {
        return (
          matchesQuery &&
          group.profiles.some((profile) =>
            profile.cuttingSpecs.some((spec) => spec.cuttingLengthMm === 0)
          )
        );
      }

      if (activeFilter === "Stok Yok") {
        return (
          matchesQuery &&
          group.profiles.some((profile) => profile.stockLengthMm <= 0)
        );
      }

      if (activeFilter === "Profil Yok") {
        return matchesQuery && group.profiles.length === 0;
      }

      if (activeFilter === "Çoklu Stok") {
        return (
          matchesQuery &&
          new Set(group.profiles.map((profile) => profile.stockLengthMm)).size > 1
        );
      }

      return matchesQuery;
    });
  }, [activeFilter, productGroups, searchQuery]);

  return (
    <>
      <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="gap-4 border-b bg-muted/30">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase text-primary">
                Master data
              </p>
              <CardTitle className="mt-1">Profil Yönetimi</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Ana ürün, profil ve düz kesim tanımlarını tek çalışma yüzeyinde yönetin.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isFetching ? <InlineRefresh /> : null}
              <StatusBadge tone="info">Ana ürünler</StatusBadge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.4fr)_auto] xl:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Ürün kodu veya adı ile ara"
                className="pl-9"
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Ürün kodu veya adı ile ara..."
                type="search"
                value={searchQuery}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Filter className="size-3.5" />
                Filtre
              </span>
              {filterLabels.map((filter) => (
                <Button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  size="sm"
                  type="button"
                  variant={activeFilter === filter ? "default" : "outline"}
                >
                  {filter}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button onClick={() => setEditingGroup(createEmptyProductGroup())} type="button">
                <Plus />
                Yeni Ürün
              </Button>
              <FileUploadCard
                action={importMainProfiles}
                buttonLabel="Excel'den yükle"
                compact
                title="Profil Yönetimi Excel"
              />
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyState
              description="Arama veya filtreye uygun profil verisi bulunamadı."
              title="Kayıt yok"
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredGroups.map((group) => (
                <ProductGroupCard
                  group={group}
                  key={group.productCode}
                  onEdit={() => setEditingGroup(toEditableGroup(group))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editingGroup ? (
        <ProfileEditDialog
          group={editingGroup}
          onChange={setEditingGroup}
          onClose={() => setEditingGroup(null)}
        />
      ) : null}
    </>
  );
}

function ProfileEditDialog({
  group,
  onChange,
  onClose
}: {
  group: EditableProductGroup;
  onChange: (group: EditableProductGroup) => void;
  onClose: () => void;
}) {
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const activeProfile = group.profiles[activeProfileIndex] ?? group.profiles[0];
  const cuttingCount = group.profiles.reduce(
    (total, profile) => total + profile.cuttingSpecs.length,
    0
  );
  const payload = useMemo(() => JSON.stringify(group), [group]);

  function updateGroup(patch: Partial<EditableProductGroup>) {
    onChange({ ...group, ...patch });
  }

  function updateProfile(index: number, patch: Partial<EditableProfile>) {
    onChange({
      ...group,
      profiles: group.profiles.map((profile, profileIndex) =>
        profileIndex === index ? { ...profile, ...patch } : profile
      )
    });
  }

  function updateCuttingSpec(
    profileIndex: number,
    specIndex: number,
    patch: Partial<EditableCuttingSpec>
  ) {
    onChange({
      ...group,
      profiles: group.profiles.map((profile, currentProfileIndex) =>
        currentProfileIndex === profileIndex
          ? {
              ...profile,
              cuttingSpecs: profile.cuttingSpecs.map((spec, currentSpecIndex) =>
                currentSpecIndex === specIndex ? { ...spec, ...patch } : spec
              )
            }
          : profile
      )
    });
  }

  function addProfile() {
    onChange({
      ...group,
      profiles: [...group.profiles, createEmptyProfile()]
    });
    setActiveProfileIndex(group.profiles.length);
  }

  function addCuttingSpec() {
    if (!activeProfile) {
      return;
    }

    updateProfile(activeProfileIndex, {
      cuttingSpecs: [...activeProfile.cuttingSpecs, createEmptyCuttingSpec()]
    });
  }

  function removeCuttingSpec(specIndex: number) {
    if (!activeProfile) {
      return;
    }

    updateProfile(activeProfileIndex, {
      cuttingSpecs: activeProfile.cuttingSpecs.filter(
        (_spec, currentSpecIndex) => currentSpecIndex !== specIndex
      )
    });
  }

  return (
    <WorkspaceDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <WorkspaceDialogContent size="workspace">
        <form
          action={saveMainProfileProductGroup}
          className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto]"
        >
          <input name="payload" type="hidden" value={payload} />
          <WorkspaceDialogHeader>
            <WorkspaceDialogTitleBlock
              aside={
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="info">Profil: {group.profiles.length}</StatusBadge>
                  <StatusBadge tone="success">Kesim: {cuttingCount}</StatusBadge>
                </div>
              }
              description="Ana ürün, profil tipi ve kesim ölçülerini tek operasyon akışı içinde düzenleyin."
              eyebrow="Ana ürünü düzenle"
              title={group.productCode || "Yeni Ana Ürün"}
            />
          </WorkspaceDialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b bg-card px-5 py-3 text-xs font-semibold text-muted-foreground">
            <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">Ürün Bilgileri</span>
            <span>Profil Tipleri</span>
            <span>Kesim Ölçüleri</span>
          </div>

          <WorkspaceDialogBody className="grid gap-4 bg-background">
            <Card>
              <CardHeader className="border-b bg-muted/30">
                <CardTitle>Ana ürün bilgileri</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="productCode">Ürün kodu</Label>
                  <Input
                    id="productCode"
                    onChange={(event) =>
                      updateGroup({ productCode: event.currentTarget.value })
                    }
                    required
                    value={group.productCode}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="productName">Ürün adı</Label>
                  <Input
                    id="productName"
                    onChange={(event) =>
                      updateGroup({ productName: event.currentTarget.value })
                    }
                    required
                    value={group.productName}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Profil tipleri</CardTitle>
                <Button onClick={addProfile} type="button">
                  <Plus />
                  Profil tipi ekle
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {group.profiles.map((profile, index) => (
                    <button
                      className={`grid gap-1 rounded-md border border-l-4 bg-card p-3 text-left transition-colors hover:bg-accent ${
                        index === activeProfileIndex
                          ? "border-l-primary"
                          : "border-l-border"
                      }`}
                      key={profile.id ?? index}
                      onClick={() => setActiveProfileIndex(index)}
                      type="button"
                    >
                      <strong>{profile.name || "Yeni Profil"}</strong>
                      <span className="text-sm text-muted-foreground">
                        {profile.code || "Kod yok"}
                      </span>
                      <small className="text-muted-foreground">
                        {profile.cuttingSpecs.length} kesim
                      </small>
                    </button>
                  ))}
                </div>

                {activeProfile ? (
                  <div className="grid gap-3 rounded-md border bg-muted/25 p-3 md:grid-cols-[180px_minmax(240px,1fr)_160px_120px]">
                    <div className="grid gap-2">
                      <Label htmlFor="profileCode">Profil kodu</Label>
                      <Input
                        id="profileCode"
                        onChange={(event) =>
                          updateProfile(activeProfileIndex, {
                            code: event.currentTarget.value
                          })
                        }
                        required
                        value={activeProfile.code}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="profileName">Profil adı</Label>
                      <Input
                        id="profileName"
                        onChange={(event) =>
                          updateProfile(activeProfileIndex, {
                            name: event.currentTarget.value
                          })
                        }
                        required
                        value={activeProfile.name}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="stockLength">Stok boyu (mm)</Label>
                      <Input
                        id="stockLength"
                        min={1}
                        onChange={(event) =>
                          updateProfile(activeProfileIndex, {
                            stockLengthMm: Number(event.currentTarget.value)
                          })
                        }
                        required
                        type="number"
                        value={activeProfile.stockLengthMm}
                      />
                    </div>
                    <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-muted-foreground">
                      <input
                        checked={activeProfile.isActive}
                        onChange={(event) =>
                          updateProfile(activeProfileIndex, {
                            isActive: event.currentTarget.checked
                          })
                        }
                        type="checkbox"
                      />
                      Aktif
                    </label>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {activeProfile ? (
              <Card>
                <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>Düz kesim ölçüleri</CardTitle>
                  <Button onClick={addCuttingSpec} type="button">
                    <Plus />
                    Kesim ölçüsü ekle
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="overflow-x-auto rounded-md border">
                    <div className="min-w-[940px]">
                      <div className="grid grid-cols-[170px_minmax(240px,1fr)_110px_120px_110px_80px] gap-2 border-b bg-muted/65 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
                        <span>Kesim kodu</span>
                        <span>Kesim adı</span>
                        <span>Ölçü</span>
                        <span>Birim adet</span>
                        <span>Birim</span>
                        <span>İşlem</span>
                      </div>
                      {activeProfile.cuttingSpecs.map((spec, specIndex) => (
                        <div
                          className="grid grid-cols-[170px_minmax(240px,1fr)_110px_120px_110px_80px] gap-2 border-b px-3 py-2 last:border-b-0"
                          key={spec.id ?? specIndex}
                        >
                          <Input
                            aria-label="Kesim kodu"
                            onChange={(event) =>
                              updateCuttingSpec(activeProfileIndex, specIndex, {
                                cuttingCode: event.currentTarget.value
                              })
                            }
                            required
                            value={spec.cuttingCode}
                          />
                          <Input
                            aria-label="Kesim adı"
                            onChange={(event) =>
                              updateCuttingSpec(activeProfileIndex, specIndex, {
                                cuttingName: event.currentTarget.value
                              })
                            }
                            required
                            value={spec.cuttingName}
                          />
                          <Input
                            aria-label="Ölçü"
                            min={1}
                            onChange={(event) =>
                              updateCuttingSpec(activeProfileIndex, specIndex, {
                                cuttingLengthMm: Number(event.currentTarget.value)
                              })
                            }
                            required
                            type="number"
                            value={spec.cuttingLengthMm}
                          />
                          <Input
                            aria-label="Birim adet"
                            min={0.001}
                            onChange={(event) =>
                              updateCuttingSpec(activeProfileIndex, specIndex, {
                                unitQuantity: Number(event.currentTarget.value)
                              })
                            }
                            required
                            step="0.001"
                            type="number"
                            value={spec.unitQuantity}
                          />
                          <Input
                            aria-label="Birim"
                            onChange={(event) =>
                              updateCuttingSpec(activeProfileIndex, specIndex, {
                                unitName: event.currentTarget.value
                              })
                            }
                            required
                            value={spec.unitName}
                          />
                          <Button
                            aria-label="Kesim ölçüsünü sil"
                            onClick={() => removeCuttingSpec(specIndex)}
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </WorkspaceDialogBody>

          <WorkspaceDialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              İptal
            </Button>
            <SaveProfileButton />
          </WorkspaceDialogFooter>
        </form>
      </WorkspaceDialogContent>
    </WorkspaceDialog>
  );
}

function SaveProfileButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <CheckCircle2 />
      {pending ? "Kaydediliyor..." : "Kaydet"}
    </Button>
  );
}

function toEditableGroup(group: ProductGroup): EditableProductGroup {
  return {
    productCode: group.productCode,
    productName: group.productName,
    profiles: group.profiles.map((profile) => ({
      id: profile.id,
      code: profile.code,
      name: profile.name,
      stockLengthMm: profile.stockLengthMm,
      isActive: profile.isActive,
      cuttingSpecs: profile.cuttingSpecs.map((spec) => ({
        id: spec.id,
        cuttingCode: spec.cuttingCode,
        cuttingName: spec.cuttingName,
        cuttingLengthMm: spec.cuttingLengthMm,
        unitQuantity: spec.unitQuantity,
        unitName: spec.unitName
      }))
    }))
  };
}

function createEmptyProductGroup(): EditableProductGroup {
  return {
    productCode: "",
    productName: "",
    profiles: [createEmptyProfile()]
  };
}

function createEmptyProfile(): EditableProfile {
  return {
    id: `new-${crypto.randomUUID()}`,
    code: "",
    name: "",
    stockLengthMm: 6000,
    isActive: true,
    cuttingSpecs: [createEmptyCuttingSpec()]
  };
}

function createEmptyCuttingSpec(): EditableCuttingSpec {
  return {
    id: `new-${crypto.randomUUID()}`,
    cuttingCode: "",
    cuttingName: "",
    cuttingLengthMm: 1,
    unitQuantity: 1,
    unitName: "Adet"
  };
}
