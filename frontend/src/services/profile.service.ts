/**
 * profile.service.ts
 *
 * Reads profile, stats, achievements, and history from Supabase directly.
 * These are read-only from the frontend (RLS enforced).
 *
 * The Fastify backend writes to these tables (user_stats, user_achievements,
 * auction_result_snapshots) — we only read here.
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Achievement,
  AuctionHistoryRecord,
  User,
  UserCareerStats,
} from "@/types";
import { USE_MOCK_DATA } from "./api";
import {
  MOCK_ACHIEVEMENTS,
  MOCK_AUCTION_HISTORY,
  MOCK_CAREER_STATS,
  MOCK_USER,
} from "./mock/mockData";

class ProfileService {

  public async getProfile(): Promise<User> {
    if (USE_MOCK_DATA) return MOCK_USER;

    const supabase = getSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Not authenticated.");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, default_team_name, default_team_logo_url, bio")
      .eq("id", user.id)
      .single();

    if (error) throw new Error(error.message);

    return {
      id: data.id,
      email: user.email ?? "",
      username: data.username ?? "",
      displayName: data.display_name ?? data.username ?? "",
      avatarUrl: data.avatar_url ?? "",
      defaultTeamName: data.default_team_name ?? "",
      defaultTeamLogo: data.default_team_logo_url ?? "⚡",
    };
  }

  public async getCareerStats(): Promise<UserCareerStats> {
    if (USE_MOCK_DATA) return MOCK_CAREER_STATS;

    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return emptyStats();

    const { data, error } = await supabase
      .from("user_stats")
      .select(
        "auctions_played, auctions_won, players_purchased, total_spend_units, highest_purchase_units, rooms_hosted"
      )
      .eq("user_id", user.id)
      .single();

    if (error || !data) return emptyStats();

    // Convert half-crore units → Cr
    const unitsToCr = (u: number) => u / 2;

    return {
      auctionsPlayed: data.auctions_played ?? 0,
      auctionsWon: data.auctions_won ?? 0,
      playersPurchased: data.players_purchased ?? 0,
      totalSpend: unitsToCr(data.total_spend_units ?? 0),
      highestPurchase: {
        playerName: "—",
        price: unitsToCr(data.highest_purchase_units ?? 0),
        auctionName: "—",
        date: "—",
      },
      averagePurchase:
        data.players_purchased > 0
          ? unitsToCr(data.total_spend_units ?? 0) / data.players_purchased
          : 0,
      roomsHosted: data.rooms_hosted ?? 0,
    };
  }

  public async getAchievements(): Promise<Achievement[]> {
    if (USE_MOCK_DATA) return MOCK_ACHIEVEMENTS;

    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Fetch all active achievements + which ones the user has unlocked
    const { data: allAchievements } = await supabase
      .from("achievements")
      .select("id, code, name, description, icon_key, category")
      .eq("active", true)
      .order("category");

    const { data: unlocked } = await supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id);

    const unlockedMap = new Map(
      (unlocked ?? []).map((u) => [u.achievement_id, u.unlocked_at as string])
    );

    return (allAchievements ?? []).map((a) => ({
      id: a.id,
      title: a.name.toUpperCase(),
      description: a.description ?? "",
      icon: a.icon_key ?? "🏆",
      unlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id)
        ? new Date(unlockedMap.get(a.id)!).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : undefined,
    }));
  }

  public async getAuctionHistory(): Promise<AuctionHistoryRecord[]> {
    if (USE_MOCK_DATA) return MOCK_AUCTION_HISTORY;

    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // user_auction_history_v view (security_invoker — respects RLS)
    const { data, error } = await supabase
      .from("user_auction_history_v")
      .select(
        "room_id, auction_name, team_name, players_purchased, total_spend_units, started_at, completed_at"
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    const unitsToCr = (u: number) => u / 2;

    return data.map((row, i) => ({
      id: row.room_id ?? String(i),
      auctionName: row.auction_name ?? "Auction",
      roomCode: row.room_id?.slice(0, 8).toUpperCase() ?? "—",
      date: row.completed_at
        ? new Date(row.completed_at as string).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : row.started_at
        ? new Date(row.started_at as string).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—",
      teamUsed: row.team_name ?? "—",
      playersPurchased: row.players_purchased ?? 0,
      moneySpent: unitsToCr(row.total_spend_units ?? 0),
      status: row.completed_at ? ("COMPLETED" as const) : ("ACTIVE" as const),
    }));
  }
}

function emptyStats(): UserCareerStats {
  return {
    auctionsPlayed: 0,
    auctionsWon: 0,
    playersPurchased: 0,
    totalSpend: 0,
    highestPurchase: { playerName: "—", price: 0, auctionName: "—", date: "—" },
    averagePurchase: 0,
    roomsHosted: 0,
  };
}

export const profileService = new ProfileService();
