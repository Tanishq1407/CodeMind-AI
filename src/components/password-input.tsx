"use client";

import { useState } from "react";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ display: "block", position: "relative" }}>
      <input {...props} type={visible ? "text" : "password"} style={{ ...props.style, paddingRight: 44 }} />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((shown) => !shown)}
        style={{ position: "absolute", insetBlock: 0, right: 5, display: "grid", placeItems: "center", width: 36, border: 0, background: "transparent", color: "#a0a2b2", cursor: "pointer", borderRadius: 6 }}
      >
        {visible
          ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.7 4.2 10 7-.4 1-1.2 2.1-2.3 3.2M6.2 6.2C3.9 7.6 2.5 9.7 2 12c1.3 2.8 5 7 10 7 1.1 0 2.1-.2 3-.5"/></svg>
          : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </span>
  );
}
