CREATE TABLE public.portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  asset_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  avg_purchase_price numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  target_weight numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date, asset_name)
);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own snapshots" ON public.portfolio_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own snapshots" ON public.portfolio_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own snapshots" ON public.portfolio_snapshots
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own snapshots" ON public.portfolio_snapshots
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_portfolio_snapshots_updated_at
  BEFORE UPDATE ON public.portfolio_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_portfolio_snapshots_user_date
  ON public.portfolio_snapshots (user_id, snapshot_date);