# Publio - Multi-Platform Social Media Publishing Platform

Publio is a lightweight, self-hosted, production-grade social media publishing application built with HTML5, Bootstrap 5, Vanilla JavaScript, and Supabase (Auth, PostgreSQL, Storage, Edge Functions).

Create a post once (text or image + caption) and publish it directly to **Telegram, Facebook, Instagram, LinkedIn, and X**.

---

## Key Architecture & Features

- **Direct API Communications**: Zero third-party automation dependencies (No Make.com, Zapier, or n8n). Publio communicates directly with official social media platform REST and Graph APIs.
- **Server-Side Credentials Security**: Platform API keys, bot tokens, and access tokens are strictly stored server-side in Supabase PostgreSQL (protected by Row Level Security) and processed inside Supabase Edge Functions. Credentials are **never** exposed to client-side JavaScript.
- **First-Class Telegram Publishing**: Official Telegram Bot API integration supporting text-only (`sendMessage`) and media + caption (`sendPhoto`) posts.
- **Supabase Storage**: Image uploads are stored in the `post-images` bucket with user-scoped RLS paths (`post-images/{user_id}/{post_id}/{filename}`). Base64 is never stored in PostgreSQL.
- **Per-Platform Results & Granular Retries**: Each platform's status (`pending`, `publishing`, `published`, `failed`) and platform post IDs or error tracebacks are logged individually. If one platform fails, only that specific platform is retried.

---

## Project Structure

```
Publio/
|-- index.html               # Authentication router & landing redirect
|-- login.html               # Sign In and Sign Up page (tabbed interface)
|-- dashboard.html           # Mobile-first dashboard & post creation UI
|-- posts.html               # Post history, filterable list & platform details modal
|-- settings.html            # Social connections & Telegram Bot setup form
|-- css/
|   |-- style.css            # Custom CSS dark theme & Bootstrap 5 extensions
|-- js/
|   |-- config.js            # Supabase Project URL & Public Anon Key configuration
|   |-- supabase.js          # Supabase Client SDK singleton
|   |-- auth.js              # Auth handlers, login/signup, session persistence & guards
|   |-- posts.js             # Post management, draft saving & metrics calculation
|   |-- storage.js           # Supabase Storage file upload & deletion helpers
|   |-- platforms.js         # Settings & platform connection state manager
|   |-- ui.js                # Toast notifications, alerts & loading spinners
|   |-- utils.js             # Date formatting, string truncation & status badges
|-- supabase/
|   |-- functions/
|   |   |-- publish-telegram/
|   |   |   |-- index.ts     # Server-side Telegram Bot API publishing
|   |   |-- publish-facebook/
|   |   |   |-- index.ts     # Facebook Graph API Page publishing
|   |   |-- publish-instagram/
|   |   |   |-- index.ts     # Instagram Graph API two-step container publishing
|   |   |-- publish-linkedin/
|   |   |   |-- index.ts     # LinkedIn ugcPosts API publishing
|   |   |-- publish-x/
|   |       |-- index.ts     # X (Twitter) API v2 Tweet publishing
|   |-- sql/
|       |-- 001_schema.sql   # Tables (profiles, social_accounts, posts, post_platforms, activity_logs)
|       |-- 002_rls.sql      # Row Level Security (RLS) policies
|       |-- 003_storage.sql  # post-images bucket & storage RLS policies
|       |-- 004_functions.sql# Triggers for updated_at & automatic profile creation
|       |-- 005_seed.sql     # Verification query script
|-- .env.example             # Environment variables template
|-- README.md                # Project documentation
```

---

## Quick Setup & Deployment Guide

### Step 1: Database Setup
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** and run the following SQL scripts in order:
   - `supabase/sql/001_schema.sql`
   - `supabase/sql/002_rls.sql`
   - `supabase/sql/003_storage.sql`
   - `supabase/sql/004_functions.sql`

### Step 2: Configure Client Keys
Edit `js/config.js` with your project URL and public Anon Key:
```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project-ref.supabase.co',
    anonKey: 'your-supabase-anon-key'
};
```

### Step 3: Deploy Edge Functions
Deploy the serverless Edge Functions using the Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>

# Deploy Edge Functions
npx supabase functions deploy publish-telegram
npx supabase functions deploy publish-facebook
npx supabase functions deploy publish-instagram
npx supabase functions deploy publish-linkedin
npx supabase functions deploy publish-x
```

---

## Telegram Setup Instructions

1. Start a chat with **@BotFather** on Telegram.
2. Send `/newbot`, choose a bot name, and copy the **HTTP API Token**.
3. Create or select a Telegram Channel.
4. Add your Bot as an **Administrator** of the channel with **Post Messages** permission.
5. In Publio, go to **Social Settings**, enter your Bot Token and Channel ID (e.g. `-1001234567890`), and click **Save Telegram Credentials**.

---

## License

MIT License - Free for personal and commercial deployment.
