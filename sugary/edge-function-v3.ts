// @ts-nocheck
// Supabase Edge Function: send-notification
// Deploy to: Supabase Dashboard → Edge Functions → send-weekly-ranking
//
// USAGE:
// ──────────────────────────────────────────────────────────────────────
// RANDOM message (all categories):
//   curl -s -X POST "https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking" \
//     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A" \
//     -H "Content-Type: application/json" \
//     -d '{}'
//
// TYPED random message (update | daily | weekly | educational):
//   curl -s -X POST "https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking" \
//     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A" \
//     -H "Content-Type: application/json" \
//     -d '{"type": "update"}'
//
// Custom message to ALL users (NOT supported on iOS Safari):
//   curl -s -X POST "https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking" \
//     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A" \
//     -H "Content-Type: application/json" \
//     -d '{"title": "🏆 Title", "body": "Message body"}'
//
// Custom message to SPECIFIC users:
//   curl -s -X POST "https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking" \
//     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A" \
//     -H "Content-Type: application/json" \
//     -d '{"title": "👋 Hey!", "body": "Just for you", "users": ["renan"]}'
//
// With custom urgency (very-low | low | normal | high):
//   curl -s -X POST "https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking" \
//     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A" \
//     -H "Content-Type: application/json" \
//     -d '{"type": "weekly", "urgency": "low"}'
//
// NOTE: iOS Safari cannot decrypt custom messages or types.
// iOS WORKAROUND: Send empty payload '{}' - Service Worker auto-detects type from UTC time:
//   - Monday 1 AM UTC         → weekly ranking (Sun 5pm PT)
//   - 1:00-1:15 AM UTC Tue-Sat → daily reminders (5pm PT previous day)
//   - ALL OTHER TIMES          → update notifications (use anytime for updates!)
// Works globally - all users get correct TYPE regardless of timezone
// 
// Default urgency: "high" for custom messages, "normal" for random messages
// ──────────────────────────────────────────────────────────────────────
 
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
 
// ============ ENCODING HELPERS ============
function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
 
function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
 
// ============ VAPID AUTH ============
async function createVapidAuth(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ authorization: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
 
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 43200,
    sub: "mailto:hello@sugary.app",
  };
 
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
 
  const publicKeyBytes = base64UrlDecode(vapidPublicKey);
  const privateKeyBytes = base64UrlDecode(vapidPrivateKey);
 
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };
 
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
 
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
 
  const signature = base64UrlEncode(new Uint8Array(signatureBuffer));
  const jwt = `${unsignedToken}.${signature}`;
 
  return { authorization: `vapid t=${jwt}, k=${vapidPublicKey}` };
}
 
// ============ WEB PUSH ENCRYPTION (RFC 8291) ============
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string,
  isIOSSafari: boolean = false
): Promise<Uint8Array> {
  const userPublicKey = base64UrlDecode(p256dhKey);
  const userAuth = base64UrlDecode(authSecret);
 
  // Generate ephemeral ECDH key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
 
  // Export server public key
  const serverPublicKeyRaw = await crypto.subtle.exportKey("raw", serverKeys.publicKey);
  const serverPublicKey = new Uint8Array(serverPublicKeyRaw);
 
  // Import user's public key
  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
 
  // Derive shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userKey },
    serverKeys.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);
 
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
 
  const encoder = new TextEncoder();
 
  // Create auth info for WebPush
  const authInfo = new Uint8Array([
    ...encoder.encode("WebPush: info\0"),
    ...userPublicKey,
    ...serverPublicKey,
  ]);
 
  // Derive IKM using user's auth secret
  const ikmKey = await crypto.subtle.importKey("raw", userAuth, "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: sharedSecret, info: authInfo },
      ikmKey,
      256
    )
  );
 
  // Import IKM for final key derivation
  const ikmCryptoKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
 
  // Derive content encryption key (CEK) - 128 bits
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt, info: cekInfo },
      ikmCryptoKey,
      128
    )
  );
 
  // Derive nonce - 96 bits
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt, info: nonceInfo },
      ikmCryptoKey,
      96
    )
  );
 
  // Pad payload (add delimiter byte)
  const payloadBytes = encoder.encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Delimiter
 
  // Encrypt with AES-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    paddedPayload
  );
 
  // Build aes128gcm header + encrypted content
  // iOS Safari might need smaller record size (some reports suggest 3072 or 2048)
  const recordSize = isIOSSafari ? 3072 : 4096;
  const header = new Uint8Array(21 + serverPublicKey.length);
  header.set(salt, 0); // 16 bytes salt
  new DataView(header.buffer).setUint32(16, recordSize, false); // 4 bytes record size (big-endian)
  header[20] = serverPublicKey.length; // 1 byte key length
  header.set(serverPublicKey, 21); // server public key
 
  // Combine header + encrypted data
  const encrypted = new Uint8Array(header.length + encryptedBuffer.byteLength);
  encrypted.set(header);
  encrypted.set(new Uint8Array(encryptedBuffer), header.length);
 
  return encrypted;
}
 
