import { FileUploadCard } from "@/ui/file-upload-card";

type ProductionPlanUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  errorMessage?: string | null;
};

export function ProductionPlanUploadForm({
  action,
  errorMessage
}: ProductionPlanUploadFormProps) {
  return (
    <>
      <FileUploadCard
        action={action}
        buttonLabel="Excel yükle"
        compact
        title="Haftalık üretim planı Excel dosyası seçin"
      />
      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
