"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginAction, type LoginFormState } from "./actions";

type LoginFormProps = {
  defaultEmail?: string;
  /** Relative return path (e.g. from `?next=` after session expiry). */
  redirectNext?: string | null;
};

export function LoginForm({
  defaultEmail = "",
  redirectNext = null
}: LoginFormProps) {
  const initialState: LoginFormState = {
    message: null,
    email: defaultEmail
  };
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      {redirectNext ? (
        <input name="next" type="hidden" value={redirectNext} />
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Kurumsal e-posta</Label>
        <Input
          autoComplete="email"
          defaultValue={state.email}
          id="email"
          name="email"
          placeholder="Muhammed@lemnix.local"
          required
          type="email"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Parola</Label>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          placeholder="Parolanızı girin"
          required
          type="password"
        />
      </div>
      {state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Oturum açılıyor..." : "Oturum aç"}
      </Button>
    </form>
  );
}
