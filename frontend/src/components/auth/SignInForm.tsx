"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Input, Toast } from "@/components/ui";
import { LogIn, Mail, Lock } from "lucide-react";

export const SignInForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, isLoading, isAuthenticated, isRestoring, error, clearError } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sanitise redirectTo — must be an internal path, no open-redirect
  const rawRedirect = searchParams.get("redirectTo") ?? "/home";
  const safeRedirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/home";

  // If the user is already authenticated (e.g. navigated back to /signin),
  // redirect them away once auth state is known.
  useEffect(() => {
    if (!isRestoring && isAuthenticated) {
      router.replace(safeRedirect);
    }
  }, [isRestoring, isAuthenticated, router, safeRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (!email || !email.includes("@")) {
      setValidationError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setValidationError("Password must be at least 6 characters.");
      return;
    }

    const success = await signIn({ email, password });
    if (success) {
      // signIn() already set isAuthenticated=true and isRestoring=false in the
      // store synchronously, so the AppShell guard will pass on the next render.
      router.replace(safeRedirect);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl bg-[#0e121a] border border-[#242c3d] p-7 shadow-2xl">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00ff87]/15 text-[#00ff87] border border-[#00ff87]/30 mb-3 shadow-[0_0_20px_rgba(0,255,135,0.2)]">
          <LogIn className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-[#f8fafc]">
          SIGN IN TO ARENA
        </h2>
        <p className="text-xs text-[#94a3b8] mt-1">
          Access your live auction rooms and squad management
        </p>
      </div>

      {(error || validationError) && (
        <div className="mb-4">
          <Toast
            type="error"
            title="Authentication Notice"
            message={validationError || error || ""}
            onClose={() => {
              clearError();
              setValidationError(null);
            }}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email Address"
          type="email"
          placeholder="manager@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="current-password"
          required
        />

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-[#94a3b8]">Your session is restored automatically.</span>
        </div>

        <Button
          type="submit"
          variant="stadium"
          size="lg"
          className="w-full mt-2"
          isLoading={isLoading}
        >
          SIGN IN TO ARENA
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-[#94a3b8]">
        Don&apos;t have an account yet?{" "}
        <Link
          href="/auth/signup"
          className="text-[#00ff87] font-semibold hover:underline"
        >
          Create Account
        </Link>
      </div>
    </div>
  );
};
