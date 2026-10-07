-- Selection completion is independent of external link sharing/delivery.
ALTER TABLE public.customer_projects ADD COLUMN IF NOT EXISTS selection_completed_at timestamptz;
COMMENT ON COLUMN public.customer_projects.selection_completed_at IS 'Owner finished choosing; does not indicate photographer delivery or lock selections.';
