# Publio

> **One post. Multiple platforms. Zero subscription fees.**

Publio is a lightweight, self-hosted social media publishing platform that allows creators, agencies, and developers to write content once and publish it concurrently across **Telegram, Facebook, Instagram, LinkedIn, X (Twitter), YouTube, and TikTok** using official platform APIs.

---

## 1. Problem & Solution

### The Problem
* **SaaS Subscription Fatigue**: Proprietary social media managers (Buffer, Hootsuite, Sprout Social) charge expensive monthly fees per user and connected account.
* **Data Ownership & Lock-in**: Your credentials, drafts, and analytical history are stored in centralized third-party servers.
* **Fragile Automation**: Many tools rely on fragile browser scrapers or unapproved bots that risk account suspension.
* **Manual Cross-Posting Overhead**: Logging into 5–7 separate platforms to post identical text and media wastes valuable time and creates inconsistency.

### The Solution: Publio
* **Direct Serverless API Execution**: Communicates directly with official platform APIs (Graph API, Telegram Bot API, X API v2, YouTube Data API v3, TikTok Content Posting API) via server-side Supabase Edge Functions.
* **100% Self-Hosted & Free**: Host your own backend using Supabase free-tier (PostgreSQL database, Row-Level Security, Edge Functions, user-scoped Storage).
* **Complete Data Ownership**: Your API credentials and tokens remain encrypted in your own database and Supabase Environment Secrets.
* **Targeted Retry System**: If one platform fails during cross-posting (e.g., rate limit or expired token), Publio lets you retry only the failed platform without re-publishing to successful ones.

---

## 2. Platform Media Support & Capability Matrix

Publio supports text captions, photo attachments, and video uploads. However, each social platform has distinct official API requirements and limitations regarding supported media types:

| Platform | Text Only | Photo Attachment | Video Attachment | Platform Notes & Rules |
| :--- | :---: | :---: | :---: | :--- |
| **Telegram** | ✅ Yes | ✅ Yes (JPG, PNG, WEBP, GIF) | ✅ Yes (MP4, WEBM, MOV) | Sent directly to Telegram Channels or Chat IDs via Bot API (`sendPhoto` / `sendVideo` / `sendMessage`). |
| **Facebook Page** | ✅ Yes | ✅ Yes | ✅ Yes | Published to Facebook Pages via Graph API (`/{page-id}/photos`, `/{page-id}/videos`, `/{page-id}/feed`). Personal profiles are not supported. |
| **Instagram** | ❌ No | ✅ Yes | ✅ Yes | **Graph API Requirement**: Instagram does **NOT** support text-only posts. Every post must include a photo or video. Account must be a Business/Creator account linked to a Facebook Page. |
| **LinkedIn** | ✅ Yes | ✅ Yes | ✅ Yes | Uploaded via LinkedIn REST API v2 (`/v2/assets` for images and videos, `/v2/ugcPosts` or `/v2/shares`). |
| **X (Twitter)** | ✅ Yes | ✅ Yes | ✅ Yes | Uses X API v2 and chunked media upload (`media/upload` INIT, APPEND, FINALIZE) for videos. Supports OAuth 2.0 with PKCE. |
| **YouTube** | ✅ Yes | ✅ Yes | ✅ Yes | **Video Posts** upload to YouTube Channel Videos (`videos.insert`). **Text & Photo Posts** automatically route to the YouTube **Community Tab**. |
| **TikTok** | ❌ No | ✅ Yes (Photo Mode) | ✅ Yes (Video Mode) | Uses TikTok Content Posting API v2. Supports **Photo Mode** (Photo + Caption) and **Video Mode**. Text-only is not supported. |

### Supported Media Specifications
* **Photos**: JPG, PNG, WEBP, GIF (Recommended max size: 10 MB per file).
* **Videos**: MP4, WEBM, MOV (Recommended max size: 50 MB per file).

---

## 3. How It Works (System Architecture & Execution Flow)

Publio separates frontend user management from backend API publishing to maximize performance and security.

### Architecture Overview

