"use client";

import { RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function WorkspaceError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <Alert variant="destructive">
          <AlertTitle>Sayfa yüklenemedi</AlertTitle>
          <AlertDescription>
            {error.message ||
              "Gateway veya bağlı mikroservis geçici olarak yanıt vermedi."}
          </AlertDescription>
        </Alert>
        <Button className="w-fit" onClick={reset} type="button" variant="outline">
          <RotateCcw />
          Tekrar dene
        </Button>
      </CardContent>
    </Card>
  );
}
