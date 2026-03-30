-- ============================================================
-- Kiparlo - Schema initial pour Supabase.com
-- Migration depuis self-hosted vers cloud
-- ============================================================

-- Extensions (déjà disponibles sur Supabase.com)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_user_recos_by_status(p_user_id uuid, p_statuses text[])
RETURNS integer
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::INTEGER, 0)
  FROM recommendations
  WHERE referrer_id = p_user_id AND status = ANY(p_statuses);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.user_wallet_summaries (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    ip_address text,
    success boolean DEFAULT true,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.compensation_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    commission_rate numeric DEFAULT 10,
    referrer_percentage numeric DEFAULT 60,
    affiliation_bonus_percentage numeric DEFAULT 1,
    professional_cashback_percentage numeric DEFAULT 1,
    level_1_percentage numeric DEFAULT 4,
    level_2_percentage numeric DEFAULT 4,
    level_3_percentage numeric DEFAULT 4,
    level_4_percentage numeric DEFAULT 4,
    level_5_percentage numeric DEFAULT 4,
    platform_percentage numeric DEFAULT 14,
    priority integer DEFAULT 0,
    conditions jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    order_index integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    phone text,
    avatar text,
    is_professional boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    sponsor_code text DEFAULT substr(md5((random())::text), 1, 6),
    sponsor_id uuid,
    address text,
    city text,
    postal_code text,
    country text DEFAULT 'FR'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    latitude double precision,
    longitude double precision
);

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    legal_name text,
    email text,
    phone text,
    website text,
    address text,
    city text,
    postal_code text,
    country text DEFAULT 'FR'::text,
    latitude numeric,
    longitude numeric,
    radius integer DEFAULT 50,
    category_id uuid,
    siret text,
    siren text,
    vat_number text,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    address text,
    city text,
    postal_code text,
    country text DEFAULT 'FR'::text,
    company_name text,
    job_title text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    professional_id uuid NOT NULL,
    company_id uuid,
    contact_id uuid,
    compensation_plan_id uuid,
    project_description text,
    urgency_level text DEFAULT 'normal'::text,
    status text DEFAULT 'PENDING'::text,
    amount numeric,
    professional_response_at timestamp with time zone,
    contact_made_at timestamp with time zone,
    validation_date timestamp with time zone,
    rejection_reason text,
    transferred_at timestamp with time zone,
    transfer_reason text,
    original_recommendation_id uuid,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recommendations_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'CONTACT_MADE'::text, 'MEETING_SCHEDULED'::text, 'QUOTE_SUBMITTED'::text, 'QUOTE_VALIDATED'::text, 'PAYMENT_RECEIVED'::text, 'COMPLETED'::text, 'REJECTED'::text, 'TRANSFERRED'::text, 'EXPIRED'::text]))),
    CONSTRAINT recommendations_urgency_check CHECK ((urgency_level = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);

CREATE TABLE public.recommendation_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recommendation_id uuid NOT NULL,
    step_id uuid NOT NULL,
    completed_at timestamp with time zone,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.commission_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recommendation_id uuid NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    level integer,
    type text DEFAULT 'recommendation'::text,
    status text DEFAULT 'PENDING'::text,
    referrer_id uuid,
    earned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT commission_transactions_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'EARNED'::text, 'CANCELLED'::text]))),
    CONSTRAINT commission_transactions_type_check CHECK ((type = ANY (ARRAY['recommendation'::text, 'referral_level_1'::text, 'referral_level_2'::text, 'referral_level_3'::text, 'referral_level_4'::text, 'referral_level_5'::text, 'affiliation_bonus'::text, 'professional_cashback'::text])))
);

CREATE TABLE public.user_wallet_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    total_earned numeric DEFAULT 0,
    total_withdrawn numeric DEFAULT 0,
    pending_commissions numeric DEFAULT 0,
    available numeric DEFAULT 0,
    total_wins numeric DEFAULT 0,
    available_wins numeric DEFAULT 0,
    redeemed_wins numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'PENDING'::text,
    method text DEFAULT 'bank_transfer'::text,
    bank_details jsonb,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT withdrawals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'REJECTED'::text])))
);

CREATE TABLE public.devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'web'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reviewer_id uuid NOT NULL,
    professional_id uuid NOT NULL,
    recommendation_id uuid,
    rating integer,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

