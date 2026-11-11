CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- Move helpers out of the exposed API schema (policies and the view follow by OID)
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_shop_manager(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_shop_staff(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_barber(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_shop_public(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_barber_public(uuid) SET SCHEMA private;
ALTER FUNCTION public.list_public_barbers() SET SCHEMA private;

-- Rewrite bodies so internal calls point at the private schema
CREATE OR REPLACE FUNCTION private.is_shop_manager(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_user_id, 'shop_manager')
     AND EXISTS (SELECT 1 FROM public.shop_managers WHERE user_id = _user_id AND shop_id = _shop_id)
$$;

CREATE OR REPLACE FUNCTION private.is_shop_staff(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_shop_manager(_user_id, _shop_id)
      OR (private.has_role(_user_id, 'barber') AND EXISTS (
            SELECT 1 FROM public.barbers
            WHERE user_id = _user_id AND shop_id = _shop_id AND is_active))
$$;

CREATE OR REPLACE FUNCTION private.can_view_barber(_user_id uuid, _barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.barbers b
        WHERE b.id = _barber_id
          AND (
            (b.user_id = _user_id AND b.is_active AND private.has_role(_user_id, 'barber'))
            OR private.is_shop_manager(_user_id, b.shop_id)
          )
      )
$$;

CREATE OR REPLACE FUNCTION private.is_barber_public(_barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = _barber_id AND b.is_active AND private.is_shop_public(b.shop_id)
  )
$$;

CREATE OR REPLACE FUNCTION private.list_public_barbers()
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  name_en text,
  name_ar text,
  photo_url text,
  sort_order integer,
  service_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.shop_id, b.name_en, b.name_ar, b.photo_url, b.sort_order,
         COALESCE(array_agg(sv.id ORDER BY sv.sort_order, sv.id) FILTER (WHERE sv.id IS NOT NULL), '{}'::uuid[])
  FROM public.barbers b
  LEFT JOIN public.barber_services bs ON bs.barber_id = b.id
  LEFT JOIN public.services sv ON sv.id = bs.service_id AND sv.is_active
  WHERE b.is_active AND private.is_shop_public(b.shop_id)
  GROUP BY b.id
$$;

-- Explicit deny for browser roles on the rate limiter (service_role bypasses RLS)
CREATE POLICY "No client access" ON public.rate_limit_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);