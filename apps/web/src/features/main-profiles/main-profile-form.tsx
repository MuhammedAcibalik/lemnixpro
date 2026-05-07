import type {
  CreateMainProfileRequest,
  MainProfile,
  UpdateMainProfileRequest
} from "@lemnixpro/shared-contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MainProfileFormValues = Partial<
  CreateMainProfileRequest & UpdateMainProfileRequest & MainProfile
>;

type MainProfileFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  description: string;
  submitLabel: string;
  values?: MainProfileFormValues;
  errorMessage?: string | null;
};

export function MainProfileForm({
  action,
  description,
  submitLabel,
  values,
  errorMessage
}: MainProfileFormProps) {
  const isActive = values?.isActive ?? true;

  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="code">Profil kodu</Label>
          <Input
            defaultValue={values?.code ?? ""}
            id="code"
            name="code"
            placeholder="MP-001"
            required
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Profil adı</Label>
          <Input
            defaultValue={values?.name ?? ""}
            id="name"
            name="name"
            placeholder="Ana alüminyum profil"
            required
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="stockLengthMm">Stok boyu (mm)</Label>
          <Input
            defaultValue={values?.stockLengthMm ?? 6500}
            id="stockLengthMm"
            min={1}
            name="stockLengthMm"
            required
            step={1}
            type="number"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="linkedProductCode">Bağlı ürün kodu</Label>
          <Input
            defaultValue={values?.linkedProductCode ?? ""}
            id="linkedProductCode"
            name="linkedProductCode"
            placeholder="PRD-001"
            required
            type="text"
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="linkedProductName">Bağlı ürün adı</Label>
          <Input
            defaultValue={values?.linkedProductName ?? ""}
            id="linkedProductName"
            name="linkedProductName"
            placeholder="Window Frame Profile"
            required
            type="text"
          />
        </div>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-foreground">Notlar</span>
        <textarea
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
          defaultValue={values?.notes ?? ""}
          name="notes"
          placeholder="İç operasyon notu"
          rows={5}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <input name="isActive" type="hidden" value="false" />
        <input
          defaultChecked={isActive}
          name="isActive"
          type="checkbox"
          value="true"
        />
        Profil ilk kayıtta aktif olsun
      </label>
      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
