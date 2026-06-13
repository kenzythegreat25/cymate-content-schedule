# Email reminders setup

Daily "your post ships tomorrow" emails. Once configured, every user who has a post with `date = tomorrow` and `status ∈ {Scheduled, Drafting}` receives a single email listing those posts.

**Pieces:**

1. **Resend** — the email provider (free tier: 100 emails/day, 3,000/month)
2. **Edge Function** at [`supabase/functions/send-reminders/index.ts`](functions/send-reminders/index.ts) — sends the emails
3. **pg_cron schedule** at [`cron-reminders.sql`](cron-reminders.sql) — runs the function once a day

Total setup: ~10 minutes.

---

## Step 1 — Create a Resend account

1. Go to https://resend.com and sign up (GitHub login works).
2. In **API Keys**, click **Create API Key**. Name it `content-studio`, permission `Sending access`. Copy the `re_…` key.
3. Optional but recommended: add a sending domain in **Domains** and verify the DNS records. Until you do this, you can only send to your own verified email using the default `onboarding@resend.dev` sender — perfect for testing but bad for production.

## Step 2 — Add secrets to Supabase

Go to **Project Settings → Functions → Secrets** in your Supabase dashboard, and add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `re_…` key from step 1 |
| `FROM_EMAIL` | either `Content Studio <onboarding@resend.dev>` (testing) or `Content Studio <hello@yourdomain.com>` (production, after verifying the domain) |
| `APP_URL` | `https://content-schedule-studio.vercel.app` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't set those.

## Step 3 — Deploy the Edge Function

Two options.

### Option A — Supabase Dashboard (no CLI needed)

1. Open **Functions** in the sidebar of your Supabase project.
2. Click **Create a new function**, name it `send-reminders`.
3. Paste the contents of [`functions/send-reminders/index.ts`](functions/send-reminders/index.ts) into the editor.
4. Click **Deploy**.

### Option B — Supabase CLI

If you have the CLI installed (`brew install supabase/tap/supabase`):

```bash
cd cymate-content-schedule
supabase login
supabase link --project-ref dyyykdtpzspfewnjtluc
supabase functions deploy send-reminders
```

## Step 4 — Test the function manually before scheduling

Make sure it works before cron starts hammering it. From the Supabase Dashboard → Functions → `send-reminders` → **Invoke**, click **Send** (no body needed). You should get back something like:

```json
{ "tomorrow": "2026-06-14", "postCount": 0, "userCount": 0, "sent": 0, "failed": 0 }
```

If `postCount > 0`, check the recipient inbox.

If you see `"error": "RESEND_API_KEY is not set"`, your secret didn't save — re-add it under Settings → Functions → Secrets.

## Step 5 — Run the cron SQL

1. Open https://supabase.com/dashboard/project/dyyykdtpzspfewnjtluc/sql/new
2. Open [`cron-reminders.sql`](cron-reminders.sql), copy the content.
3. **Replace `REPLACE_WITH_SERVICE_ROLE_KEY`** with the actual service-role key from **Project Settings → API → service_role secret** (the long one — NEVER expose this in client code).
4. Paste into the SQL editor and **Run**.
5. Verify the job is scheduled: `select * from cron.job;` should show `send-content-reminders` with cron expression `0 14 * * *`.

## Adjusting the schedule

The default is **14:00 UTC daily**. To change it:

```sql
select cron.unschedule('send-content-reminders');
select cron.schedule('send-content-reminders', '0 13 * * *', $cron$ … $cron$);
```

Common picks:
- `0 8 * * *` — 08:00 UTC (~midnight PST, 03:00 EST)
- `0 13 * * *` — 13:00 UTC (~05:00 PST, 08:00 EST) — usually a good "start of day" reminder
- `0 21 * * *` — 21:00 UTC (~13:00 PST, 16:00 EST) — afternoon reminder for next-day posts

Read more at https://crontab.guru/.

## Watching for problems

```sql
-- last 10 runs (success / failure / payload)
select start_time, status, return_message
from cron.job_run_details
order by start_time desc
limit 10;
```

If runs are succeeding but you're not getting emails, check the Resend dashboard → **Logs** for delivery failures (bounces, spam classification, recipient address typos).

## Turning it off

```sql
select cron.unschedule('send-content-reminders');
```

That stops the cron. The Edge Function stays deployed but no longer fires.
