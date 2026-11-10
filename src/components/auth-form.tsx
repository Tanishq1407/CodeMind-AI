"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { readJsonResponse } from "@/lib/client-api-response";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const email = String(data.email || "");
    const password = String(data.password || "");
    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(data),
        });
        const body = await readJsonResponse(response);
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Unable to create the account.");
        setSuccess("Account created. Check your email for a verification link before signing in.");
      } else {
        const result = await signIn("credentials", { email, password, redirect: false });
        if (result?.error) throw new Error("Email or password was not recognized, or the address is not verified.");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    {mode === "register" && <label className="field"><span>Username</span><input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" title="Use 3–24 letters, numbers, or underscores." required /></label>}
    <label className="field"><span>Email</span><input type="email" name="email" autoComplete="email" maxLength={254} required /></label>
    <label className="field"><span>Password {mode === "register" ? "(12+ characters)" : ""}</span><PasswordInput name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={72} required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    {success && <p role="status" style={{ color: "#9fe2bb" }}>{success}</p>}
    <button className="btn primary" style={{ width: "100%" }} disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
    {mode === "login" && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12 }}><Link href="/forgot-password" className="muted">Forgot password?</Link></div>}
  </form>;
}
