Journal Mobile (Expo)

Overview
- Minimal Expo app to view and create journal entries with Supabase.
- Auth uses email magic link (OTP). Open the link on the same device.

Setup
1) Install dependencies
   - npm i -g expo-cli (optional)
   - cd mobile && npm install
2) Env vars
   - Copy .env.example to .env and set:
     - EXPO_PUBLIC_SUPABASE_URL
     - EXPO_PUBLIC_SUPABASE_ANON_KEY
     - EXPO_PUBLIC_JOURNAL_BUCKET (default: journal)
     - EXPO_PUBLIC_JOURNAL_PRIVATE (true/false)
3) Run
   - npm start
   - Press i for iOS simulator or a for Android, or scan QR with Expo Go.

Notes
- Private buckets: The app stores storage paths and displays images only if your policies allow creating signed URLs client-side. For stricter setups, add an API endpoint to generate signed URLs.
- Deep linking: app.json sets scheme "journal" for magic links. Ensure your Supabase auth redirect URL is configured accordingly.
- Features: Create entry with optional image, list recent entries with pagination. Delete/edit can be added next.

