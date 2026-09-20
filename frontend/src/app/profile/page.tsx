"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { profileService } from "@/services/profile.service";
import {
  Achievement,
  AuctionHistoryRecord,
  User,
  UserCareerStats,
} from "@/types";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { AchievementGrid } from "@/components/profile/AchievementGrid";
import { AuctionHistory } from "@/components/profile/AuctionHistory";
import { Skeleton } from "@/components/ui/Skeleton";
import { authService } from "@/services/auth.service";

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [stats, setStats] = useState<UserCareerStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [history, setHistory] = useState<AuctionHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProfileData() {
      try {
        const [careerStats, achievementList, historyList] = await Promise.all([
          profileService.getCareerStats(),
          profileService.getAchievements(),
          profileService.getAuctionHistory(),
        ]);
        setStats(careerStats);
        setAchievements(achievementList);
        setHistory(historyList);
      } catch (err) {
        console.error("Failed to load profile details:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfileData();
  }, []);

  const activeUser = user;

  const handleProfileUpdate = async (updated: Partial<User>) => {
    const newProfile = await authService.updateProfile(updated);
    setUser(newProfile);
  };

  if (isLoading || !activeUser) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <ProfileHeader user={activeUser} onUpdate={handleProfileUpdate} />

      {stats && <ProfileStats stats={stats} />}

      <AchievementGrid achievements={achievements} />

      <AuctionHistory history={history} />
    </div>
  );
}
