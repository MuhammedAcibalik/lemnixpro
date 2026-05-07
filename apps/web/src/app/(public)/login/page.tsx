import { DatabaseZap, LockKeyhole, ShieldCheck, Workflow } from "lucide-react";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LoginForm } from "@/features/auth/login-form";
import { DASHBOARD_ROUTE, safePostLoginRedirectPath } from "@/lib/auth";
import { readFlashMessage } from "@/lib/query";
import { readSessionToken } from "@/server/auth/session";

type LoginPageProps = {
  searchParams?: Promise<{
    email?: string | string[];
    next?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const token = await readSessionToken();

  if (token) {
    redirect(DASHBOARD_ROUTE);
  }

  const resolvedSearchParams = await searchParams;
  const defaultEmail = readFlashMessage(resolvedSearchParams?.email) ?? "";
  const nextParam = resolvedSearchParams?.next;
  const nextFromQuery =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
        ? nextParam[0]
        : undefined;
  const redirectNext = safePostLoginRedirectPath(nextFromQuery);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_410px]">
        <div className="grid max-w-3xl gap-8">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(37,99,235,0.22)]">
              LP
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-primary">
                LemnixPRO
              </p>
              <p className="text-sm text-muted-foreground">
                Premium üretim operasyon konsolu
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
              Enterprise Operations Console
            </p>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
              Planlama, profil ve kesim operasyonları için güvenli kontrol yüzeyi.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Web katmanı sadece UI orkestrasyonu yapar; yetkilendirme ve domain
              davranışı API gateway ile sahipli mikroservis sınırlarında kalır.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <LoginHighlight
              icon={Workflow}
              label="Akış disiplini"
              text="Import, batch ve aktivasyon adımları izlenebilir kalır."
            />
            <LoginHighlight
              icon={ShieldCheck}
              label="Güvenli sınır"
              text="Cookie oturumu gateway doğrulamasıyla korunur."
            />
            <LoginHighlight
              icon={DatabaseZap}
              label="Hızlı başlangıç"
              text="Pre-login auth bloklaması olmadan form hazırdır."
            />
          </div>
        </div>

        <Card className="shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-3 border-b bg-muted/30">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
              <LockKeyhole className="size-4" />
              Güvenli oturum
            </div>
            <div className="grid gap-1">
              <CardTitle>Kurumsal giriş</CardTitle>
              <CardDescription>
                LemnixPRO çalışma alanına devam etmek için bilgilerinizi girin.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 p-5">
            <LoginForm
              defaultEmail={defaultEmail}
              redirectNext={redirectNext}
            />
            <Separator />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Gateway ve servis sınırları korunur.</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <span className="size-2 rounded-full bg-emerald-500" />
                Hazır
              </span>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

type LoginHighlightProps = {
  icon: typeof Workflow;
  label: string;
  text: string;
};

function LoginHighlight({ icon: Icon, label, text }: LoginHighlightProps) {
  return (
    <div className="grid gap-2 rounded-md border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="grid size-9 place-items-center rounded-md bg-blue-50 text-blue-700">
        <Icon className="size-4" />
      </div>
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <p className="text-sm leading-5 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
