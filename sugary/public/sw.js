// Service Worker for Sugary PWA
const CACHE_NAME = 'sugary-v1';

// Random notification messages
const MESSAGES = [
  // Educational
  "🪦 35g/day = diabetes in ~10 years. 35g/week = 90+ years free. Choose wisely",
  "⏱️ Every gram counts. Don't let your pancreas down today",
  "💉 Insulin injections 4x daily for life. Or just eat less sugar. Your call",
  "🏥 Diabetes costs $16,000/year to manage. Sugar is not that sweet",
  "🧠 High sugar = brain fog, memory loss, dementia risk. Log your sugar today",
  "📊 1 can of soda = 39g sugar. That's your whole week in one drink",
  "🍫 A Snickers has 27g sugar. Almost a week's limit in one bar",
  // Casual
  "🍬 Time to log today's sugar.",
  "🤔 Did you eat sugar today?",
  "😏 Be honest, how many grams today?",
  "🔥 Don't lose your Sugary streak!",
  "😤 Don't be a loser. Log your sugar.",
  "👀 Come on, how much sugar today?",
  "💕 I'll still love you, just tell me how many grams.",
  // Weekly ranking
  "🎰 Sugar roulette results are in. Did you win or did your pancreas lose?",
  "⚰️ Weekly diabetes speedrun leaderboard is live",
  "🩺 Your weekly sugar audit is ready. Your future self is watching",
  "💀 35g/day = diabetes in 10 years. How'd you do this week?",
  "🎂 Your birthday cake in 20 years might come with insulin. Check your ranking",
];

// Get random message
function getRandomMessage() {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
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
  console.log('[SW] Push received');
  
  let data = {
    title: '🍬 Sugary',
    body: getRandomMessage(),
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      // If there's text data, use it, otherwise keep random message
      const text = event.data.text();
      if (text && text.length > 0) {
        data.body = text;
      }
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.png',
    badge: data.badge || '/favicon.png',
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Open Sugary' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // If no window open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
