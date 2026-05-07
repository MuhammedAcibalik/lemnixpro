"use client";

import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteProductionPlanImportAction } from "@/features/production-plans/actions";

type DeleteProductionPlanBatchButtonProps = {
  batchId: string;
};

export function DeleteProductionPlanBatchButton({
  batchId
}: DeleteProductionPlanBatchButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label="Planı kaldır"
          size="icon"
          title="Yüklemeyi ve satırları sil"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Üretim planı silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            Bu yükleme ve tüm satırları kalıcı olarak silinir. Bu işlem geri
            alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <form action={deleteProductionPlanImportAction.bind(null, batchId)}>
            <Button type="submit" variant="destructive">
              Sil
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