```text
  [ User Browser ] (HTML5 / Vanilla JS / Obsidian-Gold CSS System)
         │
         │ (1. Authenticate & Submit Post Form)
         ▼
  [ Supabase Cloud Platform ]
     ├── Authentication   ──► User Session & JWT Validation
     ├── Storage Bucket   ──► `post-images` (User-scoped media files)
     └── PostgreSQL DB    ──► `posts` & `post_platforms` (Row-Level Security)
         │
         │ (2. Trigger Serverless Edge Functions concurrently)
         ▼
  [ Supabase Edge Functions (Deno / TypeScript) ]
     ├── publish-telegram   ──► Telegram Bot API
     ├── publish-facebook   ──► Facebook Graph API
     ├── publish-instagram  ──► Instagram Graph API
     ├── publish-linkedin   ──► LinkedIn REST API
     ├── publish-x          ──► X (Twitter) API v2 (PKCE)
     ├── publish-youtube    ──► YouTube Data API v3
     └── publish-tiktok     ──► TikTok Content Posting API
```

### Detailed Execution Flow

1. **Composition & Storage Upload**:
   - The user writes a caption and selects target platforms in the Publio dashboard.
   - If a photo or video is attached, the client uploads the file to the user-scoped Supabase Storage bucket (`post-images/{userId}/{postId}_{timestamp}.ext`).

2. **Database Record Creation**:
   - A parent record is inserted into the `posts` table with status `publishing` (or `draft`).
   - Child records are inserted into the `post_platforms` table for each selected target network with status `pending`.

3. **Concurrent Edge Function Execution**:
   - For every selected platform, the frontend invokes its respective Edge Function (e.g., `publish-telegram`, `publish-facebook`, etc.) asynchronously via standard HTTPS calls.
   - Credentials (API Keys, OAuth Tokens, Secrets) are securely fetched server-side from Supabase Secrets and the encrypted `social_accounts` table.

4. **Official Social API Call**:
   - The Edge Function processes the payload, downloads or streams the attached media URL from Supabase Storage if present, and invokes the official platform API.

5. **Response Logging & Status Update**:
   - Upon completion, the Edge Function updates `post_platforms` with the platform post ID or specific error message.
   - The overall post status is set to `published` if all target platforms succeed, or `failed` if any network encounters an issue.
   - The user can inspect exact platform error tracebacks and click **Retry** on failed platforms without duplicating posts on successful ones.

---

## 4. Key Features

* **Multi-Platform Publishing**: Simultaneously publish to Telegram, Facebook Pages, Instagram Business, LinkedIn Profiles, X (Twitter), YouTube, and TikTok.
* **Unified Media Handling**: Automatic format validation and preview for images (JPG, PNG, WEBP, GIF) and videos (MP4, WEBM, MOV).
* **Granular Status & Response Tracking**: Monitor individual status (`published`, `pending`, `failed`) and view raw API error messages per platform.
* **Smart Retry & Editing System**: Retry only failed platforms with one click, or save/edit draft posts before publishing.
* **Post Reuse**: Load previously published posts as a new draft to quickly republish or modify past content.
* **Zero Browser Credential Exposure**: OAuth client secrets and bot tokens are stored server-side in Supabase Secrets and RLS-protected database tables.
* **Minimal Obsidian & Gold Interface**: Fast, modern, responsive developer-focused UI with dark theme aesthetics.

---

## 5. Tech Stack

### Frontend
* **Core**: HTML5, Vanilla JavaScript (ES6 Modules)
* **Styling**: Custom Obsidian & Gold CSS System (`css/style.css`), Bootstrap 5 grid layout, Bootstrap Icons

### Backend & Infrastructure
* **Backend as a Service**: Supabase
* **Database**: PostgreSQL with Row-Level Security (RLS) policies
* **Storage**: Supabase Storage (`post-images` bucket with user-isolated RLS rules)
* **Serverless Functions**: Supabase Edge Functions (Deno runtime, TypeScript)
* **Authentication**: Supabase Auth (Email & Password with persistent session)

