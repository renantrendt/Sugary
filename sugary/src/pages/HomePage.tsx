"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, User, SugarLog } from "../lib/supabase";
import { FaFire } from "react-icons/fa6";
import { 
  isPushSupported, 
  subscribeToPush, 
  isSubscribed as checkIsSubscribed,
  getNotificationPermission
} from "../lib/pushNotifications";

function HomePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [todaySugar, setTodaySugar] = useState(0);
  const [ranking, setRanking] = useState<{ user_id: string; name_tag: string; sugar: number; streak: number; longest_streak: number }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{
    user_id: string;
    name_tag: string;
    longest_streak: number;
    monthSugar: number;
    yearSugar: number;
    viewMonth: number; // 0-11
    viewYear: number;
    viewMode: "month" | "year";
  } | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdingSugar, setHoldingSugar] = useState(0);
  const [isWarming, setIsWarming] = useState(false); // 2 sec warmup phase
  const [warmupProgress, setWarmupProgress] = useState(0); // 0 to 100
  const [canAskForNotifications, setCanAskForNotifications] = useState(true);
  
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number>(0);

  // Get today's date in user's timezone
  const getTodayDate = useCallback(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  // Listen for push notifications when app is open (from service worker)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PUSH_NOTIFICATION') {
          const notif = event.data.notification;
          console.log('[App] Received push notification while app is open:', notif);
          
          // Show in-app toast/alert instead of browser notification
          // For now, just log it - you can add a toast component later
          alert(`${notif.title}\n${notif.body}`);
        }
      });
    }
  }, []);

  // Check if we can ask for notifications (haven't asked in the last week)
  useEffect(() => {
    const checkCanAsk = async () => {
      // If already subscribed, no need to ask
      if (isPushSupported()) {
        const subscribed = await checkIsSubscribed();
        if (subscribed) {
          setCanAskForNotifications(false);
          return;
        }
      }

      const lastAsked = localStorage.getItem("lastNotificationAsk");
      if (lastAsked) {
        const weekInMs = 7 * 24 * 60 * 60 * 1000;
        const timeSinceAsked = Date.now() - parseInt(lastAsked);
        if (timeSinceAsked < weekInMs) {
          setCanAskForNotifications(false);
        }
      }
    };
    checkCanAsk();
  }, []);

  // Request notifications (called after sugar log)
  const requestNotifications = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId || !isPushSupported() || !canAskForNotifications) return;

    // Check if already subscribed
    const alreadySubscribed = await checkIsSubscribed();
    if (alreadySubscribed) {
      setCanAskForNotifications(false);
      return;
    }

    // Subscribe (this will trigger the permission prompt)
    await subscribeToPush(userId);
    
    // Store when we asked, so we wait a week before asking again
    localStorage.setItem("lastNotificationAsk", Date.now().toString());
    setCanAskForNotifications(false);
  };

  // Check auth on mount
  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      navigate("/login");
      return;
    }
    loadUserData(userId);

    // Subscribe to real-time updates for sugar_logs
    const channel = supabase
      .channel("sugar_logs_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sugar_logs",
        },
        () => {
          // Reload ranking when any sugar log changes
          loadRanking();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const loadUserData = async (userId: string) => {
    // Get user
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user) {
      localStorage.removeItem("userId");
      localStorage.removeItem("nameTag");
      navigate("/login");
      return;
    }

    setCurrentUser(user);

    // Load today's sugar
    const today = getTodayDate();
    const { data: todayLog } = await supabase
      .from("sugar_logs")
      .select("sugar_grams")
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    if (todayLog) {
      setTodaySugar(todayLog.sugar_grams);
    }

    // Load ranking
    await loadRanking();
  };

  // Calculate streak for a user (consecutive days under 5g with 2-day grace period)
  const calculateStreak = async (userId: string): Promise<number> => {
    // Get last 60 days of logs for this user
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("date, sugar_grams")
      .eq("user_id", userId)
      .gte("date", sixtyDaysAgo.toISOString().split("T")[0])
      .order("date", { ascending: false });

    // Create a map of date -> sugar_grams
    const logMap = new Map<string, number>();
    logs?.forEach((log) => {
      logMap.set(log.date, log.sugar_grams);
    });

    let streak = 0;
    let consecutiveGraceDays = 0;
    const maxGraceDays = 7;
    let hasFoundFirstRealDay = false;
    
    // Start from yesterday and go backwards (today doesn't count for streak)
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 1);
    
    for (let i = 0; i < 60; i++) {
      const dateStr = checkDate.toISOString().split("T")[0];
      const sugar = logMap.get(dateStr);
      
      if (sugar !== undefined) {
        // Has a log for this day
        if (sugar < 5) {
          // Valid streak day!
          hasFoundFirstRealDay = true;
          streak++;
          consecutiveGraceDays = 0; // Reset grace counter
        } else {
          // Ate 5g or more, streak breaks
          break;
        }
      } else {
        // No log for this day
        if (!hasFoundFirstRealDay) {
          // Haven't started a real streak yet, keep looking
          consecutiveGraceDays++;
          if (consecutiveGraceDays > maxGraceDays) {
            // Too many days without finding a real day, no streak
            break;
          }
          // Don't count this toward streak, just skip
        } else {
          // Already have a streak going, use grace period
          consecutiveGraceDays++;
          if (consecutiveGraceDays > maxGraceDays) {
            // Too many missed days, streak breaks
            break;
          }
          // Grace day bridges the gap but doesn't add to streak count
        }
      }
      
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return streak;
  };

  // Update longest streak in DB if current streak beats the record
  const updateLongestStreak = async (userId: string, currentStreak: number, currentLongest: number) => {
    if (currentStreak > currentLongest) {
      await supabase
        .from("users")
        .update({ longest_streak: currentStreak })
        .eq("id", userId);
      return currentStreak;
    }
    return currentLongest;
  };

  const loadRanking = async () => {
    // Get start of current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const weekStart = startOfWeek.toISOString().split("T")[0];
    
    // Get end of current week (Saturday) to include all days
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const weekEnd = endOfWeek.toISOString().split("T")[0];
    
    // Get all sugar logs for this week (Sun-Sat)
    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("user_id, sugar_grams, date, users(name_tag, longest_streak)")
      .gte("date", weekStart)
      .lte("date", weekEnd);

    if (logs) {
      // Group by user and sum their weekly sugar
      const userTotals = new Map<string, { 
        user_id: string; 
        sugar: number; 
        name_tag: string; 
        longest_streak: number;
      }>();
      
      for (const log of logs as any[]) {
        const existing = userTotals.get(log.user_id);
        if (existing) {
          existing.sugar += log.sugar_grams;
        } else {
          userTotals.set(log.user_id, {
            user_id: log.user_id,
            sugar: log.sugar_grams,
            name_tag: log.users?.name_tag || "Unknown",
            longest_streak: log.users?.longest_streak || 0,
          });
        }
      }

      // Calculate streak for each user and build ranking
      const rankingData = await Promise.all(
        Array.from(userTotals.values()).map(async (userData) => {
          const streak = await calculateStreak(userData.user_id);
          const longest_streak = await updateLongestStreak(
            userData.user_id, 
            streak, 
            userData.longest_streak
          );
          return {
            user_id: userData.user_id,
            name_tag: userData.name_tag,
            sugar: userData.sugar,
            streak,
            longest_streak,
          };
        })
      );
      
      // Sort by sugar (ascending - less sugar = better)
      rankingData.sort((a, b) => a.sugar - b.sugar);
      setRanking(rankingData);
    }
  };

  // Get total sugar for a specific month
  const getMonthSugar = async (userId: string, year: number, month: number): Promise<number> => {
    const startOfMonth = new Date(year, month, 1).toISOString().split("T")[0];
    const endOfMonth = new Date(year, month + 1, 0).toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("sugar_grams")
      .eq("user_id", userId)
      .gte("date", startOfMonth)
      .lte("date", endOfMonth);

    return logs?.reduce((sum, log) => sum + log.sugar_grams, 0) || 0;
  };

  // Get total sugar for a specific year
  const getYearSugar = async (userId: string, year: number): Promise<number> => {
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("sugar_grams")
      .eq("user_id", userId)
      .gte("date", startOfYear)
      .lte("date", endOfYear);

    return logs?.reduce((sum, log) => sum + log.sugar_grams, 0) || 0;
  };

  // Open user stats popup
  const openUserStats = async (user: { user_id: string; name_tag: string; longest_streak: number }) => {
    const now = new Date();
    const monthSugar = await getMonthSugar(user.user_id, now.getFullYear(), now.getMonth());
    const yearSugar = await getYearSugar(user.user_id, now.getFullYear());
    
    setSelectedUser({
      user_id: user.user_id,
      name_tag: user.name_tag,
      longest_streak: user.longest_streak,
      monthSugar,
      yearSugar,
      viewMonth: now.getMonth(),
      viewYear: now.getFullYear(),
      viewMode: "month",
    });
  };

  // Navigate months/years in the popup
  const navigateStats = async (direction: "prev" | "next", type: "month" | "year") => {
    if (!selectedUser) return;

    let newMonth = selectedUser.viewMonth;
    let newYear = selectedUser.viewYear;

    if (type === "month") {
      if (direction === "prev") {
        newMonth--;
        if (newMonth < 0) {
          newMonth = 11;
          newYear--;
        }
      } else {
        newMonth++;
        if (newMonth > 11) {
          newMonth = 0;
          newYear++;
        }
      }
    } else {
      newYear = direction === "prev" ? newYear - 1 : newYear + 1;
    }

    const monthSugar = await getMonthSugar(selectedUser.user_id, newYear, newMonth);
    const yearSugar = await getYearSugar(selectedUser.user_id, newYear);

    setSelectedUser({
      ...selectedUser,
      monthSugar,
      yearSugar,
      viewMonth: newMonth,
      viewYear: newYear,
    });
  };

  const saveSugar = async (grams: number) => {
    const userId = localStorage.getItem("userId");
    if (!userId) return;

    const today = getTodayDate();
    const newTotal = todaySugar + grams;

    // Upsert today's log
    const { error } = await supabase.from("sugar_logs").upsert(
      {
        user_id: userId,
        date: today,
        sugar_grams: newTotal,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,date",
      }
    );

    if (!error) {
      setTodaySugar(newTotal);
      await loadRanking();
      
      // Ask for notification permission (if we haven't asked in the last week)
      if (canAskForNotifications) {
        // Small delay so the user sees their sugar saved first
        setTimeout(() => {
          requestNotifications();
        }, 500);
      }
    }
  };

  // Hold to add sugar logic
  const handleHoldStart = () => {
    holdStartRef.current = Date.now();
    setHoldingSugar(0);
    setIsWarming(true);
    setWarmupProgress(0);
    
    // Animate warmup progress over 2 seconds (update every 50ms)
    let progress = 0;
    warmupIntervalRef.current = setInterval(() => {
      progress += 2.5; // 100% / 40 intervals = 2.5% per 50ms
      setWarmupProgress(Math.min(progress, 100));
    }, 50);
    
    // After 2 seconds, start adding sugar
    holdTimeoutRef.current = setTimeout(() => {
      // Clear warmup interval
      if (warmupIntervalRef.current) {
        clearInterval(warmupIntervalRef.current);
        warmupIntervalRef.current = null;
      }
      setIsWarming(false);
      setWarmupProgress(100);
      setIsHolding(true);
      setHoldingSugar(1);
      
      // Add 1g every second
      holdIntervalRef.current = setInterval(() => {
        setHoldingSugar((prev) => prev + 1);
      }, 1000);
    }, 2000);
  };

  const handleHoldEnd = () => {
    // Clear all timers
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    if (warmupIntervalRef.current) {
      clearInterval(warmupIntervalRef.current);
      warmupIntervalRef.current = null;
    }

    // If we were holding and adding sugar
    if (isHolding && holdingSugar > 0) {
      saveSugar(holdingSugar);
    }

    setIsHolding(false);
    setHoldingSugar(0);
    setIsWarming(false);
    setWarmupProgress(0);
  };

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex w-full flex-col items-start bg-brand-50 h-screen">
      {/* Top bar with date and ranking */}
      <div className="mt-6 flex w-full flex-col items-center justify-center gap-4 px-6 pt-8 relative z-10">
        {/* Date display centered */}
        <div className="flex items-center justify-center">
          <span className="text-body-bold font-body-bold text-brand-600 bg-brand-100 px-3 py-2 rounded-lg">
            {todayFormatted}
          </span>
        </div>

        {/* User stats popup */}
        {selectedUser && (
          <>
            {/* Backdrop to close on click outside */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setSelectedUser(null)}
            />
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg p-4 z-50 min-w-[180px]">
              {/* User name */}
              <div className="text-heading-3 font-heading-3 text-default-font text-center mb-3">
                {selectedUser.name_tag}
              </div>
              
              {/* Longest streak */}
              <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-neutral-100">
                <FaFire className="text-brand-600" />
                <span className="text-body-bold font-body-bold text-brand-600">{selectedUser.longest_streak}</span>
              </div>
              
              {/* Tabs */}
              <div className="flex rounded-lg bg-brand-50 p-1 mb-3">
                <button
                  onClick={() => setSelectedUser({ ...selectedUser, viewMode: "month" })}
                  className={`flex-1 py-1 px-2 rounded-md text-caption font-caption transition-colors ${
                    selectedUser.viewMode === "month"
                      ? "bg-white text-brand-600 shadow-sm"
                      : "text-subtext-color"
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setSelectedUser({ ...selectedUser, viewMode: "year" })}
                  className={`flex-1 py-1 px-2 rounded-md text-caption font-caption transition-colors ${
                    selectedUser.viewMode === "year"
                      ? "bg-white text-brand-600 shadow-sm"
                      : "text-subtext-color"
                  }`}
                >
                  Year
                </button>
              </div>
              
              {/* Single view with arrows */}
              <div className="flex items-center justify-between gap-2">
                <button 
                  onClick={() => navigateStats("prev", selectedUser.viewMode)}
                  className="text-brand-600 hover:text-brand-700 text-xl px-1"
                >
                  ‹
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-caption font-caption text-subtext-color">
                    {selectedUser.viewMode === "month"
                      ? new Date(selectedUser.viewYear, selectedUser.viewMonth).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                      : selectedUser.viewYear}
                  </span>
                  <span className="text-heading-2 font-heading-2 text-brand-600">
                    {selectedUser.viewMode === "month" ? selectedUser.monthSugar : selectedUser.yearSugar}g
                  </span>
                </div>
                <button 
                  onClick={() => navigateStats("next", selectedUser.viewMode)}
                  className="text-brand-600 hover:text-brand-700 text-xl px-1"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}

        {/* Ranking - horizontal scroll */}
        <div className="flex w-full items-center gap-6 overflow-x-auto px-4 pb-2 hide-scrollbar">
          {ranking.length === 0 ? (
            <p className="text-caption font-caption text-subtext-color w-full text-center">
              No one has logged sugar today yet
            </p>
          ) : (
            <>
              {/* Spacer to center when few items */}
              <div className="flex-1 min-w-0" />
              {ranking.map((user) => (
                <button
                  key={user.name_tag}
                  onClick={() => openUserStats({ user_id: user.user_id, name_tag: user.name_tag, longest_streak: user.longest_streak })}
                  className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-80 transition-opacity"
                >
                  <span className="text-heading-2 font-heading-2 text-brand-600">
                    {user.sugar}g {user.streak > 0 && <span className="inline-flex items-baseline gap-1"><FaFire className="text-brand-600 relative top-[2px]" /> {user.streak}</span>}
                  </span>
                  <span
                    className={`text-caption font-caption ${
                      user.name_tag === currentUser?.name_tag
                        ? "text-brand-600 font-bold"
                        : "text-default-font"
                    }`}
                  >
                    {user.name_tag}
                  </span>
                </button>
              ))}
              {/* Spacer to center when few items */}
              <div className="flex-1 min-w-0" />
            </>
          )}
        </div>
      </div>

      {/* Main sugar button area */}
      <div className="mt-[-80px] flex w-full grow shrink-0 basis-0 flex-col items-center justify-center gap-6 px-6 py-12 relative">
        {/* Total sugar display above the button */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-heading-1 font-heading-1 text-brand-600">
            {isHolding ? todaySugar + holdingSugar : todaySugar}g
          </span>
          <span className="text-body font-body text-subtext-color">
            today's sugar
          </span>
        </div>

        {/* Sugar bowl button with progress ring */}
        <div className="relative select-none" style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}>
          {/* SVG Progress Ring */}
          <svg
            className="absolute -inset-4 w-56 h-56 -rotate-90"
            viewBox="0 0 100 100"
          >
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="rgba(253, 186, 116, 0.3)"
              strokeWidth="4"
            />
            {/* Progress ring - warmup phase (orange, fills up in 2 sec) */}
            {(isWarming || isHolding) && (
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke={isHolding ? "#f97316" : "#fdba74"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 46}`}
                strokeDashoffset={`${2 * Math.PI * 46 * (1 - warmupProgress / 100)}`}
                className="transition-all duration-100"
              />
            )}
            {/* Spinning snake effect when actively adding */}
            {isHolding && (
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="#ea580c"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="30 260"
                className="animate-spin origin-center"
                style={{ animationDuration: "1s" }}
              />
            )}
          </svg>
          
          <button
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            onMouseLeave={handleHoldEnd}
            onTouchStart={(e) => { e.preventDefault(); handleHoldStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleHoldEnd(); }}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative transition-transform select-none touch-none ${
              isHolding ? "scale-105" : "hover:scale-105"
            }`}
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          >
            <img
              src="/sugar.png"
              alt="Add sugar"
              className="w-48 h-48 object-contain select-none pointer-events-none"
              draggable={false}
            />
            {isHolding && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-heading-1 font-heading-1 text-brand-600 bg-white/90 px-4 py-2 rounded-full shadow-md">
                  +{holdingSugar}g
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Instructions */}
        <span className="text-caption font-caption text-subtext-color text-center italic">
          Hold for 2 seconds to start adding sugar
        </span>
        <span className="text-caption font-caption text-subtext-color">
            Limit to die: 35g/week
          </span>
        
      </div>
    </div>
  );
}

export default HomePage;

