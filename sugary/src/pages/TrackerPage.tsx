"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, Tracker, TrackerEntry, GroupMember } from "../lib/supabase";
import { FaChevronLeft, FaChevronRight, FaArrowLeft } from "react-icons/fa6";

function TrackerPage() {
  const navigate = useNavigate();
  const { trackerId } = useParams<{ trackerId: string }>();
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [todayAnswer, setTodayAnswer] = useState<boolean | null>(null);
  
  // Amount tracker states
  const [todayAmount, setTodayAmount] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [holdingAmount, setHoldingAmount] = useState(0);
  const [isWarming, setIsWarming] = useState(false);
  const [warmupProgress, setWarmupProgress] = useState(0);
  
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const userId = localStorage.getItem("userId");

  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayDate = useCallback(() => {
    return formatDateLocal(new Date());
  }, []);

  useEffect(() => {
    if (!userId) {
      navigate("/login");
      return;
    }
    if (trackerId) {
      loadTracker();
    }
  }, [trackerId, userId]);

  const loadTracker = async () => {
    if (!trackerId) return;

    // Load tracker info
    const { data: trackerData } = await supabase
      .from("trackers")
      .select("*")
      .eq("id", trackerId)
      .single();

    if (!trackerData) {
      navigate("/");
      return;
    }

    setTracker(trackerData);

    // Load group members
    const { data: membersData } = await supabase
      .from("group_members")
      .select("*, users(*)")
      .eq("group_id", trackerData.group_id);

    setMembers(membersData || []);

    // Load entries for current month view
    await loadEntries(trackerData.id);

    // Check if user already answered today
    const today = getTodayDate();
    const { data: todayEntry } = await supabase
      .from("tracker_entries")
      .select("*")
      .eq("tracker_id", trackerId)
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    if (todayEntry) {
      if ('answer' in todayEntry.value) {
        setTodayAnswer(todayEntry.value.answer);
      } else if ('amount' in todayEntry.value) {
        setTodayAmount(todayEntry.value.amount);
      }
    }
  };

  const loadEntries = async (tId: string) => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const { data } = await supabase
      .from("tracker_entries")
      .select("*, users(*)")
      .eq("tracker_id", tId)
      .gte("date", formatDateLocal(startOfMonth))
      .lte("date", formatDateLocal(endOfMonth));

    setEntries(data || []);
  };

  useEffect(() => {
    if (tracker) {
      loadEntries(tracker.id);
    }
  }, [currentMonth]);

  const handleAnswer = async (answer: boolean) => {
    if (!trackerId || !userId) return;

    const today = getTodayDate();
    
    await supabase.from("tracker_entries").upsert(
      {
        tracker_id: trackerId,
        user_id: userId,
        date: today,
        value: { answer },
      },
      { onConflict: "tracker_id,user_id,date" }
    );

    setTodayAnswer(answer);
    
    // Always reload entries and stay on calendar (don't redirect home)
    await loadEntries(trackerId);
  };

  // Amount tracker hold logic
  const handleHoldStart = () => {
    setHoldingAmount(0);
    setIsWarming(true);
    setWarmupProgress(0);
    
    let progress = 0;
    warmupIntervalRef.current = setInterval(() => {
      progress += 2.5;
      setWarmupProgress(Math.min(progress, 100));
    }, 50);
    
    holdTimeoutRef.current = setTimeout(() => {
      if (warmupIntervalRef.current) {
        clearInterval(warmupIntervalRef.current);
        warmupIntervalRef.current = null;
      }
      setIsWarming(false);
      setWarmupProgress(100);
      setIsHolding(true);
      setHoldingAmount(1);
      
      holdIntervalRef.current = setInterval(() => {
        setHoldingAmount((prev) => prev + 1);
      }, 1000);
    }, 2000);
  };

  const handleHoldEnd = async () => {
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

    if (isHolding && holdingAmount > 0 && trackerId && userId) {
      const today = getTodayDate();
      const newTotal = todayAmount + holdingAmount;
      
      await supabase.from("tracker_entries").upsert(
        {
          tracker_id: trackerId,
          user_id: userId,
          date: today,
          value: { amount: newTotal },
        },
        { onConflict: "tracker_id,user_id,date" }
      );

      setTodayAmount(newTotal);
      await loadEntries(trackerId);
    }

    setIsHolding(false);
    setHoldingAmount(0);
    setIsWarming(false);
    setWarmupProgress(0);
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

  // Get entries for a specific date
  const getEntriesForDate = (date: Date) => {
    const dateStr = formatDateLocal(date);
    return entries.filter((e) => e.date === dateStr && 'answer' in e.value && e.value.answer === true);
  };

  if (!tracker) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-brand-50">
        <span className="text-subtext-color">Loading...</span>
      </div>
    );
  }

  // Yes/No trackers always show the calendar view with inline Yes/No buttons

  // Amount Tracker View - get today's ranking
  const getTodayRanking = () => {
    const today = getTodayDate();
    const todayEntries = entries.filter(e => e.date === today && 'amount' in e.value);
    return todayEntries
      .map(e => ({
        name_tag: e.users?.name_tag || "?",
        amount: (e.value as { amount: number }).amount,
        isCurrentUser: e.user_id === userId
      }))
      .sort((a, b) => a.amount - b.amount); // Lower is better
  };

  if (tracker.type === 'amount') {
    const ranking = getTodayRanking();
    
    return (
      <div className="flex w-full flex-col items-center bg-brand-50 h-screen overflow-auto">
        {/* Header */}
        <div className="flex w-full items-center justify-between px-6 pt-8">
          <button onClick={() => navigate("/")} className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg">
            <FaArrowLeft size={20} />
          </button>
          <h1 className="text-heading-2 font-heading-2 text-brand-600">{tracker.name}</h1>
          <div className="w-10" />
        </div>

        {/* Ranking */}
        {ranking.length > 0 && (
          <div className="flex w-full items-center gap-6 overflow-x-auto px-6 py-4 hide-scrollbar">
            <div className="flex-1 min-w-0" />
            {ranking.map((user, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
                <span className="text-heading-2 font-heading-2 text-brand-600">
                  {user.amount} {tracker.unit || ''}
                </span>
                <span className={`text-caption font-caption ${user.isCurrentUser ? "text-brand-600 font-bold" : "text-default-font"}`}>
                  {user.name_tag}
                </span>
              </div>
            ))}
            <div className="flex-1 min-w-0" />
          </div>
        )}

        {/* Main content */}
        <div className="flex w-full grow flex-col items-center justify-center gap-6 px-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-heading-1 font-heading-1 text-brand-600">
              {isHolding ? todayAmount + holdingAmount : todayAmount} {tracker.unit || ''}
            </span>
            <span className="text-body font-body text-subtext-color">today</span>
          </div>

          {/* Hold button */}
          <div className="relative select-none" style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}>
            <svg className="absolute -inset-4 w-40 h-40 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(253, 186, 116, 0.3)" strokeWidth="4" />
              {(isWarming || isHolding) && (
                <circle
                  cx="50" cy="50" r="46" fill="none"
                  stroke={isHolding ? "#f97316" : "#fdba74"}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 46}`}
                  strokeDashoffset={`${2 * Math.PI * 46 * (1 - warmupProgress / 100)}`}
                  className="transition-all duration-100"
                />
              )}
              {isHolding && (
                <circle
                  cx="50" cy="50" r="46" fill="none" stroke="#ea580c" strokeWidth="6"
                  strokeLinecap="round" strokeDasharray="30 260"
                  className="animate-spin origin-center" style={{ animationDuration: "1s" }}
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
              className={`relative transition-transform select-none touch-none w-32 h-32 rounded-full bg-brand-200 flex items-center justify-center ${
                isHolding ? "scale-105" : "hover:scale-105"
              }`}
            >
              <span className="text-heading-1 font-heading-1 text-brand-600">+</span>
              {isHolding && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-heading-2 font-heading-2 text-brand-600 bg-white/90 px-3 py-1 rounded-full shadow-md">
                    +{holdingAmount}
                  </span>
                </div>
              )}
            </button>
          </div>

          <span className="text-caption font-caption text-subtext-color text-center italic">
            Hold for 2 seconds to start adding
          </span>
        </div>
      </div>
    );
  }

  // Yes/No Calendar View
  const calendarDays = generateCalendarDays();
  const today = new Date();
  const isCurrentMonth = currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();

  return (
    <div className="flex w-full flex-col items-center bg-brand-50 h-screen overflow-auto">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-6 pt-8">
        <button onClick={() => navigate("/")} className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg">
          <FaArrowLeft size={20} />
        </button>
        <h1 className="text-heading-2 font-heading-2 text-brand-600">{tracker.name}</h1>
        <div className="w-10" />
      </div>

      {/* Today's Yes/No toggle buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => handleAnswer(true)}
          className={`px-6 py-2 rounded-full text-body-bold font-body-bold transition-colors ${
            todayAnswer === true
              ? "bg-brand-600 text-white shadow-md"
              : "bg-brand-100 text-brand-600 hover:bg-brand-200"
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => handleAnswer(false)}
          className={`px-6 py-2 rounded-full text-body-bold font-body-bold transition-colors ${
            todayAnswer === false
              ? "bg-brand-600 text-white shadow-md"
              : "bg-brand-100 text-brand-600 hover:bg-brand-200"
          }`}
        >
          No
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mt-6">
        <button onClick={() => navigateMonth("prev")} className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg">
          <FaChevronLeft />
        </button>
        <span className="text-heading-3 font-heading-3 text-brand-600 min-w-[140px] text-center">
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => navigateMonth("next")} className="p-2 text-brand-600 hover:bg-brand-100 rounded-lg">
          <FaChevronRight />
        </button>
      </div>

      {/* Calendar */}
      <div className="w-full max-w-md px-4 mt-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div key={i} className="text-center text-caption-bold font-caption-bold text-subtext-color py-2">
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

            const dayEntries = getEntriesForDate(dayInfo.date);
            const isToday = isCurrentMonth && dayInfo.day === today.getDate();

            return (
              <div
                key={i}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                  isToday ? "bg-brand-200 ring-2 ring-brand-400" : "bg-white"
                }`}
              >
                <span className={`text-caption font-caption ${isToday ? "text-brand-700 font-bold" : "text-default-font"}`}>
                  {dayInfo.day}
                </span>
                {dayEntries.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap justify-center max-w-full px-0.5">
                    {dayEntries.slice(0, 3).map((entry, j) => (
                      <span key={j} className="text-[8px] font-bold text-brand-600 bg-brand-100 rounded px-0.5">
                        {entry.users?.name_tag?.charAt(0).toUpperCase() || "?"}
                      </span>
                    ))}
                    {dayEntries.length > 3 && (
                      <span className="text-[8px] text-subtext-color">+{dayEntries.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 px-4 pb-8">
        <div className="flex flex-wrap gap-2 justify-center">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-1 text-caption font-caption text-subtext-color">
              <span className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-[10px]">
                {member.users?.name_tag?.charAt(0).toUpperCase() || "?"}
              </span>
              <span>{member.users?.name_tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TrackerPage;