// ============ MAIN HANDLER ============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
 
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
 
    // Parse request body
    let title: string | undefined;
    let body: string | undefined;
    let targetUsers: string[] | undefined; // name_tags
    let urgency: "very-low" | "low" | "normal" | "high" | undefined;
    let type: "random" | "update" | "daily" | "weekly" | "educational" | undefined;

    try {
      const reqBody = await req.json();
      title = reqBody.title;
      body = reqBody.body;
      targetUsers = reqBody.users; // name_tags like ["renan", "friend1"]
      urgency = reqBody.urgency; // optional: "very-low" | "low" | "normal" | "high"
      type = reqBody.type; // optional: "random" | "update" | "daily" | "weekly" | "educational"
    } catch {
      // Empty body is OK - will use random (SW fallback)
    }
 
    // Determine if custom message or random (SW fallback)
    const hasCustomMessage = !!(title && body);

    // Smart default for urgency: custom messages = high, random = normal
    const notificationUrgency = urgency || (hasCustomMessage ? "high" : "normal");

    const supabase = createClient(supabaseUrl, supabaseKey);
 
    // Get subscriptions (with optional user filter by name_tag)
    let subs: any[] = [];
 
    if (targetUsers && targetUsers.length > 0) {
      // Look up user IDs from name_tags (case-insensitive)
      // TODO: Consider adding validation for targetUsers array (max length, valid format)
      const lowerNameTags = targetUsers.map(u => u.toLowerCase());

      const { data: users, error: userError } = await supabase
        .from("users")
        .select("id, name_tag")
        .in("name_tag", lowerNameTags);
 
      if (userError) throw userError;
 
      if (!users?.length) {
        return new Response(
          JSON.stringify({ 
            error: "No users found with those name_tags",
            targetUsers
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
 
      const userIds = users.map(u => u.id);
 
      // Get push subscriptions for these users
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", userIds);
 
      if (subError) throw subError;
      subs = subscriptions || [];
 
      // Add name_tag to each subscription for better response
      const userIdToNameTag = Object.fromEntries(users.map(u => [u.id, u.name_tag]));
      subs = subs.map(s => ({ ...s, name_tag: userIdToNameTag[s.user_id] }));
    } else {
      // Get all subscriptions with name_tags
      const { data: subscriptions, error } = await supabase
        .from("push_subscriptions")
        .select("*, users!inner(name_tag)");

      if (error) throw error;
 
      // Flatten the response and validate
      subs = (subscriptions || []).map((s: any) => {
        if (!s.users?.name_tag) {
          throw new Error(`Subscription ${s.id} is missing user name_tag. Database integrity issue.`);
        }
        return {
          ...s,
          name_tag: s.users.name_tag,
          users: undefined
        };
      });
    }
 
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ 
          error: "No subscriptions found",
          targetUsers: targetUsers || "all"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
 
    console.log(`Sending ${hasCustomMessage ? `"${title}"` : "random (SW)"} to ${subs.length} user(s)`);

    // TODO: Consider adding rate limiting or batching for large subscription lists
    const results = await Promise.allSettled(
      subs.map(async (sub: any) => {
        try {
          const vapid = await createVapidAuth(sub.endpoint, vapidPublic, vapidPrivate);
 
          let fetchHeaders: Record<string, string> = {
            Authorization: vapid.authorization,
            TTL: "86400",
            Urgency: notificationUrgency,
          };
 
          let fetchBody: Uint8Array | null = null;

          // Detect iOS Safari (web.push.apple.com) - it has broken encrypted payload support
          const isIOSSafari = sub.endpoint.includes("web.push.apple.com");

          // Determine what to send
          if (hasCustomMessage) {
            // Custom message with title & body
            if (isIOSSafari) {
              throw new Error(`iOS Safari does not support encrypted custom messages. User: ${sub.name_tag || sub.user_id}. Use 'type' parameter for random messages only.`);
            }
            
            if (!sub.p256dh || !sub.auth) {
              throw new Error(`Missing encryption keys (p256dh/auth) for user ${sub.name_tag || sub.user_id}.`);
            }
            
            const payload = JSON.stringify({ title, body, type: type || 'random' });
            const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth, false);
            fetchBody = encrypted;
            fetchHeaders["Content-Type"] = "application/octet-stream";
            fetchHeaders["Content-Encoding"] = "aes128gcm";
            fetchHeaders["Content-Length"] = encrypted.length.toString();
            
          } else if (type && !isIOSSafari) {
            // Type-specific random message for non-iOS (encrypt just the type)
            if (!sub.p256dh || !sub.auth) {
              throw new Error(`Missing encryption keys for user ${sub.name_tag || sub.user_id}.`);
            }
            
            const payload = JSON.stringify({ type });
            const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth, false);
            fetchBody = encrypted;
            fetchHeaders["Content-Type"] = "application/octet-stream";
            fetchHeaders["Content-Encoding"] = "aes128gcm";
            fetchHeaders["Content-Length"] = encrypted.length.toString();
            console.log(`Sending ${type} notification type to ${sub.name_tag || sub.user_id}`);
            
          } else {
            // Truly random message - empty payload (works on iOS)
            fetchHeaders["Content-Length"] = "0";
            if (type && isIOSSafari) {
              console.warn(`[iOS] Cannot send typed notification to ${sub.name_tag || sub.user_id}. Sending random instead.`);
            }
          }
 
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: fetchHeaders,
            body: fetchBody,
          });
 
          if (res.status === 201 || res.status === 200) {
            return { 
              user: sub.name_tag || sub.user_id, 
              status: "sent",
              platform: isIOSSafari ? "iOS Safari" : "Other",
              messageType: hasCustomMessage ? "custom" : "random"
            };
          }
 
          // Subscription expired - clean up
          // TODO: Add logging/metrics for expired subscriptions to track user churn
          if (res.status === 404 || res.status === 410) {
            await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
            return { user: sub.name_tag || sub.user_id, status: "expired" };
          }
 
          const errorText = await res.text();
          return { user: sub.name_tag || sub.user_id, status: "failed", code: res.status, error: errorText };
        } catch (e) {
          return { user: sub.name_tag || sub.user_id, status: "error", msg: (e as Error).message };
        }
      })
    );
 
    // Count results with detailed breakdown
    const sentResults = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.status === "sent");
    const expiredResults = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.status === "expired");
    const failedResults = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.status === "failed");
    const errorResults = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value.status === "error");

    return new Response(
      JSON.stringify({
        success: true,
        mode: hasCustomMessage ? "custom" : "random",
        urgency: notificationUrgency,
        title: title || "(random from SW)",
        body: body || "(random from SW)",
        targetUsers: targetUsers || "all",
        summary: { 
          total: results.length, 
          sent: sentResults.length,
          expired: expiredResults.length,
          failed: failedResults.length,
          errors: errorResults.length,
          expiredUsers: expiredResults.map(r => r.value.user),
          failedUsers: failedResults.map(r => r.value.user),
          errorUsers: errorResults.map(r => r.value.user),
        },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
 