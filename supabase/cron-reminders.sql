-- Cymate Content Studio · daily reminder cron
-- Schedules the send-reminders Edge Function to run once a day.
-- Paste into the Supabase SQL Editor and Run — BUT first see the
-- README for the required setup order (deploy the function, set
-- secrets, then run this).

-- 1) Enable pg_cron and pg_net (needed to schedule + invoke HTTP)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Store the service-role key in Vault so cron can authenticate
-- to the Edge Function. REPLACE the placeholder below with the
-- actual key from Project Settings → API → service_role secret.
-- Vault secrets are encrypted at rest.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    perform vault.create_secret('REPLACE_WITH_SERVICE_ROLE_KEY', 'service_role_key');
  end if;
end $$;

-- 3) Unschedule any prior run with the same name (idempotent)
select cron.unschedule('send-content-reminders')
where exists (select 1 from cron.job where jobname = 'send-content-reminders');

-- 4) Schedule daily at 14:00 UTC. Tweak the cron expression to a
-- time that matches when you usually plan: e.g. '0 8 * * *' for
-- 8am UTC (~3am EST / midnight PST). Use https://crontab.guru/
-- to read cron expressions.
select cron.schedule(
  'send-content-reminders',
  '0 14 * * *',
  $cron$
    select net.http_post(
      url := 'https://dyyykdtpzspfewnjtluc.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);

-- 5) (Optional) View scheduled jobs and recent runs
-- select * from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 5;
