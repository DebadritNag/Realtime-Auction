import React, { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

// useSearchParams() inside SignInForm requires a Suspense boundary
// at the page level so Next.js can statically render the shell.
export default function SignInPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 pitch-radial-grid">
      <Suspense fallback={<div className="text-[#94a3b8] text-sm">Loading…</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
