"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { readJsonResponse } from "@/lib/client-api-response";

const resendMessage = "If an unverified account exists for this email, a verification link has been sent.";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; username?: string }>({});
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFieldErrors({});
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const submittedEmail = String(data.email || "").trim();
    const password = String(data.password || "");
    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            ...data,
            username: String(data.username || "").trim().toLowerCase(),
            email: submittedEmail.toLowerCase(),
          }),
        });
        const body = await readJsonResponse(response);
        if (!response.ok) {
          if (body.code === "EMAIL_ALREADY_EXISTS" || body.code === "EMAIL_NOT_VERIFIED") {
            setFieldErrors({ email: String(body.error || "Email already exists. Please sign in or reset your password.") });
            if (body.code === "EMAIL_NOT_VERIFIED") {
              setResendEmail(submittedEmail);
              setShowResend(true);
            }
          } else if (body.code === "USERNAME_ALREADY_EXISTS") {
            setFieldErrors({ username: String(body.error || "Username already exists. Please choose another username.") });
          } else {
            setError(typeof body.error === "string" ? body.error : "Unable to create the account.");
          }
          return;
        }
        setSuccess("Account created. Check your email for a verification link before signing in.");
      } else {
        const result = await signIn("credentials", { email: submittedEmail, password, redirect: false });
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

  async function resendVerification(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResendError("");
    setResendSuccess("");
    setResendBusy(true);
    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const body = await readJsonResponse(response);
      if (!response.ok) {
        setResendError(typeof body.error === "string" ? body.error : "Unable to request a verification email right now.");
        return;
      }
      setResendSuccess(typeof body.message === "string" ? body.message : resendMessage);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Unable to request a verification email right now.");
    } finally {
      setResendBusy(false);
    }
  }

  return <>
    <form onSubmit={submit}>
      {mode === "register" && <>
        <label className="field"><span>Username</span><input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" title="Use 3–24 letters, numbers, or underscores." value={username} onChange={(e) => { setUsername(e.target.value); setFieldErrors((old) => ({ ...old, username: undefined })); }} aria-invalid={!!fieldErrors.username} aria-describedby={fieldErrors.username ? "register-username-error" : undefined} required /></label>
        {fieldErrors.username && <p id="register-username-error" className="error" role="alert">{fieldErrors.username}</p>}
      </>}
      <label className="field"><span>Email</span><input type="email" name="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); }} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "register-email-error" : undefined} required /></label>
      {fieldErrors.email && <p id="register-email-error" className="error" role="alert">{fieldErrors.email}</p>}
      <label className="field"><span>Password {mode === "register" ? "(12+ characters)" : ""}</span><PasswordInput name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={72} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p role="status" style={{ color: "#9fe2bb" }}>{success}</p>}
      <button className="btn primary" style={{ width: "100%" }} disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
      {mode === "login" && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12 }}><Link href="/forgot-password" className="muted">Forgot password?</Link></div>}
    </form>
    {mode === "login" && <div style={{ marginTop: 12 }}>
      <button type="button" className="btn subtle" style={{ display: "flex", width: "100%", justifyContent: "center", fontSize: 12 }} aria-expanded={showResend} onClick={() => { setResendEmail(email); setResendError(""); setResendSuccess(""); setShowResend((open) => !open); }}>Resend verification email</button>
      {showResend && <form onSubmit={resendVerification} style={{ marginTop: 12, padding: 14, border: "1px solid #303240", borderRadius: 9, background: "#14151d" }}>
        <label className="field" style={{ marginTop: 0 }}><span>Email address</span><input type="email" autoComplete="email" maxLength={254} value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required /></label>
        {resendError && <p className="error" role="alert">{resendError}</p>}
        {resendSuccess && <p role="status" style={{ color: "#9fe2bb" }}>{resendSuccess}</p>}
        <button className="btn primary" style={{ width: "100%" }} disabled={resendBusy}>{resendBusy ? "Sending…" : "Send verification link"}</button>
      </form>}
    </div>}
  </>;
}
