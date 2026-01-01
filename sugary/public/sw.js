// Service Worker for Sugary PWA
const CACHE_NAME = 'sugary-v1';

// Random notifications with title + body pairs
const NOTIFICATIONS = [
  // Educational
  { title: "⚠️ Reality Check", body: "35g/day = diabetes in ~10 years. 35g/week = 90+ years free." },
  { title: "⏱️ Tick Tock", body: "Every gram counts. Don't let your pancreas down today." },
  { title: "💉 Choose Wisely", body: "Insulin injections 4x daily for life. Or just eat less sugar." },
  { title: "💸 Sugar Tax", body: "Diabetes costs $16,000/year to manage. Sugar is not that sweet." },
  { title: "🧠 Brain Fog", body: "High sugar = memory loss, dementia risk. Log your sugar." },
  { title: "🥤 One Soda", body: "1 can = 39g sugar. That's your whole week in one drink." },
  { title: "🍫 One Snickers", body: "27g sugar. Almost a week's limit in one bar." },
  // Casual
  { title: "🍬 Hey", body: "Time to log today's sugar." },
  { title: "🤔 Quick Question", body: "Did you eat sugar today?" },
  { title: "😏 Be Honest", body: "How many grams today?" },
  { title: "🔥 Streak Alert", body: "Don't lose your Sugary streak!" },
  { title: "😤 No Excuses", body: "Don't be a loser. Log your sugar." },
  { title: "👀 We See You", body: "Come on, how much sugar today?" },
  { title: "💕 No Judgment", body: "I'll still love you. Just tell me how many grams." },
  // Weekly ranking
  { title: "🎰 Results In", body: "Did you win or did your pancreas lose?" },
  { title: "⚰️ Leaderboard", body: "Weekly diabetes speedrun results are live." },
  { title: "🩺 Audit Time", body: "Your weekly sugar report is ready." },
  { title: "💀 Week's Over", body: "35g/day = diabetes in 10 years. How'd you do?" },
  { title: "🎂 Future You", body: "Your birthday cake in 20 years might come with insulin." },
];

// Get random notification
function getRandomNotification() {
  return NOTIFICATIONS[Math.floor(Math.random() * NOTIFICATIONS.length)];
}

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received', event);
  console.log('[SW] Has data:', !!event.data);
  
  const randomNotif = getRandomNotification();
  
  let data = {
    title: randomNotif.title,
    body: randomNotif.body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      console.log('[SW] Attempting to parse JSON');
      const parsed = event.data.json();
      console.log('[SW] Parsed data:', parsed);
      data = { ...data, ...parsed };
    } catch (e) {
      console.log('[SW] JSON parse failed, trying text:', e);
      try {
        const text = event.data.text();
        console.log('[SW] Text data:', text);
        if (text && text.length > 0) {
          data.body = text;
        }
      } catch (e2) {
        console.error('[SW] Failed to parse push data:', e2);
      }
    }
  }

  console.log('[SW] Final notification data:', data);

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.png',
    badge: data.badge || '/favicon.png',
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Open Sugary' }
    ],
    requireInteraction: true, // Keep notification visible
    vibrate: [200, 100, 200], // Vibration pattern
    tag: 'sugary-notification' // Replace previous notifications
  };

  console.log('[SW] Showing notification with options:', options);

  event.waitUntil(
    self.registration.showNotification(data.title, options).then(() => {
      console.log('[SW] Notification shown successfully');
    }).catch(err => {
      console.error('[SW] Failed to show notification:', err);
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
