"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, User, SugarLog } from "../lib/supabase";

function HomePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [todaySugar, setTodaySugar] = useState(0);
  const [ranking, setRanking] = useState<{ name_tag: string; sugar: number }[]>([]);
  const [historyData, setHistoryData] = useState<{ date: string; sugar: number }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [holdingSugar, setHoldingSugar] = useState(0);
  const [isWarming, setIsWarming] = useState(false); // 2 sec warmup phase
  const [warmupProgress, setWarmupProgress] = useState(0); // 0 to 100
  
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number>(0);

  // Get today's date in user's timezone
  const getTodayDate = useCallback(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  // Check auth on mount
  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      navigate("/login");
      return;
    }
    loadUserData(userId);
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

    // Load history
    await loadHistory(userId);
  };

  const loadRanking = async () => {
    const today = getTodayDate();
    
    // Get all users who have logged sugar today
    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("user_id, sugar_grams, users(name_tag)")
      .eq("date", today)
      .order("sugar_grams", { ascending: true });

    if (logs) {
      const rankingData = logs.map((log: any) => ({
        name_tag: log.users?.name_tag || "Unknown",
        sugar: log.sugar_grams,
      }));
      setRanking(rankingData);
    }
  };

  const loadHistory = async (userId: string) => {
    // Get current month's logs
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const { data: logs } = await supabase
      .from("sugar_logs")
      .select("date, sugar_grams")
      .eq("user_id", userId)
      .gte("date", startOfMonth)
      .lte("date", endOfMonth)
      .order("date", { ascending: true });

    if (logs) {
      setHistoryData(
        logs.map((log) => ({
          date: log.date,
          sugar: log.sugar_grams,
        }))
      );
    }
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex w-full flex-col items-start bg-brand-50 h-screen">
      {/* Top bar with date and ranking */}
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 pt-8 pb-6">
        {/* Date button top left */}
        <div className="flex w-full items-center justify-between">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-body-bold font-body-bold text-brand-600 bg-brand-100 px-3 py-2 rounded-lg hover:bg-brand-200 transition-colors"
          >
            📅 {todayFormatted}
          </button>
          <span className="text-caption font-caption text-subtext-color">
            Limit to die: 5g/day
          </span>
        </div>

        {/* History popup */}
        {showHistory && (
          <div className="absolute top-24 left-6 right-6 bg-white rounded-xl shadow-lg p-4 z-50 max-h-64 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-heading-3 font-heading-3 text-default-font">
                This Month
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-subtext-color hover:text-default-font"
              >
                ✕
              </button>
            </div>
            {historyData.length === 0 ? (
              <p className="text-body font-body text-subtext-color">
                No sugar logged yet this month
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {historyData.map((entry) => (
                  <div
                    key={entry.date}
                    className="flex justify-between items-center py-2 border-b border-neutral-100"
                  >
                    <span className="text-body font-body text-default-font">
                      {formatDate(entry.date)}
                    </span>
                    <span className="text-body-bold font-body-bold text-brand-600">
                      {entry.sugar}g
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ranking - horizontal scroll */}
        <div className="flex w-full items-center gap-6 pb-2 overflow-x-auto">
          {ranking.length === 0 ? (
            <p className="text-caption font-caption text-subtext-color">
              No one has logged sugar today yet
            </p>
          ) : (
            ranking.map((user) => (
              <div key={user.name_tag} className="flex flex-col items-center gap-1 flex-shrink-0">
                <span className="text-heading-2 font-heading-2 text-brand-600">
                  {user.sugar}g
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
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main sugar button area */}
      <div className="flex w-full grow shrink-0 basis-0 flex-col items-center justify-center gap-6 px-6 py-12 relative">
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
        <div className="relative">
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
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            className={`relative transition-transform ${
              isHolding ? "scale-105" : "hover:scale-105"
            }`}
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
        <span className="text-caption font-caption text-subtext-color text-center">
          Hold for 2 seconds to start adding sugar
        </span>
      </div>
    </div>
  );
}

export default HomePage;

