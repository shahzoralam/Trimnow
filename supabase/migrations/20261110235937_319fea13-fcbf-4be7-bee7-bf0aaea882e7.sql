-- =========================================================
-- TrimTime database foundation
-- =========================================================

-- Extensions (kept out of the public schema)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'shop_manager', 'barber');
CREATE TYPE public.booking_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Generic "column cannot change" trigger function (column name in TG_ARGV[0])
CREATE OR REPLACE FUNCTION public.prevent_column_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  col text := TG_ARGV[0];
BEGIN
  IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
    RAISE EXCEPTION '%.% cannot be changed', TG_TABLE_NAME, col USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- =========================================================
-- Tables (each: CREATE -> GRANT -> ENABLE RLS; policies follow after helpers)
-- =========================================================

-- communities
CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.communities FROM anon, authenticated;
GRANT SELECT ON public.communities TO anon, authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- shops
CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (char_length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  description_en text CHECK (description_en IS NULL OR char_length(description_en) <= 1000),
  description_ar text CHECK (description_ar IS NULL OR char_length(description_ar) <= 1000),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{7,15}$'),
  location_note text CHECK (location_note IS NULL OR char_length(location_note) <= 300),
  slot_interval_min integer NOT NULL DEFAULT 15 CHECK (slot_interval_min BETWEEN 5 AND 120),
  min_lead_time_min integer NOT NULL DEFAULT 30 CHECK (min_lead_time_min BETWEEN 0 AND 1440),
  booking_window_days integer NOT NULL DEFAULT 14 CHECK (booking_window_days BETWEEN 1 AND 90),
  cancel_cutoff_min integer NOT NULL DEFAULT 60 CHECK (cancel_cutoff_min BETWEEN 0 AND 1440),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, slug)
);
CREATE INDEX shops_community_id_idx ON public.shops (community_id);
REVOKE ALL ON public.shops FROM anon, authenticated;
GRANT SELECT ON public.shops TO anon, authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- user_roles (roles live only here, never on a profile table)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- shop_managers
CREATE TABLE public.shop_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id)
);
CREATE INDEX shop_managers_user_id_idx ON public.shop_managers (user_id);
REVOKE ALL ON public.shop_managers FROM anon, authenticated;
GRANT SELECT ON public.shop_managers TO authenticated;
GRANT ALL ON public.shop_managers TO service_role;
ALTER TABLE public.shop_managers ENABLE ROW LEVEL SECURITY;

-- barbers (no anon access at all; public data only via public_barbers)
CREATE TABLE public.barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid UNIQUE,
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 80),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 80),
  photo_url text CHECK (photo_url IS NULL OR (char_length(photo_url) <= 500 AND photo_url ~ '^https://')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX barbers_shop_id_idx ON public.barbers (shop_id);
REVOKE ALL ON public.barbers FROM anon, authenticated;
GRANT SELECT ON public.barbers TO authenticated;
GRANT ALL ON public.barbers TO service_role;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;

-- services
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  price_sar numeric(10,2) NOT NULL CHECK (price_sar >= 0 AND price_sar <= 10000),
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_shop_id_idx ON public.services (shop_id);
REVOKE ALL ON public.services FROM anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- barber_services
CREATE TABLE public.barber_services (
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barber_id, service_id)
);
CREATE INDEX barber_services_service_id_idx ON public.barber_services (service_id);
REVOKE ALL ON public.barber_services FROM anon, authenticated;
GRANT SELECT ON public.barber_services TO authenticated;
GRANT ALL ON public.barber_services TO service_role;
ALTER TABLE public.barber_services ENABLE ROW LEVEL SECURITY;

-- working_hours (weekday: 0 = Sunday ... 6 = Saturday; times are Asia/Riyadh local)
CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT working_hours_time_order CHECK (close_time > open_time),
  UNIQUE (barber_id, weekday)
);
REVOKE ALL ON public.working_hours FROM anon, authenticated;
GRANT SELECT ON public.working_hours TO anon, authenticated;
GRANT ALL ON public.working_hours TO service_role;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

-- breaks (weekday: 0 = Sunday ... 6 = Saturday; Asia/Riyadh local)
CREATE TABLE public.breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breaks_time_order CHECK (end_time > start_time)
);
CREATE INDEX breaks_barber_weekday_idx ON public.breaks (barber_id, weekday);
REVOKE ALL ON public.breaks FROM anon, authenticated;
GRANT SELECT ON public.breaks TO authenticated;
GRANT ALL ON public.breaks TO service_role;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;

