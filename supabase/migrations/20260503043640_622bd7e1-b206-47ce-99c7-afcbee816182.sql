CREATE TABLE public.portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asset_name TEXT NOT NULL,
  principal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_name)
);

ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own portfolio" ON public.portfolio FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own portfolio" ON public.portfolio FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own portfolio" ON public.portfolio FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own portfolio" ON public.portfolio FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_portfolio_updated_at
BEFORE UPDATE ON public.portfolio
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();