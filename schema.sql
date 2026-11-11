-- ============================================================================
-- HisarKiAawaj (हिसार की आवाज़) — Complete Supabase PostgreSQL Schema
-- Tables: profiles, categories, articles, advertisements
-- Features: Strict Row Level Security (RLS), Indexes, Storage Bucket & Policies, Admin Promotion
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE article_status AS ENUM ('draft', 'published', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_placement AS ENUM (
    'top_leaderboard',
    'infeed_between_hero',
    'infeed_card',
    'infeed_between_rows',
    'sidebar_carousel',
    'our_clients',
    'in_article'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE (Tracks admin roles securely linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT DEFAULT 'Admin',
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. ARTICLES TABLE
CREATE TABLE IF NOT EXISTS public.articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name TEXT DEFAULT 'HisarKiAawaj Bureau',
  status article_status NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  views_count INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. ADVERTISEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.advertisements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  placement ad_placement NOT NULL DEFAULT 'top_leaderboard',
  image_url TEXT NOT NULL,
  destination_url TEXT DEFAULT '#',
  sponsor_title TEXT,
  sponsor_subtitle TEXT,
  cta_text TEXT DEFAULT 'क्लिक करें ↗',
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. INDEXES FOR HIGH-TRAFFIC QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON public.articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category_id);
-- Convert is_featured to boolean if it exists as integer
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'articles' 
      AND column_name = 'is_featured' 
      AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    ALTER TABLE public.articles 
    ALTER COLUMN is_featured TYPE BOOLEAN USING (is_featured = 1);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'advertisements' 
      AND column_name = 'is_active' 
      AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    ALTER TABLE public.advertisements 
    ALTER COLUMN is_active TYPE BOOLEAN USING (is_active = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_articles_featured ON public.articles(is_featured);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_ads_placement_active ON public.advertisements(placement, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 8. AUTOMATIC UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_articles_updated_at ON public.articles;
CREATE TRIGGER trigger_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_ads_updated_at ON public.advertisements;
CREATE TRIGGER trigger_ads_updated_at
  BEFORE UPDATE ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. USER SIGNUP PROFILE TRIGGER (Defaults new users to 'viewer', NOT 'admin')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer' -- STRICT: Never grant admin automatically!
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. HELPER FUNCTION TO PROMOTE FIRST ADMIN SECURELY
-- (Run this in the Supabase SQL Editor with your desired admin email)
CREATE OR REPLACE FUNCTION public.promote_to_admin(target_email TEXT)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = target_email;
  IF v_user_id IS NULL THEN
    RETURN 'Error: User with email ' || target_email || ' does not exist in auth.users. Please create the user in Supabase Auth first.';
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (v_user_id, target_email, 'admin', split_part(target_email, '@', 1))
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin';

  RETURN 'Success: ' || target_email || ' has been granted administrator privileges.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- PROFILES POLICIES
-- Users can view their own profile, admins can view all profiles
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- Users CANNOT change their own role (only admins can update profiles)
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- CATEGORIES POLICIES
-- Anyone can view categories
DROP POLICY IF EXISTS "Categories public read" ON public.categories;
CREATE POLICY "Categories public read" ON public.categories
  FOR SELECT USING (true);

-- Only admins can insert, update, or delete categories
DROP POLICY IF EXISTS "Categories admin insert" ON public.categories;
CREATE POLICY "Categories admin insert" ON public.categories
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Categories admin update" ON public.categories;
CREATE POLICY "Categories admin update" ON public.categories
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Categories admin delete" ON public.categories;
CREATE POLICY "Categories admin delete" ON public.categories
  FOR DELETE USING (public.is_admin());

-- ARTICLES POLICIES
-- Public visitors can read ONLY published articles where published_at <= NOW()
-- Admins can read ALL articles (drafts, scheduled, published)
DROP POLICY IF EXISTS "Articles read policy" ON public.articles;
CREATE POLICY "Articles read policy" ON public.articles
  FOR SELECT USING (
    (status = 'published' AND published_at <= timezone('utc'::text, now()))
    OR public.is_admin()
  );

-- Only admins can create, edit, or delete articles
DROP POLICY IF EXISTS "Articles admin insert" ON public.articles;
CREATE POLICY "Articles admin insert" ON public.articles
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Articles admin update" ON public.articles;
CREATE POLICY "Articles admin update" ON public.articles
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Articles admin delete" ON public.articles;
CREATE POLICY "Articles admin delete" ON public.articles
  FOR DELETE USING (public.is_admin());

-- ADVERTISEMENTS POLICIES
-- Public can read ONLY active ads within their valid date range
-- Admins can read all ads
DROP POLICY IF EXISTS "Advertisements read policy" ON public.advertisements;
CREATE POLICY "Advertisements read policy" ON public.advertisements
  FOR SELECT USING (
    (
      is_active = true
      AND (starts_at IS NULL OR starts_at <= timezone('utc'::text, now()))
      AND (ends_at IS NULL OR ends_at >= timezone('utc'::text, now()))
    )
    OR public.is_admin()
  );

-- Only admins can insert, update, or delete ads
DROP POLICY IF EXISTS "Advertisements admin insert" ON public.advertisements;
CREATE POLICY "Advertisements admin insert" ON public.advertisements
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Advertisements admin update" ON public.advertisements;
CREATE POLICY "Advertisements admin update" ON public.advertisements
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Advertisements admin delete" ON public.advertisements;
CREATE POLICY "Advertisements admin delete" ON public.advertisements
  FOR DELETE USING (public.is_admin());

-- 12. STORAGE BUCKET CONFIGURATION FOR "news-media"
-- Run these storage configuration statements:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-media',
  'news-media',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = 10485760;

-- Storage RLS: Public can read all images in 'news-media'
DROP POLICY IF EXISTS "Public news-media read" ON storage.objects;
CREATE POLICY "Public news-media read" ON storage.objects
  FOR SELECT USING (bucket_id = 'news-media');

-- Storage RLS: Only admins can upload, update, and delete images
DROP POLICY IF EXISTS "Admin news-media insert" ON storage.objects;
CREATE POLICY "Admin news-media insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'news-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admin news-media update" ON storage.objects;
CREATE POLICY "Admin news-media update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'news-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admin news-media delete" ON storage.objects;
CREATE POLICY "Admin news-media delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'news-media' AND public.is_admin());

-- 13. SEED INITIAL DEFAULT CATEGORIES (Matching HisarKiAawaj)
INSERT INTO public.categories (name, slug, description, order_index)
VALUES
  ('हिसार विशेष', 'hisar-special', 'हिसार शहर और आसपास के स्थानीय समाचार', 1),
  ('हरियाणा', 'haryana', 'हरियाणा राज्य स्तरीय विकास और नीतियां', 2),
  ('क्राइम व जांच', 'crime', 'अपराध, कानून व्यवस्था और पुलिस कार्रवाई', 3),
  ('मंडी भाव', 'mandi-rates', 'हिसार कृषि अनाज व कपास मंडी दैनिक भाव', 4),
  ('शिक्षा-करियर', 'education', 'विश्वविद्यालय, स्कूल और रोजगार अपडेट', 5),
  ('कारोबार', 'business', 'व्यापार, उद्योग और स्थानीय बाजार', 6),
  ('खेल', 'sports', 'जिला व राज्य स्तरीय खेल प्रतियोगिताएं', 7),
  ('लाइफस्टाइल व संस्कृति', 'lifestyle', 'कला, विरासत और जनजीवन', 8)
ON CONFLICT (slug) DO NOTHING;

-- 14. ARTICLES & ADS TABLE READY FOR REAL CONTENT
-- Real articles and advertisements will be published directly from the Admin Portal.
