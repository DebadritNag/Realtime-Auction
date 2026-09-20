"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Input, Toast } from "@/components/ui";
import { LogIn, Mail, Lock, ShieldCheck } from "lucide-react";

export const SignInForm: React.FC = () => {
  const router = useRouter();
  const { signIn, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("gourab@auctionarena.com");
  const [password, setPassword] = useState("password123");
  const [rememberMe, setRememberMe] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

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

    const success = await signIn({ email, password, rememberMe });
    if (success) {
      router.push("/home");
    }
  };

  const handleQuickDemoFill = () => {
    setEmail("gourab@auctionarena.com");
    setPassword("password123");
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
          <label className="flex items-center gap-2 text-[#94a3b8] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded bg-[#151a24] border-[#242c3d] text-[#00ff87] focus:ring-[#00ff87]"
            />
            <span>Remember session</span>
          </label>
          <a
            href="#forgot"
            onClick={(e) => {
              e.preventDefault();
              alert("Password reset instructions will be sent to registered email via Supabase Auth.");
            }}
            className="text-[#00ff87] hover:underline"
          >
            Forgot password?
          </a>
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

      {/* Demo Credentials Helper */}
      <div className="mt-5 rounded-xl bg-[#151a24] border border-[#242c3d]/60 p-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-[#94a3b8]">
          <ShieldCheck className="w-4 h-4 text-[#00ff87]" />
          <span>Testing in Mock Mode?</span>
        </div>
        <button
          type="button"
          onClick={handleQuickDemoFill}
          className="text-xs font-semibold text-[#00ff87] hover:underline"
        >
          Auto-fill Demo
        </button>
      </div>

      <div className="mt-6 text-center text-xs text-[#94a3b8]">
        Don&apos;t have an account yet?{" "}
        <Link href="/auth/signup" className="text-[#00ff87] font-semibold hover:underline">
          Create Account
        </Link>
      </div>
    </div>
  );
};
