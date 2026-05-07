-- YoutubeProvider self-hosted Postgres schema
--
-- 用法（在已装好 Postgres 的 VPS 上执行）：
--   sudo -u postgres psql -c "CREATE DATABASE youtube_provider;"
--   sudo -u postgres psql -c "CREATE USER yt_app WITH PASSWORD 'CHANGE_ME';"
--   sudo -u postgres psql -c "GRANT ALL ON DATABASE youtube_provider TO yt_app;"
--   sudo -u postgres psql -d youtube_provider -f db/schema.sql
--
-- 然后在应用 .env 里设置：
--   DATABASE_URL=postgres://yt_app:CHANGE_ME@127.0.0.1:5432/youtube_provider
--
-- 该 schema 与原 Supabase 项目的列名、类型保持一致，业务代码无需改动。
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== agents =============================================================
CREATE TABLE IF NOT EXISTS public.agents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL DEFAULT '',
  host                TEXT        NOT NULL DEFAULT '',
  capacity            INTEGER     NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'offline'
                                    CHECK (status IN ('online','offline')),
  last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_status            ON public.agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat_at ON public.agents (last_heartbeat_at);

-- ===== streamers ==========================================================
CREATE TABLE IF NOT EXISTS public.streamers (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  live_url              TEXT        NOT NULL DEFAULT '',
  channel_id            TEXT        NOT NULL DEFAULT '',
  target_online_count   INTEGER     NOT NULL DEFAULT 1,
  current_online_count  INTEGER     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'offline'
                                      CHECK (status IN ('online','offline')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_streamers_channel_id ON public.streamers (channel_id);

-- ===== browser_slots ======================================================
CREATE TABLE IF NOT EXISTS public.browser_slots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  browser_id            TEXT        NOT NULL,
  name                  TEXT        NOT NULL DEFAULT '',
  ws_url                TEXT        NOT NULL DEFAULT '',
  state                 TEXT        NOT NULL DEFAULT 'idle'
                                      CHECK (state IN ('idle','busy')),
  connected             BOOLEAN     NOT NULL DEFAULT FALSE,
  tabs_count            INTEGER     NOT NULL DEFAULT 0,
  active_url            TEXT        NOT NULL DEFAULT '',
  tabs                  TEXT[]      NOT NULL DEFAULT '{}',
  current_streamer_id   UUID        REFERENCES public.streamers(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, browser_id)
);
CREATE INDEX IF NOT EXISTS idx_browser_slots_agent_id           ON public.browser_slots (agent_id);
CREATE INDEX IF NOT EXISTS idx_browser_slots_state              ON public.browser_slots (state);
CREATE INDEX IF NOT EXISTS idx_browser_slots_connected          ON public.browser_slots (connected);

-- ===== commands ===========================================================
CREATE TABLE IF NOT EXISTS public.commands (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id      TEXT        NOT NULL UNIQUE,
  agent_id        UUID        NOT NULL REFERENCES public.agents(id)         ON DELETE CASCADE,
  browser_slot_id UUID        NOT NULL REFERENCES public.browser_slots(id)  ON DELETE CASCADE,
  streamer_id     UUID                 REFERENCES public.streamers(id)      ON DELETE SET NULL,
  type            TEXT        NOT NULL
                              CHECK (type IN ('open_stream','go_home','clear_disk_cache','set_power_mode')),
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','sent','done','failed')),
  message         TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commands_agent_status      ON public.commands (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_commands_status_updated_at ON public.commands (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_commands_created_at_desc   ON public.commands (created_at DESC);

-- ===== assignments ========================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id     UUID        NOT NULL REFERENCES public.streamers(id)     ON DELETE CASCADE,
  agent_id        UUID        NOT NULL REFERENCES public.agents(id)        ON DELETE CASCADE,
  browser_slot_id UUID        NOT NULL REFERENCES public.browser_slots(id) ON DELETE CASCADE,
  command_id      UUID                 REFERENCES public.commands(id)      ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running','released')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignments_streamer_status     ON public.assignments (streamer_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_slot_status         ON public.assignments (browser_slot_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_agent_status        ON public.assignments (agent_id, status);

-- ===== admin_auth =========================================================
CREATE TABLE IF NOT EXISTS public.admin_auth (
  account        TEXT        PRIMARY KEY,
  password_hash  TEXT        NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== operation_logs =====================================================
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module      TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  level       TEXT        NOT NULL DEFAULT 'info'
                          CHECK (level IN ('info','warning','error')),
  operator    TEXT        NOT NULL DEFAULT 'system',
  detail      TEXT        NOT NULL DEFAULT '',
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at_desc ON public.operation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_module          ON public.operation_logs (module);

-- ===== updated_at 自动维护 trigger（可选，但推荐） ========================
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'agents','streamers','browser_slots','commands','assignments'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I;',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();',
      tbl, tbl
    );
  END LOOP;
END $$;