CREATE TABLE public.otp_codes (
    email text NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- PRIMARY KEYS
-- ============================================================

ALTER TABLE ONLY public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.commission_transactions ADD CONSTRAINT commission_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.compensation_plans ADD CONSTRAINT compensation_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.devices ADD CONSTRAINT devices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.otp_codes ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (email);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_sponsor_code_key UNIQUE (sponsor_code);
ALTER TABLE ONLY public.recommendation_steps ADD CONSTRAINT recommendation_steps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recommendations ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.steps ADD CONSTRAINT steps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_wallet_summaries ADD CONSTRAINT user_wallet_summaries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_wallet_summaries ADD CONSTRAINT user_wallet_summaries_user_id_key UNIQUE (user_id);
ALTER TABLE ONLY public.withdrawals ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_sponsor_id_fkey FOREIGN KEY (sponsor_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_compensation_plan_id_fkey FOREIGN KEY (compensation_plan_id) REFERENCES public.compensation_plans(id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_original_recommendation_id_fkey FOREIGN KEY (original_recommendation_id) REFERENCES public.recommendations(id);

ALTER TABLE ONLY public.recommendation_steps
    ADD CONSTRAINT recommendation_steps_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recommendation_steps
    ADD CONSTRAINT recommendation_steps_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.steps(id);

ALTER TABLE ONLY public.commission_transactions
    ADD CONSTRAINT commission_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.commission_transactions
    ADD CONSTRAINT commission_transactions_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id);

ALTER TABLE ONLY public.commission_transactions
    ADD CONSTRAINT commission_transactions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_wallet_summaries
    ADD CONSTRAINT user_wallet_summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger auto-création profil + wallet à l'inscription
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_recommendations_updated_at
  BEFORE UPDATE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallet_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Categories (lecture publique)
CREATE POLICY categories_select ON public.categories FOR SELECT USING (true);

-- Profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((auth.uid() = id));

-- Companies
CREATE POLICY companies_select ON public.companies FOR SELECT USING (true);
CREATE POLICY companies_manage ON public.companies USING ((auth.uid() = owner_id));

-- Contacts
CREATE POLICY contacts_all ON public.contacts USING ((auth.uid() = user_id));

-- Recommendations
CREATE POLICY reco_select ON public.recommendations FOR SELECT USING (((auth.uid() = referrer_id) OR (auth.uid() = professional_id)));
CREATE POLICY reco_insert ON public.recommendations FOR INSERT WITH CHECK ((auth.uid() = referrer_id));
CREATE POLICY reco_update ON public.recommendations FOR UPDATE USING (((auth.uid() = referrer_id) OR (auth.uid() = professional_id)));

-- Recommendation steps
CREATE POLICY reco_steps_select ON public.recommendation_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.recommendations r
  WHERE ((r.id = recommendation_steps.recommendation_id) AND ((r.referrer_id = auth.uid()) OR (r.professional_id = auth.uid()))))));
CREATE POLICY reco_steps_insert ON public.recommendation_steps FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.recommendations r
  WHERE ((r.id = recommendation_steps.recommendation_id) AND ((r.referrer_id = auth.uid()) OR (r.professional_id = auth.uid()))))));
CREATE POLICY reco_steps_update ON public.recommendation_steps FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.recommendations r
  WHERE ((r.id = recommendation_steps.recommendation_id) AND ((r.referrer_id = auth.uid()) OR (r.professional_id = auth.uid()))))));

-- Commissions
CREATE POLICY commission_select ON public.commission_transactions FOR SELECT USING ((auth.uid() = user_id));

-- Compensation plans (lecture publique)
CREATE POLICY plans_select ON public.compensation_plans FOR SELECT USING (true);

-- Steps (lecture publique)
CREATE POLICY steps_select ON public.steps FOR SELECT USING (true);

-- Wallet
CREATE POLICY wallet_select ON public.user_wallet_summaries FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY wallet_insert ON public.user_wallet_summaries FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY wallet_update ON public.user_wallet_summaries FOR UPDATE USING ((auth.uid() = user_id));

-- Withdrawals
CREATE POLICY withdrawal_all ON public.withdrawals USING ((auth.uid() = user_id));

-- Devices
CREATE POLICY device_all ON public.devices USING ((auth.uid() = user_id));

-- Reviews
CREATE POLICY reviews_select ON public.reviews FOR SELECT USING (true);
CREATE POLICY reviews_insert ON public.reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));
