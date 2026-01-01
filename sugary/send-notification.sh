#this file is to send custom push notification to all subscribers

###copy this code and paste on terminal
###cd ~/CascadeProjects/Sugary/sugary
###./send-notification.sh


#!/bin/bash

# Send Push Notification to all Sugary subscribers
# Usage: ./send-notification.sh

SUPABASE_URL="https://ioyixenqdshxqgqoocwj.supabase.co/functions/v1/send-weekly-ranking"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveWl4ZW5xZHNoeHFncW9vY3dqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzIwNDcyNywiZXhwIjoyMDgyNzgwNzI3fQ.XqJSKaxAzaY5zAfSL5LH9C4mLgqYgUHtx2z5DyXQ97A"

echo "Testing push notification"
echo ""

curl -X POST "$SUPABASE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{}'

echo ""
echo ""
echo "✅ Done! Check your phone for the notification."

