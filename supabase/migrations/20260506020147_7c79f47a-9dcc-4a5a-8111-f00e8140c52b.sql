-- Tabela principal de notificações
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NULL, -- NULL = broadcast para todos
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  is_read BOOLEAN NOT NULL DEFAULT false, -- usado para mensagens dirigidas
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_receiver ON public.notifications(receiver_id, created_at DESC);
CREATE INDEX idx_notifications_broadcast ON public.notifications(created_at DESC) WHERE receiver_id IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Leitura: destinatário, broadcast (todos autenticados), e gestores veem tudo
CREATE POLICY "Usuários veem suas notificações e broadcasts"
ON public.notifications FOR SELECT
TO authenticated
USING (
  receiver_id = auth.uid()
  OR receiver_id IS NULL
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
);

-- Inserção: apenas gestores
CREATE POLICY "Apenas gestores inserem notificações"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND sender_id = auth.uid()
);

-- Update (marcar como lida): apenas o destinatário próprio (apenas para mensagens dirigidas)
CREATE POLICY "Destinatário marca como lida"
ON public.notifications FOR UPDATE
TO authenticated
USING (receiver_id = auth.uid())
WITH CHECK (receiver_id = auth.uid());

-- Delete: gestores
CREATE POLICY "Gestores excluem notificações"
ON public.notifications FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

-- Tabela de leituras individuais para broadcasts
CREATE TABLE public.notification_reads (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem próprias leituras"
ON public.notification_reads FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Usuários registram própria leitura"
ON public.notification_reads FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());