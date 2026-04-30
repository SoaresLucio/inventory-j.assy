
-- Tabela de pedidos de redefinição de senha
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  social_name TEXT NOT NULL,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

CREATE INDEX idx_prr_status ON public.password_reset_requests(status, created_at DESC);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode criar um pedido (login esquecido — não está autenticado)
CREATE POLICY "Qualquer um pode pedir redefinição"
ON public.password_reset_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Apenas gestores podem visualizar os pedidos
CREATE POLICY "Gestores veem pedidos"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role));

-- Apenas gestores atualizam (resolver)
CREATE POLICY "Gestores resolvem pedidos"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

-- Apenas gestores excluem
CREATE POLICY "Gestores excluem pedidos"
ON public.password_reset_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role));
