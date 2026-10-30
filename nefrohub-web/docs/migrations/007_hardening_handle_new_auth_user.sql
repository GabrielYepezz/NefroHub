-- docs/migrations/007_hardening_handle_new_auth_user.sql
-- ==============================================================================
-- Migration 007: Hardening do Trigger handle_new_auth_user contra Escalonamento de Privilégios (SEC-01)
-- ==============================================================================
-- Descrição:
-- Corrige a vulnerabilidade potencial SEC-01 onde metadados públicos enviados no
-- endpoint auth.signUp() poderiam atribuir papel 'ADMIN', 'DOCTOR' ou 'DOCTOR_MASTER'
-- no trigger de novos usuários.
--
-- Regra de Segurança Implementada:
-- 1. Qualquer auto-cadastro (signup público) tem o papel inegociavelmente fixado em 'PATIENT'.
-- 2. Papéis privilegiados ('ADMIN', 'DOCTOR', 'DOCTOR_MASTER') só são aceitos se:
--    a) O usuário foi formalmente convidado pela administração (NEW.invited_at IS NOT NULL); OU
--    b) A transação é originada pelo superadministrador/service_role.
-- 3. search_path fixado estritamente em 'public, pg_temp'.
--
-- STATUS: LOCAL (NÃO APLICADA REMOTAMENTE SEM AUTORIZAÇÃO EXPLÍCITA)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_name text;
  v_meta_role text;
  v_is_invited boolean;
BEGIN
  -- Extrai metadados recebidos
  v_meta_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'role', ''));
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Verifica se o usuário é fruto de convite formal administrativo
  v_is_invited := (NEW.invited_at IS NOT NULL);

  -- HARDENING SEC-01: Auto-cadastros NUNCA recebem papéis privilegiados
  IF v_meta_role IN ('ADMIN', 'DOCTOR', 'DOCTOR_MASTER') THEN
    IF v_is_invited OR current_user IN ('service_role', 'supabase_admin', 'postgres') THEN
      v_role := v_meta_role::public.user_role;
    ELSE
      -- Tentativa não autorizada de escalonamento: rebaixa forçadamente para PATIENT
      v_role := 'PATIENT'::public.user_role;
    END IF;
  ELSIF v_meta_role = 'LEGAL_REPRESENTANT' THEN
    v_role := 'LEGAL_REPRESENTANT'::public.user_role;
  ELSE
    v_role := 'PATIENT'::public.user_role;
  END IF;

  -- Inserção segura na tabela pública de usuários
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    status,
    phone,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    'ACTIVE'::public.account_status,
    NEW.raw_user_meta_data->>'phone',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    updated_at = NOW();

  -- Se for ADMIN legítimo (convidado ou service_role), assegura o perfil operacional
  IF v_role = 'ADMIN' THEN
    INSERT INTO public.admin_profiles (user_id, institution_id, department)
    VALUES (NEW.id, '00000000-0000-0000-0000-000000000001', 'Diretoria Clínica/Administração')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
'Trigger de criação de usuário com hardening contra escalonamento de privilégios (SEC-01). Bloqueia autoatribuição de ADMIN e DOCTOR em signups públicos.';
