# Publio â€” Multi-Platform Social Media Publishing Platform

Publio is a lightweight, self-hosted, production-grade social media publishing application built with HTML5, Bootstrap 5, Vanilla JavaScript, and Supabase (Auth, PostgreSQL, Storage, Edge Functions).

Create a post once (text or image + caption) and publish it directly to **Telegram, Facebook, Instagram, LinkedIn, and X**.

---

## ðŸŒŸ Key Architecture & Features

- **Direct API Communications**: Zero third-party automation dependencies (No Make.com, Zapier, or n8n). Publio communicates directly with official social media platform REST and Graph APIs.
- **Server-Side Credentials Security**: Platform API keys, bot tokens, and access tokens are strictly stored server-side in Supabase PostgreSQL (protected by Row Level Security) and processed inside Supabase Edge Functions. Credentials are **never** exposed to client-side JavaScript.
- **First-Class Telegram Publishing**: Official Telegram Bot API integration supporting text-only (`sendMessage`) and media + caption (`sendPhoto`) posts.
- **Supabase Storage**: Image uploads are stored in the `post-images` bucket with user-scoped RLS paths (`post-images/{user_id}/{post_id}/{filename}`). Base64 is never stored in PostgreSQL.
- **Per-Platform Results & Granular Retries**: Each platform's status (`pending`, `publishing`, `published`, `failed`) and platform post IDs or error tracebacks are logged individually. If one platform fails, only that specific platform is retried.

---

## ðŸ“‚ Project Structure

```
Publio/
â”œâ”€â”€ index.html               # Authentication router & landing redirect
â”œâ”€â”€ login.html               # Sign In and Sign Up page (tabbed interface)
â”œâ”€â”€ dashboard.html           # Mobile-first dashboard & post creation UI
â”œâ”€â”€ posts.html               # Post history, filterable list & platform details modal
â”œâ”€â”€ settings.html            # Social connections & Telegram Bot setup form
â”œâ”€â”€ css/
â”‚   â””â”€â”€ style.css            # Custom CSS dark theme & Bootstrap 5 extensions
â”œâ”€â”€ js/
â”‚   â”œâ”€â”€ config.js            # Supabase Project URL & Public Anon Key configuration
â”‚   â”œâ”€â”€ supabase.js          # Supabase Client SDK singleton
â”‚   â”œâ”€â”€ auth.js              # Auth handlers, login/signup, session persistence & guards
â”‚   â”œâ”€â”€ posts.js             # Post management, draft saving & metrics calculation
â”‚   â”œâ”€â”€ storage.js           # Supabase Storage file upload & deletion helpers
â”‚   â”œâ”€â”€ platforms.js         # Settings & platform connection state manager
â”‚   â”œâ”€â”€ ui.js                # Toast notifications, alerts & loading spinners
â”‚   â””â”€â”€ utils.js             # Date formatting, string truncation & status badges
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ functions/
â”‚   â”‚   â”œâ”€â”€ publish-telegram/
â”‚   â”‚   â”‚   â””â”€â”€ index.ts     # Server-side Telegram Bot API publishing
â”‚   â”‚   â”œâ”€â”€ publish-facebook/
â”‚   â”‚   â”‚   â””â”€â”€ index.ts     # Facebook Graph API Page publishing
â”‚   â”‚   â”œâ”€â”€ publish-instagram/
â”‚   â”‚   â”‚   â””â”€â”€ index.ts     # Instagram Graph API two-step container publishing
â”‚   â”‚   â”œâ”€â”€ publish-linkedin/
â”‚   â”‚   â”‚   â””â”€â”€ index.ts     # LinkedIn ugcPosts API publishing
â”‚   â”‚   â””â”€â”€ publish-x/
â”‚   â”‚       â””â”€â”€ index.ts     # X (Twitter) API v2 Tweet publishing
â”‚   â””â”€â”€ sql/
â”‚       â”œâ”€â”€ 001_schema.sql   # Tables (profiles, social_accounts, posts, post_platforms, activity_logs)
â”‚       â”œâ”€â”€ 002_rls.sql      # Row Level Security (RLS) policies
â”‚       â”œâ”€â”€ 003_storage.sql  # post-images bucket & storage RLS policies
â”‚       â”œâ”€â”€ 004_functions.sql# Triggers for updated_at & automatic profile creation
â”‚       â””â”€â”€ 005_seed.sql     # Verification query script
â”œâ”€â”€ .env.example             # Environment variables template
â””â”€â”€ README.md                # Project documentation
```

---

## ðŸš€ Quick Setup & Deployment Guide

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

## ðŸ“± Telegram Setup Instructions

1. Start a chat with **@BotFather** on Telegram.
2. Send `/newbot`, choose a bot name, and copy the **HTTP API Token**.
3. Create or select a Telegram Channel.
4. Add your Bot as an **Administrator** of the channel with **Post Messages** permission.
5. In Publio, go to **Social Settings**, enter your Bot Token and Channel ID (e.g. `-1001234567890`), and click **Save Telegram Credentials**.

---

## ðŸ“„ License

MIT License â€” Free for personal and commercial deployment.
#