### External APIs
* Telegram Bot API
* Facebook Graph API v19.0
* Instagram Graph API
* LinkedIn REST API v2
* X (Twitter) API v2 (OAuth 2.0 with PKCE)
* Google / YouTube Data API v3
* TikTok Content Posting API v2

---

## 6. Project Structure

```text
Publio/
│
├── index.html                  # App splash / auth status verification
├── login.html                  # Minimalist sign in & sign up page
├── dashboard.html              # Main post composer, metrics & recent posts
├── posts.html                  # Post history, platform breakdown & retry modal
├── settings.html               # Platform OAuth connection setup & credentials guide
│
├── css/
│   └── style.css               # Obsidian Black & Gold design system
│
├── js/
│   ├── auth.js                 # Supabase session management & route guards
│   ├── config.js               # Supabase project URL & anon key configuration
│   ├── platforms.js            # Social account DB CRUD operations
│   ├── posts.js                # Post creation, editing, metrics & Edge Function triggers
│   ├── storage.js              # Media upload & validation helpers
│   ├── supabase.js             # Supabase client initializer
│   ├── ui.js                   # Toast notifications & alert helpers
│   └── utils.js                # HTML escaping, date formatting & status badges
│
├── supabase/
│   ├── functions/              # Edge Functions source code (TypeScript/Deno)
│   │   ├── publish-telegram/
│   │   ├── publish-facebook/
│   │   ├── publish-instagram/
│   │   ├── publish-linkedin/
│   │   ├── publish-x/
│   │   ├── publish-youtube/
│   │   ├── publish-tiktok/
│   │   └── oauth-*-callback/
│   └── sql/                    # Database schema, RLS policies & storage migrations
│       ├── 001_schema.sql
│       ├── 002_rls.sql
│       ├── 003_storage.sql
│       └── 004_functions.sql
│
├── README.md
└── .env.example
```

---

## 7. Getting Started

### 1. Clone Repository
```bash
git clone https://github.com/theprimev/publio.git
cd publio
```

### 2. Configure Supabase Project
1. Create a project at [supabase.com](https://supabase.com).
2. Go to SQL Editor and run the SQL migration files in order:
   - `supabase/sql/001_schema.sql`
   - `supabase/sql/002_rls.sql`
   - `supabase/sql/003_storage.sql`
   - `supabase/sql/004_functions.sql`

### 3. Update Client Configuration
Edit `js/config.js` with your Supabase Project URL and Anon API key:
```javascript
const SUPABASE_CONFIG = {
    url: "https://YOUR_PROJECT_REF.supabase.co",
    anonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

### 4. Deploy Edge Functions
Login to Supabase CLI and deploy the serverless edge functions:
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy publishing functions
npx supabase functions deploy publish-telegram
npx supabase functions deploy publish-facebook
npx supabase functions deploy publish-instagram
npx supabase functions deploy publish-linkedin
npx supabase functions deploy publish-x
npx supabase functions deploy publish-youtube
npx supabase functions deploy publish-tiktok
```

### 5. Set Environment Secrets
Set your platform developer credentials in Supabase Secrets:
```bash
npx supabase secrets set FACEBOOK_APP_ID=your_id FACEBOOK_APP_SECRET=your_secret
npx supabase secrets set LINKEDIN_CLIENT_ID=your_id LINKEDIN_CLIENT_SECRET=your_secret
npx supabase secrets set X_CLIENT_ID=your_id X_CLIENT_SECRET=your_secret
npx supabase secrets set GOOGLE_CLIENT_ID=your_id GOOGLE_CLIENT_SECRET=your_secret
npx supabase secrets set TIKTOK_CLIENT_KEY=your_key TIKTOK_CLIENT_SECRET=your_secret
# For production deployment (Vercel):
npx supabase secrets set SITE_URL=https://publio-p.vercel.app

# For local development:
# npx supabase secrets set SITE_URL=http://localhost:8080
```

---

## 8. Author & License

**Pyae Sone Phyo (TheprimeV)**
* GitHub: [https://github.com/thecrasho](https://github.com/thecrasho)
* Telegram: [https://t.me/thecrasho](https://t.me/thecrasho)
* Email: thecrasho99@gmail.com

Distributed under the **MIT License**.
