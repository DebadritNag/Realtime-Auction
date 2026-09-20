"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Input, Toast } from "@/components/ui";
import { UserPlus, User, Mail, Lock, CheckCircle } from "lucide-react";

export const SignUpForm: React.FC = () => {
  const router = useRouter();
  const { signUp, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (!username || username.length < 3) {
      setValidationError("Username must be at least 3 characters.");
      return;
    }
    if (!email || !email.includes("@")) {
      setValidationError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setValidationError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }

    const success = await signUp({ username, email, password });
    if (success) {
      router.push("/home");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl bg-[#0e121a] border border-[#242c3d] p-7 shadow-2xl">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00ff87]/15 text-[#00ff87] border border-[#00ff87]/30 mb-3 shadow-[0_0_20px_rgba(0,255,135,0.2)]">
          <UserPlus className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-[#f8fafc]">
          CREATE YOUR ACCOUNT
        </h2>
        <p className="text-xs text-[#94a3b8] mt-1">
          Join competitive multiplayer football auctions in real time
        </p>
      </div>

      {(error || validationError) && (
        <div className="mb-4">
          <Toast
            type="error"
            title="Registration Notice"
            message={validationError || error || ""}
            onClose={() => {
              clearError();
              setValidationError(null);
            }}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          label="Manager Username"
          type="text"
          placeholder="tactician_99"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          leftIcon={<User className="w-4 h-4" />}
          required
        />

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
          autoComplete="new-password"
          required
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
          required
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="stadium"
            size="lg"
            className="w-full"
            isLoading={isLoading}
            rightIcon={<CheckCircle className="w-4 h-4" />}
          >
            CREATE ACCOUNT
          </Button>
        </div>
      </form>

      <div className="mt-6 text-center text-xs text-[#94a3b8]">
        Already have an account?{" "}
        <Link href="/auth/signin" className="text-[#00ff87] font-semibold hover:underline">
          Sign In
        </Link>
      </div>
    </div>
  );
};
