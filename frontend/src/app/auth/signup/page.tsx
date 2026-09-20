"use client";

import React from "react";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 pitch-radial-grid">
      <SignUpForm />
    </div>
  );
}