-- holidays (barber_id NULL = whole shop closed)
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  barber_id uuid REFERENCES public.barbers(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX holidays_shop_date_uniq ON public.holidays (shop_id, date) WHERE barber_id IS NULL;
CREATE UNIQUE INDEX holidays_barber_date_uniq ON public.holidays (barber_id, date) WHERE barber_id IS NOT NULL;
REVOKE ALL ON public.holidays FROM anon, authenticated;
GRANT SELECT ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  requested_any_barber boolean NOT NULL DEFAULT false,
  price_sar numeric(10,2) NOT NULL CHECK (price_sar >= 0),
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 100),
  customer_mobile text NOT NULL CHECK (customer_mobile ~ '^05[0-9]{8}$'),
  building text NOT NULL CHECK (char_length(btrim(building)) BETWEEN 1 AND 50),
  apartment text NOT NULL CHECK (char_length(btrim(apartment)) BETWEEN 1 AND 20),
  language text NOT NULL DEFAULT 'ar' CHECK (language IN ('en', 'ar')),
  manage_token_hash text UNIQUE CHECK (manage_token_hash IS NULL OR manage_token_hash ~ '^[0-9a-f]{64}$'),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_order CHECK (ends_at > starts_at),
  CONSTRAINT bookings_no_barber_overlap EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX bookings_shop_starts_idx ON public.bookings (shop_id, starts_at);
CREATE INDEX bookings_community_starts_idx ON public.bookings (community_id, starts_at);
CREATE INDEX bookings_service_id_idx ON public.bookings (service_id);
CREATE INDEX bookings_mobile_shop_idx ON public.bookings (customer_mobile, shop_id, starts_at);
REVOKE ALL ON public.bookings FROM anon, authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- rate_limit_events (server-only; keys must be hashed by the caller)
CREATE TABLE public.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 50),
  key_hash text NOT NULL CHECK (char_length(key_hash) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_events_lookup_idx ON public.rate_limit_events (bucket, key_hash, created_at DESC);
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;
GRANT ALL ON public.rate_limit_events TO service_role;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- =========================================================
-- Integrity triggers
-- =========================================================

-- barber_services: barber and service must be in the same shop
CREATE OR REPLACE FUNCTION public.barber_services_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_barber_shop uuid;
  v_service_shop uuid;
BEGIN
  SELECT shop_id INTO v_barber_shop FROM public.barbers WHERE id = NEW.barber_id;
  SELECT shop_id INTO v_service_shop FROM public.services WHERE id = NEW.service_id;
  IF v_barber_shop IS NULL OR v_service_shop IS NULL OR v_barber_shop <> v_service_shop THEN
    RAISE EXCEPTION 'Barber and service must belong to the same shop' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER barber_services_validate
  BEFORE INSERT OR UPDATE ON public.barber_services
  FOR EACH ROW EXECUTE FUNCTION public.barber_services_validate();

-- holidays: a barber day-off must belong to the same shop
CREATE OR REPLACE FUNCTION public.holidays_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_barber_shop uuid;
BEGIN
  IF NEW.barber_id IS NOT NULL THEN
    SELECT shop_id INTO v_barber_shop FROM public.barbers WHERE id = NEW.barber_id;
    IF v_barber_shop IS NULL OR v_barber_shop <> NEW.shop_id THEN
      RAISE EXCEPTION 'Barber does not belong to this shop' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER holidays_validate
  BEFORE INSERT OR UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.holidays_validate();

-- bookings: relationship checks, copy price/duration, compute end time, cancelled_at
CREATE OR REPLACE FUNCTION public.bookings_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_shop_community uuid;
  v_barber record;
  v_service record;
  v_relations_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_relations_changed := true;
  ELSE
    v_relations_changed :=
         NEW.community_id IS DISTINCT FROM OLD.community_id
      OR NEW.shop_id      IS DISTINCT FROM OLD.shop_id
      OR NEW.barber_id    IS DISTINCT FROM OLD.barber_id
      OR NEW.service_id   IS DISTINCT FROM OLD.service_id
      OR NEW.starts_at    IS DISTINCT FROM OLD.starts_at;
    NEW.created_at := OLD.created_at;
  END IF;

  IF v_relations_changed THEN
    SELECT community_id INTO v_shop_community FROM public.shops WHERE id = NEW.shop_id;
    IF NOT FOUND OR v_shop_community IS DISTINCT FROM NEW.community_id THEN
      RAISE EXCEPTION 'Shop does not belong to this community' USING ERRCODE = '23514';
    END IF;

    SELECT shop_id, is_active INTO v_barber FROM public.barbers WHERE id = NEW.barber_id;
    IF NOT FOUND OR v_barber.shop_id IS DISTINCT FROM NEW.shop_id THEN
      RAISE EXCEPTION 'Barber does not belong to this shop' USING ERRCODE = '23514';
    END IF;
    IF NOT v_barber.is_active THEN
      RAISE EXCEPTION 'Barber is not active' USING ERRCODE = '23514';
    END IF;

    SELECT shop_id, is_active, price_sar, duration_min INTO v_service FROM public.services WHERE id = NEW.service_id;
    IF NOT FOUND OR v_service.shop_id IS DISTINCT FROM NEW.shop_id THEN
      RAISE EXCEPTION 'Service does not belong to this shop' USING ERRCODE = '23514';
    END IF;
    IF NOT v_service.is_active THEN
      RAISE EXCEPTION 'Service is not active' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.barber_services
      WHERE barber_id = NEW.barber_id AND service_id = NEW.service_id
    ) THEN
      RAISE EXCEPTION 'Barber does not offer this service' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Price and duration always come from the service (history is locked afterwards)
  IF TG_OP = 'INSERT' OR NEW.service_id IS DISTINCT FROM OLD.service_id THEN
    NEW.price_sar := v_service.price_sar;
    NEW.duration_min := v_service.duration_min;
  ELSE
    NEW.price_sar := OLD.price_sar;
    NEW.duration_min := OLD.duration_min;
  END IF;

  NEW.ends_at := NEW.starts_at + make_interval(mins => NEW.duration_min);

  IF TG_OP = 'INSERT' AND NEW.starts_at < now() THEN
    RAISE EXCEPTION 'Booking start time is in the past' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.starts_at IS DISTINCT FROM OLD.starts_at AND NEW.starts_at < now() THEN
    RAISE EXCEPTION 'Cannot reschedule into the past' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF TG_OP = 'INSERT' OR OLD.status <> 'cancelled' THEN
      NEW.cancelled_at := now();
    ELSE
      NEW.cancelled_at := OLD.cancelled_at;
    END IF;
  ELSE
    NEW.cancelled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER bookings_before_write
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_before_write();

