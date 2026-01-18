"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, User, SugarLog } from "../lib/supabase";
import { FaChevronLeft, FaChevronRight, FaArrowLeft, FaFire } from "react-icons/fa6";

function UserStatsPage() {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [sugarLogs, setSugarLogs] = useState<SugarLog[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthTotal, setMonthTotal] = useState(0);
  const [yearTotal, setYearTotal] = useState(0);

  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Load user data
  useEffect(() => {
    if (!userId) {
      navigate("/");
      return;
    }
    loadUser();
  }, [userId]);

  // Load logs when month changes
  useEffect(() => {
    if (userId) {
      loadMonthLogs();
      loadYearTotal();
    }
  }, [currentMonth, userId]);

  const loadUser = async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!data) {
      navigate("/");
      return;
    }

    setUser(data);
  };

  const loadMonthLogs = async () => {
    if (!userId) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const startOfMonth = formatDateLocal(new Date(year, month, 1));
    const endOfMonth = formatDateLocal(new Date(year, month + 1, 0));

    const { data } = await supabase
      .from("sugar_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startOfMonth)
      .lte("date", endOfMonth);

    setSugarLogs(data || []);

    // Calculate month total
    const total = (data || []).reduce((sum, log) => sum + log.sugar_grams, 0);
    setMonthTotal(total);
  };

  const loadYearTotal = async () => {
    if (!userId) return;

    const year = currentMonth.getFullYear();
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    const { data } = await supabase
      .from("sugar_logs")
      .select("sugar_grams")
      .eq("user_id", userId)
      .gte("date", startOfYear)
      .lte("date", endOfYear);

    const total = (data || []).reduce((sum, log) => sum + log.sugar_grams, 0);
    setYearTotal(total);
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentMonth);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentMonth(newDate);
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: { date: Date | null; day: number }[] = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ date: null, day: 0 });
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ date: new Date(year, month, day), day });
    }

    return days;
  };

  // Get sugar for a specific date
  const getSugarForDate = (date: Date): number | null => {
    const dateStr = formatDateLocal(date);
    const log = sugarLogs.find((l) => l.date === dateStr);
    return log ? log.sugar_grams : null;
  };

  // Check if date is in the future
  const isFutureDate = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
  };

  // Check if date is before user joined
  const isBeforeUserJoined = (date: Date): boolean => {
    if (!user?.created_at) return false;
    const joinDate = new Date(user.created_at);
    joinDate.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < joinDate;
  };

  if (!user) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-brand-50">
        <span className="text-subtext-color">Loading...</span>
      </div>
    );
  }

  const calendarDays = generateCalendarDays();
  const today = new Date();
  const isCurrentMonth =
    currentMonth.getMonth() === today.getMonth() &&
    currentMonth.getFullYear() === today.getFullYear();

  return (
    <div className="flex w-full flex-col items-center bg-brand-50 min-h-screen overflow-auto pb-8">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-6 pt-8">
        <button
          onClick={() => navigate("/")}
          className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg"
        >
          <FaArrowLeft size={20} />
        </button>
        <div className="w-10" />
      </div>

      {/* User info */}
      <div className="flex flex-col items-center mt-4">
        <h1 className="text-heading-2 font-heading-2 text-brand-600">
          {user.name_tag}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <FaFire className="text-brand-600" />
          <span className="text-body font-body text-subtext-color">
            Longest: {user.longest_streak || 0} days
          </span>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={() => navigateMonth("prev")}
          className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg"
        >
          <FaChevronLeft />
        </button>
        <span className="text-heading-3 font-heading-3 text-brand-600 min-w-[160px] text-center">
          {currentMonth.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </span>
        <button
          onClick={() => navigateMonth("next")}
          className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg"
        >
          <FaChevronRight />
        </button>
      </div>

      {/* Stats summary */}
      <div className="mt-4 bg-white rounded-xl p-4 shadow-sm border border-brand-100 min-w-[200px]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-body font-body text-subtext-color">This Month:</span>
          <span className="text-body-bold font-body-bold text-brand-600">{monthTotal}g</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-body font-body text-subtext-color">This Year:</span>
          <span className="text-body-bold font-body-bold text-brand-600">{yearTotal}g</span>
        </div>
      </div>

      {/* Calendar */}
      <div className="w-full max-w-md px-4 mt-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div
              key={i}
              className="text-center text-caption-bold font-caption-bold text-subtext-color py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayInfo, i) => {
            if (!dayInfo.date) {
              return <div key={i} className="aspect-square" />;
            }

            const sugar = getSugarForDate(dayInfo.date);
            const isToday = isCurrentMonth && dayInfo.day === today.getDate();
            const isFuture = isFutureDate(dayInfo.date);
            const isPreJoin = isBeforeUserJoined(dayInfo.date);
            
            // Fire icon for days with ≤5g or no log (0g)
            // Only show for days on or after user joined
            const isStreakDay = !isFuture && !isPreJoin && (sugar === null || sugar <= 5);
            const displaySugar = sugar === null ? 0 : sugar;

            return (
              <div
                key={i}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 ${
                  isToday
                    ? "bg-brand-200 ring-2 ring-brand-400"
                    : "bg-white"
                } ${isFuture || isPreJoin ? "opacity-40" : ""}`}
              >
                <span
                  className={`text-caption font-caption ${
                    isToday ? "text-brand-700 font-bold" : "text-default-font"
                  }`}
                >
                  {dayInfo.day}
                </span>
                {!isFuture && !isPreJoin && (
                  <div className="flex flex-col items-center">
                    {isStreakDay && (
                      <FaFire className="text-brand-500 text-xs" />
                    )}
                    <span
                      className={`text-[10px] ${
                        isStreakDay
                          ? "text-brand-600 font-semibold"
                          : "text-brand-600"
                      }`}
                    >
                      {displaySugar}g
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-4 text-caption font-caption text-subtext-color">
        <div className="flex items-center gap-1">
          <FaFire className="text-brand-500" />
          <span>≤5g (streak day)</span>
        </div>
      </div>
    </div>
  );
}

export default UserStatsPage;
