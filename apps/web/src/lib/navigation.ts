export type ModuleStatus = "active" | "planned";
export type ModuleGroup = "operations" | "planning" | "intelligence";
export type ModuleIcon =
  | "analytics"
  | "cut-list"
  | "home"
  | "optimization"
  | "production-plan"
  | "profile";

export type WorkspaceNavigationItem = {
  href: string;
  label: string;
  description: string;
  group: ModuleGroup;
  icon: ModuleIcon;
  status: ModuleStatus;
  keywords?: string[];
};

export const workspaceNavigation: WorkspaceNavigationItem[] = [
  {
    href: "/ana-sayfa",
    label: "Ana Sayfa",
    description: "Operasyon görünümü",
    group: "operations",
    icon: "home",
    status: "active",
    keywords: ["dashboard", "gösterge", "özet"]
  },
  {
    href: "/kesim-listesi",
    label: "Kesim Listesi",
    description: "Haftalık kesim listeleri",
    group: "operations",
    icon: "cut-list",
    status: "active",
    keywords: ["kesim", "snapshot", "hafta"]
  },
  {
    href: "/profil-yonetimi",
    label: "Profil Yönetimi",
    description: "Ana ürün ve profil hiyerarşisi",
    group: "planning",
    icon: "profile",
    status: "active",
    keywords: ["profil", "ürün", "master data"]
  },
  {
    href: "/uretim-plani",
    label: "Üretim Planı",
    description: "Haftalık Excel import",
    group: "planning",
    icon: "production-plan",
    status: "active",
    keywords: ["üretim", "plan", "excel", "batch"]
  },
  {
    href: "/enterprise-optimizasyon",
    label: "Enterprise Optimizasyon",
    description: "Optimizasyon hazırlığı",
    group: "intelligence",
    icon: "optimization",
    status: "active",
    keywords: ["optimizasyon", "kuyruk", "hazırlık"]
  },
  {
    href: "/operasyon-analitigi",
    label: "Operasyon Analitiği",
    description: "Üretim ve kesim göstergeleri",
    group: "intelligence",
    icon: "analytics",
    status: "active",
    keywords: ["analitik", "rapor", "görünürlük"]
  }
];

export const workspaceNavigationGroups: Array<{
  id: ModuleGroup;
  label: string;
}> = [
  { id: "operations", label: "Operasyon" },
  { id: "planning", label: "Planlama" },
  { id: "intelligence", label: "Analitik" }
];
