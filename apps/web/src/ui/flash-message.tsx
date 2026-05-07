import { Alert, AlertDescription } from "@/components/ui/alert";

type FlashMessageProps = {
  message: string;
  tone: "success" | "danger" | "info";
};

export function FlashMessage({ message, tone }: FlashMessageProps) {
  const variant =
    tone === "danger" ? "destructive" : tone === "success" ? "success" : "info";

  return (
    <Alert variant={variant}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
