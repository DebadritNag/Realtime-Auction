"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { profileService } from "@/services/profile.service";
import { Achievement, UserCareerStats } from "@/types";
import { HeroSection } from "@/components/home/HeroSection";
import { CreateRoomCard } from "@/components/home/CreateRoomCard";
import { JoinRoomCard } from "@/components/home/JoinRoomCard";
import { ProfilePreview } from "@/components/home/ProfilePreview";
import { AchievementPreview } from "@/components/home/AchievementPreview";
import { RecentActivityCard } from "@/components/home/RecentActivityCard";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [stats, setStats] = useState<UserCareerStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [careerStats, achievementList] = await Promise.all([
          profileService.getCareerStats(),
          profileService.getAchievements(),
        ]);
        setStats(careerStats);
        setAchievements(achievementList);
      } catch (e) {
        console.error("Failed to load home dashboard data:", e);
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, []);

  const displayUser = user || {
    id: "user-1",
    username: "gourab_tactician",
    displayName: "Gourab Chakraborty",
    email: "gourab@auctionarena.com",
    avatarUrl: "",
    defaultTeamName: "Calcutta United",
    defaultTeamLogo: "🛡️",
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(1, 10, 16, 0.55), rgba(1, 10, 16, 0.68)), url('/images/bg.jpg')",
        backgroundPosition: "50% 20%",
        backgroundSize: "cover",
      }}
    >
      {/* Main Home Page Content Container */}
      <div className="max-w-[1552px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-7 flex-1 flex flex-col space-y-6 sm:space-y-7">
        {/* BEGIN: HeroSection */}
        <HeroSection user={displayUser} />
        {/* END: HeroSection */}

        {/* BEGIN: PrimaryActionsGrid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className="lg:col-span-6">
            <CreateRoomCard />
          </div>
          <div className="lg:col-span-6">
            <JoinRoomCard />
          </div>
        </section>
        {/* END: PrimaryActionsGrid */}

        {/* BEGIN: LowerDashboardGrid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className="lg:col-span-4">
            {dataLoading ? (
              <div className="h-[290px] w-full rounded-2xl bg-[#051521] border border-[#122e42] animate-pulse p-5 flex flex-col justify-between">
                <div className="h-12 bg-[#081f2f] rounded-lg w-2/3"></div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="h-20 bg-[#081f2f] rounded-lg"></div>
                  <div className="h-20 bg-[#081f2f] rounded-lg"></div>
                  <div className="h-20 bg-[#081f2f] rounded-lg"></div>
                </div>
                <div className="h-8 bg-[#081f2f] rounded w-1/2"></div>
              </div>
            ) : (
              <ProfilePreview user={displayUser} stats={stats || undefined} />
            )}
          </div>

          <div className="lg:col-span-5">
            {dataLoading ? (
              <div className="h-[290px] w-full rounded-2xl bg-[#051521] border border-[#122e42] animate-pulse p-5 flex flex-col justify-between">
                <div className="h-8 bg-[#081f2f] rounded w-1/3"></div>
                <div className="grid grid-cols-4 gap-2.5">
                  <div className="h-40 bg-[#081f2f] rounded-xl"></div>
                  <div className="h-40 bg-[#081f2f] rounded-xl"></div>
                  <div className="h-40 bg-[#081f2f] rounded-xl"></div>
                  <div className="h-40 bg-[#081f2f] rounded-xl"></div>
                </div>
              </div>
            ) : (
              <AchievementPreview achievements={achievements} />
            )}
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            {dataLoading ? (
              <div className="h-[290px] w-full rounded-2xl bg-[#051521] border border-[#122e42] animate-pulse p-5 space-y-3">
                <div className="h-8 bg-[#081f2f] rounded w-1/2"></div>
                <div className="h-11 bg-[#081f2f] rounded-xl"></div>
                <div className="h-11 bg-[#081f2f] rounded-xl"></div>
                <div className="h-11 bg-[#081f2f] rounded-xl"></div>
              </div>
            ) : (
              <RecentActivityCard />
            )}
          </div>
        </section>
        {/* END: LowerDashboardGrid */}
      </div>
    </div>
  );
}