-- Ownership columns that must never move (would break booking history)
CREATE TRIGGER shops_community_immutable BEFORE UPDATE OF community_id ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.prevent_column_change('community_id');
CREATE TRIGGER barbers_shop_immutable BEFORE UPDATE OF shop_id ON public.barbers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_column_change('shop_id');
CREATE TRIGGER services_shop_immutable BEFORE UPDATE OF shop_id ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.prevent_column_change('shop_id');

-- updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.communities   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shops         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.barbers       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.working_hours FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.breaks        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.holidays      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bookings      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Authorization helper functions (security definer, fixed search_path)
-- =========================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_shop_manager(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'shop_manager')
     AND EXISTS (SELECT 1 FROM public.shop_managers WHERE user_id = _user_id AND shop_id = _shop_id)
$$;

CREATE OR REPLACE FUNCTION public.is_shop_staff(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_shop_manager(_user_id, _shop_id)
      OR (public.has_role(_user_id, 'barber') AND EXISTS (
            SELECT 1 FROM public.barbers
            WHERE user_id = _user_id AND shop_id = _shop_id AND is_active))
$$;

-- Admin, manager of the barber's shop, or the (active) barber themself
CREATE OR REPLACE FUNCTION public.can_view_barber(_user_id uuid, _barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.barbers b
        WHERE b.id = _barber_id
          AND (
            (b.user_id = _user_id AND b.is_active AND public.has_role(_user_id, 'barber'))
            OR public.is_shop_manager(_user_id, b.shop_id)
          )
      )
$$;

CREATE OR REPLACE FUNCTION public.is_shop_public(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.communities c ON c.id = s.community_id
    WHERE s.id = _shop_id AND s.is_active AND c.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_barber_public(_barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = _barber_id AND b.is_active AND public.is_shop_public(b.shop_id)
  )
$$;

-- Customer-facing barber list: no user_id or account data
CREATE OR REPLACE FUNCTION public.list_public_barbers()
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
  WHERE b.is_active AND public.is_shop_public(b.shop_id)
  GROUP BY b.id
$$;

CREATE VIEW public.public_barbers WITH (security_invoker = true) AS
  SELECT id, shop_id, name_en, name_ar, photo_url, sort_order, service_ids
  FROM public.list_public_barbers();
REVOKE ALL ON public.public_barbers FROM anon, authenticated;
GRANT SELECT ON public.public_barbers TO anon, authenticated, service_role;

-- Rate limiter for Edge Functions (service_role only). Returns true if allowed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _key_hash text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF _max < 1 OR _window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_bucket || ':' || _key_hash, 0));
  DELETE FROM public.rate_limit_events
   WHERE bucket = _bucket AND key_hash = _key_hash
     AND created_at < now() - make_interval(secs => _window_seconds);
  SELECT count(*) INTO v_count FROM public.rate_limit_events
   WHERE bucket = _bucket AND key_hash = _key_hash;
  IF v_count >= _max THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limit_events (bucket, key_hash) VALUES (_bucket, _key_hash);
  RETURN true;
