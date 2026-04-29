-- Enum para funções
CREATE TYPE public.app_role AS ENUM ('inventarista', 'gestor');

-- Tabela de perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  social_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela de roles (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função security definer para checar role sem recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Tabela de itens de inventário
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  uc TEXT NOT NULL,
  lote TEXT NOT NULL,
  endereco TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id TEXT
);

CREATE INDEX idx_inventory_user ON public.inventory_items(user_id);
CREATE INDEX idx_inventory_created ON public.inventory_items(created_at DESC);
CREATE INDEX idx_inventory_endereco ON public.inventory_items(endereco);
CREATE UNIQUE INDEX idx_inventory_client_id ON public.inventory_items(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- RLS: profiles
CREATE POLICY "Usuários veem próprio perfil"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Usuários atualizam próprio perfil"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Inserir próprio perfil"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- RLS: user_roles
CREATE POLICY "Usuários veem própria role"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores gerenciam roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

-- RLS: inventory_items
CREATE POLICY "Inventaristas veem próprios registros, gestores veem tudo"
ON public.inventory_items FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Usuários autenticados inserem registros próprios"
ON public.inventory_items FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Apenas gestores editam"
ON public.inventory_items FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Apenas gestores excluem"
ON public.inventory_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

-- Trigger: criar perfil + role default ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_social_name TEXT;
  v_is_seed_gestor BOOLEAN;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_social_name := COALESCE(NEW.raw_user_meta_data->>'social_name', split_part(NEW.email, '@', 1));
  v_is_seed_gestor := (NEW.email = 'gestor_ol@jassy.local');

  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (NEW.id, v_full_name, v_social_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_seed_gestor THEN 'gestor'::app_role ELSE 'inventarista'::app_role END);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();