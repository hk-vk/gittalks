// GitTalks - Rate Limiting
// Limits users to 5 podcast generations per 30 days

import { getDb } from "./database";
import { jobs } from "./schema";
import { eq, and, gte, count } from "drizzle-orm";

// Rate limit configuration
export const MAX_PODCASTS_PER_USER = 5;
export const RATE_LIMIT_WINDOW_DAYS = 30;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  message?: string;
}

/**
 * Check if a user can generate a new podcast
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const db = getDb();
  
  // Calculate the start of the rate limit window (30 days ago)
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - RATE_LIMIT_WINDOW_DAYS);
  
  // Count successful podcast generations in the window
  const result = await db
    .select({ count: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.status, "completed"),
        gte(jobs.createdAt, windowStart.toISOString())
      )
    );
  
  const usedCount = result[0]?.count || 0;
  const remaining = Math.max(0, MAX_PODCASTS_PER_USER - usedCount);
  
  // Calculate reset time (30 days from oldest generation in window)
  const resetAt = new Date();
  resetAt.setDate(resetAt.getDate() + RATE_LIMIT_WINDOW_DAYS);
  
  if (usedCount >= MAX_PODCASTS_PER_USER) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      message: `You've reached the limit of ${MAX_PODCASTS_PER_USER} podcasts per ${RATE_LIMIT_WINDOW_DAYS} days. Please wait or upgrade to continue.`,
    };
  }
  
  return {
    allowed: true,
    remaining,
    resetAt,
  };
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsage(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> {
  const db = getDb();
  
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - RATE_LIMIT_WINDOW_DAYS);
  
  const result = await db
    .select({ count: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.status, "completed"),
        gte(jobs.createdAt, windowStart.toISOString())
      )
    );
  
  const used = result[0]?.count || 0;
  
  return {
    used,
    limit: MAX_PODCASTS_PER_USER,
    remaining: Math.max(0, MAX_PODCASTS_PER_USER - used),
  };
}
