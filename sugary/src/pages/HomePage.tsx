"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, User, SugarLog, Group, GroupMember, Tracker, generateInviteCode } from "../lib/supabase";
import { FaFire, FaBars, FaPlus, FaXmark, FaUserPlus, FaUsers, FaHouse, FaCheck, FaTrash } from "react-icons/fa6";
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
  
  // Drawer & Groups state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [showCreateTracker, setShowCreateTracker] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newTrackerName, setNewTrackerName] = useState("");
  const [newTrackerType, setNewTrackerType] = useState<"yes_no" | "amount">("yes_no");
  const [newTrackerUnit, setNewTrackerUnit] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number>(0);

  // Get today's date in user's timezone
  const getTodayDate = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Helper to format any date as YYYY-MM-DD in local timezone
  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  // Reload ranking when current group changes
  useEffect(() => {
    if (currentUser) {
      loadRanking();
    }
  }, [currentGroup?.id]);

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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadUserData:today',message:'Today date calculated',data:{today,jsDate:new Date().toString(),userId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    const { data: todayLog } = await supabase
      .from("sugar_logs")
      .select("sugar_grams")
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadUserData:todayLog',message:'Today sugar log fetched',data:{today,todayLog,sugarGrams:todayLog?.sugar_grams},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    if (todayLog) {
      setTodaySugar(todayLog.sugar_grams);
    } else {
      setTodaySugar(0);
    }

    // Load ranking
    await loadRanking();
    
    // Load user's groups
    await loadGroups(userId);
  };

  const loadGroups = async (userId: string) => {
    // Ensure Public group exists
    let { data: publicGroup } = await supabase
      .from("groups")
      .select("*")
      .eq("name", "Public")
      .single();

    if (!publicGroup) {
      // Create Public group if it doesn't exist
      const { data: newPublicGroup } = await supabase
        .from("groups")
        .insert({
          name: "Public",
          created_by: userId,
          invite_code: "PUBLIC",
        })
        .select()
        .single();
      publicGroup = newPublicGroup;
    }

    // Ensure user is a member of Public group
    if (publicGroup) {
      const { data: existingMember } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", publicGroup.id)
        .eq("user_id", userId)
        .single();

      if (!existingMember) {
        await supabase.from("group_members").insert({
          group_id: publicGroup.id,
          user_id: userId,
        });
      }
    }

    // Get groups where user is a member
    const { data: memberData } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (memberData && memberData.length > 0) {
      const groupIds = memberData.map((m) => m.group_id);
      const { data: groupsData } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds);

      // Sort groups so Public is first
      const sortedGroups = (groupsData || []).sort((a, b) => {
        if (a.name === "Public") return -1;
        if (b.name === "Public") return 1;
        return a.name.localeCompare(b.name);
      });

      setGroups(sortedGroups);
      
      // Set Public group as current if none selected
      if (sortedGroups.length > 0 && !currentGroup) {
        const defaultGroup = sortedGroups.find(g => g.name === "Public") || sortedGroups[0];
        setCurrentGroup(defaultGroup);
        await loadTrackers(defaultGroup.id);
      }
    }
  };

  const loadTrackers = async (groupId: string) => {
    const { data } = await supabase
      .from("trackers")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    setTrackers(data || []);
  };

  const createGroup = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId || !newGroupName.trim()) return;

    const code = generateInviteCode();

    const { data: newGroup, error } = await supabase
      .from("groups")
      .insert({
        name: newGroupName.trim(),
        created_by: userId,
        invite_code: code,
      })
      .select()
      .single();

    if (error || !newGroup) {
      console.error("Failed to create group:", error);
      return;
    }

    // Add creator as member
    await supabase.from("group_members").insert({
      group_id: newGroup.id,
      user_id: userId,
    });

    setGroups([...groups, newGroup]);
    setCurrentGroup(newGroup);
    setTrackers([]);
    setNewGroupName("");
    setShowCreateGroup(false);
  };

  const joinGroup = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId || !joinCode.trim()) return;

    // Find group by invite code
    const { data: group } = await supabase
      .from("groups")
      .select("*")
      .eq("invite_code", joinCode.trim().toUpperCase())
      .single();

    if (!group) {
      alert("Invalid invite code");
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", group.id)
      .eq("user_id", userId)
      .single();

    if (existing) {
      alert("You're already in this group lol");
      setJoinCode("");
      setShowJoinGroup(false);
      return;
    }

    // Join the group
    await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: userId,
    });

    setGroups([...groups, group]);
    setCurrentGroup(group);
    await loadTrackers(group.id);
    setJoinCode("");
    setShowJoinGroup(false);
  };

  const createTracker = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId || !currentGroup || !newTrackerName.trim()) return;

    const { data: newTracker, error } = await supabase
      .from("trackers")
      .insert({
        group_id: currentGroup.id,
        name: newTrackerName.trim(),
        type: newTrackerType,
        unit: newTrackerType === "amount" ? newTrackerUnit.trim() || null : null,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !newTracker) {
      console.error("Failed to create tracker:", error);
      return;
    }

    setTrackers([...trackers, newTracker]);
    setNewTrackerName("");
    setNewTrackerType("yes_no");
    setNewTrackerUnit("");
    setShowCreateTracker(false);
  };

  const selectGroup = async (group: Group) => {
    setCurrentGroup(group);
    await loadTrackers(group.id);
    setShowGroupMenu(false);
  };

  const showInviteCode = () => {
    if (currentGroup) {
      setInviteCode(currentGroup.invite_code);
    }
  };

  const viewGroupMembers = async () => {
    if (!currentGroup) return;
    
    const { data } = await supabase
      .from("group_members")
      .select("*, users(*)")
      .eq("group_id", currentGroup.id);
    
    setGroupMembers(data || []);
    setShowMembers(true);
  };

  const deleteTracker = async (trackerId: string, trackerName: string) => {
    if (!confirm(`Delete "${trackerName}"? This will remove all entries too.`)) return;
    
    await supabase.from("trackers").delete().eq("id", trackerId);
    setTrackers(trackers.filter(t => t.id !== trackerId));
  };

  const deleteGroup = async () => {
    if (!currentGroup) return;
    if (!confirm(`Delete "${currentGroup.name}"? This will remove all trackers and entries.`)) return;
    
    await supabase.from("groups").delete().eq("id", currentGroup.id);
    setGroups(groups.filter(g => g.id !== currentGroup.id));
    setCurrentGroup(groups.length > 1 ? groups.find(g => g.id !== currentGroup.id) || null : null);
    setTrackers([]);
    setShowMembers(false);
  };

  const leaveGroup = async () => {
    const userId = localStorage.getItem("userId");
    if (!currentGroup || !userId) return;
    if (!confirm(`Leave "${currentGroup.name}"?`)) return;
    
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", currentGroup.id)
      .eq("user_id", userId);
    
    setGroups(groups.filter(g => g.id !== currentGroup.id));
    setCurrentGroup(groups.length > 1 ? groups.find(g => g.id !== currentGroup.id) || null : null);
    setTrackers([]);
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
      .gte("date", formatDateLocal(sixtyDaysAgo))
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
      const dateStr = formatDateLocal(checkDate);
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadRanking:entry',message:'loadRanking called',data:{currentGroupId:currentGroup?.id,currentGroupName:currentGroup?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    // Get members of current group (or all users if no group)
    let memberUserIds: string[] = [];
    
    if (currentGroup) {
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", currentGroup.id);
      
      memberUserIds = members?.map(m => m.user_id) || [];
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadRanking:members',message:'Group members fetched',data:{groupId:currentGroup.id,memberCount:memberUserIds.length,memberIds:memberUserIds},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      if (memberUserIds.length === 0) {
        setRanking([]);
        return;
      }
    }
    
    // Get start of current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const weekStart = formatDateLocal(startOfWeek);
    
    // Get end of current week (Saturday) to include all days
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const weekEnd = formatDateLocal(endOfWeek);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadRanking:dates',message:'Week dates calculated',data:{weekStart,weekEnd,nowLocal:formatDateLocal(now)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Build query for sugar logs
    let query = supabase
      .from("sugar_logs")
      .select("user_id, sugar_grams, date, users(name_tag, longest_streak)")
      .gte("date", weekStart)
      .lte("date", weekEnd);
    
    // Filter by group members if we have a group selected
    if (currentGroup && memberUserIds.length > 0) {
      query = query.in("user_id", memberUserIds);
    }
    
    const { data: logs } = await query;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadRanking:logs',message:'Sugar logs fetched',data:{logCount:logs?.length||0,logs:logs?.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // First, get ALL group members with their info so everyone appears (even with 0g)
    let allMembers: { user_id: string; name_tag: string; longest_streak: number }[] = [];
    
    if (currentGroup && memberUserIds.length > 0) {
      const { data: memberUsers } = await supabase
        .from("users")
        .select("id, name_tag, longest_streak")
        .in("id", memberUserIds);
      
      allMembers = (memberUsers || []).map(u => ({
        user_id: u.id,
        name_tag: u.name_tag,
        longest_streak: u.longest_streak || 0,
      }));
    }

    // Group by user and sum their weekly sugar
    const userTotals = new Map<string, { 
      user_id: string; 
      sugar: number; 
      name_tag: string; 
      longest_streak: number;
    }>();
    
    // Initialize all members with 0g
    for (const member of allMembers) {
      userTotals.set(member.user_id, {
        user_id: member.user_id,
        sugar: 0,
        name_tag: member.name_tag,
        longest_streak: member.longest_streak,
      });
    }
    
    // Add sugar from logs
    if (logs) {
      for (const log of logs as any[]) {
        const existing = userTotals.get(log.user_id);
        if (existing) {
          existing.sugar += log.sugar_grams || 0;
        } else {
          // User has logs but wasn't in group members (shouldn't happen with proper filter)
          userTotals.set(log.user_id, {
            user_id: log.user_id,
            sugar: log.sugar_grams || 0,
            name_tag: log.users?.name_tag || "Unknown",
            longest_streak: log.users?.longest_streak || 0,
          });
        }
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/59838800-7c89-43f4-bcc9-f6e998d97917',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomePage.tsx:loadRanking:totals',message:'User totals calculated',data:{totalMembers:userTotals.size,members:Array.from(userTotals.values()).map(u=>({name:u.name_tag,sugar:u.sugar}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
    // #endregion

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
  };

  // Get total sugar for a specific month
  const getMonthSugar = async (userId: string, year: number, month: number): Promise<number> => {
    const startOfMonth = formatDateLocal(new Date(year, month, 1));
    const endOfMonth = formatDateLocal(new Date(year, month + 1, 0));

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
    <div className="flex w-full flex-col items-start bg-brand-50 h-screen relative">
      {/* Hamburger menu button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="absolute top-6 left-4 z-50 p-3 text-brand-600 hover:bg-brand-100 rounded-lg transition-colors"
      >
        <FaBars size={24} />
      </button>

      {/* Slide-out drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed top-0 left-0 h-full w-72 bg-brand-50 shadow-xl z-50 flex flex-col animate-slide-in-left border-r border-brand-100">
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-brand-100">
              <button
                onClick={() => setShowGroupMenu(!showGroupMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-brand-100 hover:bg-brand-200 rounded-lg transition-colors"
              >
                <FaUsers className="text-brand-600" size={16} />
                <span className="text-body-bold font-body-bold text-brand-600 max-w-[140px] truncate">
                  {currentGroup?.name || "Select Group"}
                </span>
              </button>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-brand-400 hover:bg-brand-100 rounded-lg">
                <FaXmark size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {/* Group menu - expands inline */}
              {showGroupMenu && (
                <div className="mb-4 bg-white rounded-xl p-2 border border-brand-100">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => { selectGroup(group); setShowGroupMenu(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-brand-100 transition-colors ${
                        currentGroup?.id === group.id ? "bg-brand-100 text-brand-600" : "text-default-font"
                      }`}
                    >
                      {group.name}
                    </button>
                  ))}
                  {groups.length > 0 && <hr className="my-2 border-brand-100" />}
                  <button
                    onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); setShowCreateGroup(true); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-100 text-brand-600 flex items-center gap-2"
                  >
                    <FaPlus size={12} /> Create Group
                  </button>
                  <button
                    onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); setShowJoinGroup(true); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-100 text-brand-600 flex items-center gap-2"
                  >
                    <FaUserPlus size={12} /> Join Group
                  </button>
                  {currentGroup && (
                    <>
                      <button
                        onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); viewGroupMembers(); }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-100 text-neutral-700 flex items-center gap-2"
                      >
                        <FaUsers size={12} /> View Members
                      </button>
                      <button
                        onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); showInviteCode(); }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-100 text-brand-600 flex items-center gap-2"
                      >
                        <FaUserPlus size={12} /> Invite to Group
                      </button>
                      <hr className="my-2 border-brand-100" />
                      {currentGroup.created_by === localStorage.getItem("userId") ? (
                        <button
                          onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); deleteGroup(); }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-error-50 text-error-600 flex items-center gap-2"
                        >
                          <FaTrash size={12} /> Delete Group
                        </button>
                      ) : (
                        <button
                          onClick={() => { setShowGroupMenu(false); setDrawerOpen(false); leaveGroup(); }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-error-50 text-error-600 flex items-center gap-2"
                        >
                          <FaXmark size={12} /> Leave Group
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* Home button - always visible, goes to main sugar tracker */}
              <button
                onClick={() => { setDrawerOpen(false); navigate("/"); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-100 text-brand-600 mb-2 hover:bg-brand-200 transition-colors"
              >
                <FaHouse size={18} />
                <span className="text-body-bold font-body-bold">Sugar Tracker</span>
              </button>

              {/* Divider */}
              {currentGroup && trackers.length > 0 && (
                <div className="text-caption font-caption text-subtext-color px-2 py-2 mt-2">
                  Trackers
                </div>
              )}

              {/* Current group's trackers */}
              {currentGroup ? (
                <>
                  <div className="text-caption-bold font-caption-bold text-subtext-color mb-2 px-2">
                    {currentGroup.name}
                  </div>
                  {trackers.map((tracker) => (
                    <div key={tracker.id} className="flex items-center gap-1 mb-1">
                      <button
                        onClick={() => { setDrawerOpen(false); navigate(`/tracker/${tracker.id}`); }}
                        className="flex-1 flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-neutral-50 text-default-font"
                      >
                        <span className={`w-2 h-2 rounded-full ${tracker.type === 'yes_no' ? 'bg-brand-400' : 'bg-brand-600'}`} />
                        <span className="text-body font-body">{tracker.name}</span>
                        <span className="text-caption font-caption text-subtext-color ml-auto">
                          {tracker.type === 'yes_no' ? 'Y/N' : tracker.unit || '#'}
                        </span>
                      </button>
                      <button
                        onClick={() => deleteTracker(tracker.id, tracker.name)}
                        className="p-2 text-neutral-400 hover:text-error-500 hover:bg-error-50 rounded-lg transition-colors"
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  ))}
                  
                  {/* Create tracker button */}
                  <button
                    onClick={() => { setDrawerOpen(false); setShowCreateTracker(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-brand-50 text-brand-600 mt-2 border-2 border-dashed border-brand-200"
                  >
                    <FaPlus size={14} />
                    <span className="text-body font-body">Add Tracker</span>
                  </button>
                </>
              ) : (
                <div className="text-center py-8 text-subtext-color">
                  <p className="text-body font-body mb-4">No group selected</p>
                  <button
                    onClick={() => { setDrawerOpen(false); setShowCreateGroup(true); }}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-body-bold font-body-bold"
                  >
                    Create a Group
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateGroup(false)}>
            <div className="bg-brand-50 rounded-xl p-6 w-full max-w-sm shadow-xl border border-brand-100" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-heading-3 font-heading-3 text-brand-600 mb-4">Create Group</h2>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Roommates)"
                className="w-full px-4 py-3 rounded-lg border border-brand-200 bg-white mb-4 text-body font-body focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowCreateGroup(false)} className="flex-1 py-2 rounded-lg bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors">
                  Cancel
                </button>
                <button onClick={createGroup} className="flex-1 py-2 rounded-lg bg-brand-600 text-white">
                  Create
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Join Group Modal */}
      {showJoinGroup && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowJoinGroup(false)}>
            <div className="bg-brand-50 rounded-xl p-6 w-full max-w-sm shadow-xl border border-brand-100" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-heading-3 font-heading-3 text-brand-600 mb-4">Join Group</h2>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                className="w-full px-4 py-3 rounded-lg border border-brand-200 bg-white mb-4 text-body font-body text-center tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
                maxLength={6}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowJoinGroup(false)} className="flex-1 py-2 rounded-lg bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors">
                  Cancel
                </button>
                <button onClick={joinGroup} className="flex-1 py-2 rounded-lg bg-brand-600 text-white">
                  Join
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Invite Code Modal */}
      {inviteCode && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setInviteCode(null)}>
            <div className="bg-brand-50 rounded-xl p-6 w-full max-w-sm shadow-xl border border-brand-100 text-center" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-heading-3 font-heading-3 text-brand-600 mb-2">Invite Code</h2>
              <p className="text-caption font-caption text-subtext-color mb-4">Share this code with friends to join {currentGroup?.name}</p>
              <div className="text-heading-1 font-heading-1 text-brand-600 tracking-widest bg-brand-50 py-4 rounded-lg mb-4">
                {inviteCode}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(inviteCode); }}
                className="w-full py-2 rounded-lg bg-brand-600 text-white"
              >
                Copy Code
              </button>
            </div>
          </div>
        </>
      )}

      {/* Group Members Modal */}
      {showMembers && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMembers(false)}>
            <div className="bg-brand-50 rounded-xl p-6 w-full max-w-sm shadow-xl border border-brand-100" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-heading-3 font-heading-3 text-brand-600 mb-4">
                {currentGroup?.name} Members
              </h2>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {groupMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-brand-100/50 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg">
                      {member.users?.name_tag?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1">
                      <span className="text-body-bold font-body-bold text-default-font">
                        {member.users?.name_tag}
                      </span>
                      {member.user_id === currentGroup?.created_by && (
                        <span className="ml-2 text-caption font-caption text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                          Owner
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowMembers(false)}
                className="w-full mt-4 py-2 rounded-lg bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Tracker Modal */}
      {showCreateTracker && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateTracker(false)}>
            <div className="bg-brand-50 rounded-xl p-6 w-full max-w-sm shadow-xl border border-brand-100" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-heading-3 font-heading-3 text-brand-600 mb-4">Create Tracker</h2>
              
              <input
                type="text"
                value={newTrackerName}
                onChange={(e) => setNewTrackerName(e.target.value)}
                placeholder="Tracker name (e.g. Dishes)"
                className="w-full px-4 py-3 rounded-lg border border-brand-200 bg-white mb-4 text-body font-body focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              
              {/* Type selector */}
              <div className="flex rounded-lg bg-brand-100 p-1 mb-4">
                <button
                  onClick={() => setNewTrackerType("yes_no")}
                  className={`flex-1 py-2 rounded-md text-body font-body transition-colors ${
                    newTrackerType === "yes_no" ? "bg-brand-50 text-brand-600 shadow-sm" : "text-brand-400"
                  }`}
                >
                  Yes / No
                </button>
                <button
                  onClick={() => setNewTrackerType("amount")}
                  className={`flex-1 py-2 rounded-md text-body font-body transition-colors ${
                    newTrackerType === "amount" ? "bg-brand-50 text-brand-600 shadow-sm" : "text-brand-400"
                  }`}
                >
                  Amount
                </button>
              </div>
              
              {/* Unit field for amount type */}
              {newTrackerType === "amount" && (
                <input
                  type="text"
                  value={newTrackerUnit}
                  onChange={(e) => setNewTrackerUnit(e.target.value)}
                  placeholder="Unit (e.g. cups, g, ml)"
                  className="w-full px-4 py-3 rounded-lg border border-brand-200 bg-white mb-4 text-body font-body focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              )}
              
              <div className="flex gap-2">
                <button onClick={() => setShowCreateTracker(false)} className="flex-1 py-2 rounded-lg bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors">
                  Cancel
                </button>
                <button onClick={createTracker} className="flex-1 py-2 rounded-lg bg-brand-600 text-white">
                  Create
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
            Streak: less than 5g/day
          </span>
        
      </div>
    </div>
  );
}

export default HomePage;

