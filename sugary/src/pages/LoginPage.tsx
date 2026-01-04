"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function LoginPage() {
  const navigate = useNavigate();
  const [nameTag, setNameTag] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const cleanNameTag = nameTag.trim().toLowerCase();

    if (!cleanNameTag) {
      setError("Enter a name tag dummy");
      setIsLoading(false);
      return;
    }

    // Only letters and numbers
    if (!/^[a-z0-9]+$/i.test(cleanNameTag)) {
      setError("Only letters and numbers allowed");
      setIsLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        // Check if name tag exists
        const { data: existing } = await supabase
          .from("users")
          .select("id")
          .ilike("name_tag", cleanNameTag)
          .single();

        if (existing) {
          setError("Name tag already taken lmao");
          setIsLoading(false);
          return;
        }

        // Create new user
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { data: newUser, error: insertError } = await supabase
          .from("users")
          .insert({
            name_tag: cleanNameTag,
            timezone: timezone,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Auto-join the "Public" group
        const { data: publicGroup } = await supabase
          .from("groups")
          .select("id")
          .eq("name", "Public")
          .single();

        if (publicGroup) {
          await supabase.from("group_members").insert({
            group_id: publicGroup.id,
            user_id: newUser.id,
          });
        }

        localStorage.setItem("userId", newUser.id);
        localStorage.setItem("nameTag", cleanNameTag);
        navigate("/");
      } else {
        // Login - find user
        const { data: user, error: findError } = await supabase
          .from("users")
          .select("*")
          .ilike("name_tag", cleanNameTag)
          .single();

        if (findError || !user) {
          setError("Name tag not found. Maybe sign up?");
          setIsLoading(false);
          return;
        }

        // Ensure user is in Public group (for legacy users)
        const { data: publicGroup } = await supabase
          .from("groups")
          .select("id")
          .eq("name", "Public")
          .single();

        if (publicGroup) {
          // Check if already a member
          const { data: existingMember } = await supabase
            .from("group_members")
            .select("id")
            .eq("group_id", publicGroup.id)
            .eq("user_id", user.id)
            .single();

          if (!existingMember) {
            await supabase.from("group_members").insert({
              group_id: publicGroup.id,
              user_id: user.id,
            });
          }
        }

        localStorage.setItem("userId", user.id);
        localStorage.setItem("nameTag", cleanNameTag);
        navigate("/");
      }
    } catch (err) {
      console.error(err);
      setError("Something broke. Try again.");
    }

    setIsLoading(false);
  };

  return (
    <div className="flex w-full flex-col items-center justify-center bg-brand-50 h-screen px-6">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/sugar.png"
            alt="Sugar"
            className="w-32 h-32 object-contain"
          />
          <h1 className="text-heading-1 font-heading-1 text-brand-600">
            Sugary
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-2">
            <label className="text-body-bold font-body-bold text-default-font">
              Name Tag
            </label>
            <input
              type="text"
              value={nameTag}
              onChange={(e) => setNameTag(e.target.value)}
              placeholder="Enter your name tag"
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 bg-white text-body font-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-error-500 text-caption font-caption">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg bg-brand-400 text-white text-body-bold font-body-bold hover:bg-brand-500 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Loading..." : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

        {/* Toggle mode */}
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-brand-600 text-body font-body underline"
        >
          {mode === "login"
            ? "Don't have an account? Sign up"
            : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}

export default LoginPage;