END;
$$;

-- Function privileges: nothing is callable by default
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_column_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.barber_services_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.holidays_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookings_before_write() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_shop_manager(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_shop_staff(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_barber(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shop_manager(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shop_staff(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_barber(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_shop_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_barber_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_barbers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shop_public(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_barber_public(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_barbers() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

-- =========================================================
-- RLS policies (read-only for browsers; all writes via service_role in Edge Functions)
-- =========================================================

-- communities
CREATE POLICY "Public can view active communities" ON public.communities
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admins and shop staff can view their communities" ON public.communities
  FOR SELECT TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.shops s
               WHERE s.community_id = communities.id
                 AND public.is_shop_staff((SELECT auth.uid()), s.id))
  );

-- shops
CREATE POLICY "Public can view active shops" ON public.shops
  FOR SELECT TO anon, authenticated USING (public.is_shop_public(id));
CREATE POLICY "Admins and shop staff can view their shop" ON public.shops
  FOR SELECT TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin') OR public.is_shop_staff((SELECT auth.uid()), id)
  );

-- services
CREATE POLICY "Public can view active services" ON public.services
  FOR SELECT TO anon, authenticated USING (is_active AND public.is_shop_public(shop_id));
CREATE POLICY "Admins and shop staff can view shop services" ON public.services
  FOR SELECT TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin') OR public.is_shop_staff((SELECT auth.uid()), shop_id)
  );

-- working_hours
CREATE POLICY "Public can view hours of active barbers" ON public.working_hours
  FOR SELECT TO anon, authenticated USING (public.is_barber_public(barber_id));
CREATE POLICY "Staff can view permitted barber hours" ON public.working_hours
  FOR SELECT TO authenticated USING (public.can_view_barber((SELECT auth.uid()), barber_id));

-- breaks
CREATE POLICY "Staff can view permitted barber breaks" ON public.breaks
  FOR SELECT TO authenticated USING (public.can_view_barber((SELECT auth.uid()), barber_id));

-- holidays
CREATE POLICY "Staff can view permitted holidays" ON public.holidays
  FOR SELECT TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR (barber_id IS NULL AND public.is_shop_staff((SELECT auth.uid()), shop_id))
    OR (barber_id IS NOT NULL AND public.can_view_barber((SELECT auth.uid()), barber_id))
  );

-- barbers (no anon policy: customers use public_barbers)
CREATE POLICY "Staff can view permitted barbers" ON public.barbers
  FOR SELECT TO authenticated USING (public.can_view_barber((SELECT auth.uid()), id));

-- barber_services
CREATE POLICY "Staff can view permitted barber services" ON public.barber_services
  FOR SELECT TO authenticated USING (public.can_view_barber((SELECT auth.uid()), barber_id));

-- user_roles
CREATE POLICY "Users can view own roles, admins view all" ON public.user_roles
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin')
  );

-- shop_managers
CREATE POLICY "Managers view own assignments, admins view all" ON public.shop_managers
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin')
  );

-- bookings: own barber calendar, manager's shop, or admin
CREATE POLICY "Staff can view permitted bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.can_view_barber((SELECT auth.uid()), barber_id));

-- rate_limit_events: intentionally no policies (service_role only)

-- Documentation
COMMENT ON COLUMN public.working_hours.weekday IS '0 = Sunday ... 6 = Saturday (Asia/Riyadh local time)';
COMMENT ON COLUMN public.breaks.weekday IS '0 = Sunday ... 6 = Saturday (Asia/Riyadh local time)';
COMMENT ON COLUMN public.bookings.manage_token_hash IS 'SHA-256 hex of the customer manage-link token; raw token is never stored';
COMMENT ON VIEW public.public_barbers IS 'Customer-facing barber data only; no user_id or account details';
COMMENT ON TABLE public.rate_limit_events IS 'Server-only rate limiter storage; keys must be hashed (IP/mobile)';