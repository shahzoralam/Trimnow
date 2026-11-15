CREATE TABLE public.barber_time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barber_time_blocks_time_order CHECK (end_time > start_time)
);

CREATE INDEX barber_time_blocks_barber_date_idx
  ON public.barber_time_blocks (barber_id, block_date);

REVOKE ALL ON public.barber_time_blocks FROM anon, authenticated;
GRANT SELECT ON public.barber_time_blocks TO authenticated;
GRANT ALL ON public.barber_time_blocks TO service_role;
ALTER TABLE public.barber_time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbers and admins can view barber time blocks"
  ON public.barber_time_blocks
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR (
      public.has_role((SELECT auth.uid()), 'barber')
      AND EXISTS (
        SELECT 1 FROM public.barbers b
        WHERE b.id = barber_time_blocks.barber_id
          AND b.user_id = (SELECT auth.uid())
          AND b.is_active
      )
    )
  );

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.barber_time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Barber accounts can only read own barber rows"
  ON public.barbers AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR (user_id = (SELECT auth.uid()) AND is_active)
  );

CREATE POLICY "Barber accounts can only read own working hours"
  ON public.working_hours AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = (SELECT auth.uid()) AND b.is_active)
  );

CREATE POLICY "Barber accounts can only read own breaks"
  ON public.breaks AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = (SELECT auth.uid()) AND b.is_active)
  );

CREATE POLICY "Barber accounts can only read own holidays"
  ON public.holidays AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR (barber_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.barbers b WHERE b.id = holidays.barber_id AND b.user_id = (SELECT auth.uid()) AND b.is_active
    ))
  );

CREATE POLICY "Barber accounts can only read own barber services"
  ON public.barber_services AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = (SELECT auth.uid()) AND b.is_active)
  );

CREATE POLICY "Barber accounts can only read own bookings"
  ON public.bookings AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role((SELECT auth.uid()), 'barber')
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = (SELECT auth.uid()) AND b.is_active)
  );
