-- Customer records outlive individual projects. Project names/phones remain snapshots.
BEGIN;
CREATE TABLE public.photographer_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0 AND name = btrim(name)),
  phone text CHECK (phone IS NULL OR phone ~ '^[0-9]+$'),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, photographer_id)
);
-- Missing phone numbers never cause automatic merging, even for identical names.
CREATE UNIQUE INDEX photographer_customers_identity_idx
  ON public.photographer_customers (photographer_id, name, phone) WHERE phone IS NOT NULL;
CREATE INDEX photographer_customers_owner_idx ON public.photographer_customers (photographer_id);
ALTER TABLE public.photographer_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photographer_customers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.photographer_customers TO authenticated;
GRANT ALL ON public.photographer_customers TO service_role;
CREATE POLICY photographer_customers_owner_read ON public.photographer_customers
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.photographers p WHERE p.id = photographer_id AND p.auth_id = auth.uid()
  ));

ALTER TABLE public.projects ADD COLUMN customer_id uuid;
ALTER TABLE public.projects ADD CONSTRAINT projects_customer_owner_fkey
  FOREIGN KEY (customer_id, photographer_id)
  REFERENCES public.photographer_customers (id, photographer_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX projects_customer_idx ON public.projects (customer_id, photographer_id);

CREATE FUNCTION public.connect_project_customer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text := btrim(NEW.customer_name);
  v_phone text := nullif(regexp_replace(coalesce(NEW.customer_phone, ''), '[^0-9]', '', 'g'), '');
  v_customer public.photographer_customers%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
      AND NEW.photographer_id = OLD.photographer_id
      AND btrim(NEW.customer_name) IS NOT DISTINCT FROM btrim(OLD.customer_name)
      AND v_phone IS NOT DISTINCT FROM nullif(regexp_replace(coalesce(OLD.customer_phone, ''), '[^0-9]', '', 'g'), '')
      AND NEW.customer_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    -- Editing a project's identity moves only that project, never other history/notes.
    IF NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id THEN NEW.customer_id := NULL; END IF;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.photographer_customers
      WHERE id = NEW.customer_id AND photographer_id = NEW.photographer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer does not belong to this photographer' USING ERRCODE = '23503'; END IF;
    IF v_customer.name IS DISTINCT FROM v_name OR v_customer.phone IS DISTINCT FROM v_phone THEN
      RAISE EXCEPTION 'Customer information changed; reload before creating a project' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Preserve legacy unnamed projects; current creation API requires a name.
  IF NEW.photographer_id IS NULL OR v_name IS NULL OR v_name = '' THEN RETURN NEW; END IF;
  INSERT INTO public.photographer_customers (photographer_id, name, phone)
    VALUES (NEW.photographer_id, v_name, v_phone)
    ON CONFLICT (photographer_id, name, phone) WHERE phone IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO NEW.customer_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.connect_project_customer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER projects_connect_customer
  BEFORE INSERT OR UPDATE OF customer_name, customer_phone, customer_id, photographer_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.connect_project_customer();

-- Same trigger handles existing projects, concurrent creation, and future edits atomically.
UPDATE public.projects SET customer_id = NULL WHERE customer_id IS NULL;

CREATE VIEW public.photographer_customer_summaries WITH (security_invoker = true) AS
SELECT c.id, c.photographer_id, c.name, c.phone, c.created_at,
  count(p.id)::integer AS project_count,
  count(p.id) FILTER (WHERE p.status <> 'delivered')::integer AS active_project_count,
  min(p.shoot_date) AS first_shoot_date,
  max(p.shoot_date) AS latest_shoot_date
FROM public.photographer_customers c
LEFT JOIN public.projects p ON p.customer_id = c.id AND p.photographer_id = c.photographer_id
GROUP BY c.id;
REVOKE ALL ON public.photographer_customer_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.photographer_customer_summaries TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
