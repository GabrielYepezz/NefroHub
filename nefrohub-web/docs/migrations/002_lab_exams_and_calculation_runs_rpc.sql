-- ============================================================================
-- NEFROHUB - MIGRATION 002: RPC TRANSACIONAL DE EXAMES LABORATORIAIS E CKD-EPI 2021
-- Idempotente e em conformidade estrita com documentation.md (Seções 8.4, 10.1 e 10.4)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_record_lab_exam(
  p_patient_id UUID,
  p_exam_name TEXT,
  p_numeric_value NUMERIC,
  p_original_unit TEXT,
  p_clinical_date DATE DEFAULT CURRENT_DATE,
  p_calculate_egfr BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_record_id UUID;
  v_birth_date DATE;
  v_sex public.biological_sex;
  v_age INT;
  v_is_female BOOLEAN;
  v_kappa NUMERIC;
  v_alpha NUMERIC;
  v_sex_factor NUMERIC;
  v_scr_over_kappa NUMERIC;
  v_min_comp NUMERIC;
  v_max_comp NUMERIC;
  v_egfr NUMERIC := NULL;
  v_rounded_egfr NUMERIC := NULL;
  v_stage TEXT := NULL;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identificação do médico autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 2. Validar que o médico possui vínculo ativo com o paciente
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = p_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 3. Validações de entrada
  IF p_exam_name IS NULL OR trim(p_exam_name) = '' THEN
    RAISE EXCEPTION 'O nome do exame laboratorial é obrigatório.';
  END IF;

  IF p_numeric_value IS NULL OR p_numeric_value <= 0 THEN
    RAISE EXCEPTION 'O valor do exame deve ser numérico e estritamente positivo.';
  END IF;

  IF p_clinical_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do exame não pode ser futura.';
  END IF;

  -- 4. Criar registro clínico CONFIRMED (lançado diretamente pelo médico responsável)
  INSERT INTO public.clinical_records (
    patient_id,
    record_type,
    status,
    clinical_date,
    created_by_user_id,
    confirmed_by_user_id,
    confirmed_at
  ) VALUES (
    p_patient_id,
    'LAB_RESULT',
    'CONFIRMED',
    COALESCE(p_clinical_date, CURRENT_DATE),
    v_user_id,
    v_user_id,
    v_now
  )
  RETURNING id INTO v_record_id;

  -- 5. Inserir resultado do exame estruturado em lab_results
  INSERT INTO public.lab_results (
    clinical_record_id,
    exam_name,
    numeric_value,
    original_unit,
    comparator,
    source_origin
  ) VALUES (
    v_record_id,
    p_exam_name,
    p_numeric_value,
    p_original_unit,
    '=',
    'MANUAL_INPUT'
  );

  -- 6. Execução e Persistência da Calculadora CKD-EPI 2021 se for creatinina ou solicitado
  IF p_calculate_egfr OR LOWER(p_exam_name) LIKE '%creatinina%' THEN
    -- Obter data de nascimento e sexo biológico do paciente
    SELECT birth_date, biological_sex
    INTO v_birth_date, v_sex
    FROM public.patient_profiles
    WHERE id = p_patient_id;

    IF v_birth_date IS NOT NULL AND v_sex IS NOT NULL THEN
      -- Calcular idade na data de referência do exame
      v_age := EXTRACT(YEAR FROM AGE(p_clinical_date, v_birth_date))::INT;

      -- Apenas para adultos (>= 18 anos)
      IF v_age >= 18 THEN
        v_is_female := (v_sex = 'F');
        v_kappa := CASE WHEN v_is_female THEN 0.7 ELSE 0.9 END;
        v_alpha := CASE WHEN v_is_female THEN -0.241 ELSE -0.302 END;
        v_sex_factor := CASE WHEN v_is_female THEN 1.012 ELSE 1.000 END;

        v_scr_over_kappa := p_numeric_value / v_kappa;
        v_min_comp := LEAST(v_scr_over_kappa, 1.0);
        v_max_comp := GREATEST(v_scr_over_kappa, 1.0);

        -- Equação Oficial NEJM 2021
        v_egfr := 142 * POWER(v_min_comp, v_alpha) * POWER(v_max_comp, -1.200) * POWER(0.9938, v_age) * v_sex_factor;
        v_rounded_egfr := ROUND(v_egfr, 1);

        -- Classificação KDIGO
        IF v_rounded_egfr >= 90 THEN v_stage := 'G1';
        ELSIF v_rounded_egfr >= 60 THEN v_stage := 'G2';
        ELSIF v_rounded_egfr >= 45 THEN v_stage := 'G3a';
        ELSIF v_rounded_egfr >= 30 THEN v_stage := 'G3b';
        ELSIF v_rounded_egfr >= 15 THEN v_stage := 'G4';
        ELSE v_stage := 'G5';
        END IF;

        -- Persistência oficial da execução em calculation_runs (Seção 10.4)
        INSERT INTO public.calculation_runs (
          calculator_code,
          formula_version,
          run_type,
          patient_id,
          performed_by_user_id,
          reference_date,
          input_values,
          input_units,
          source_record_ids,
          result_value,
          result_unit,
          clinical_notes
        ) VALUES (
          'CKD_EPI_2021',
          'CKD-EPI-2021-CR',
          'CLINICAL_RECORD',
          p_patient_id,
          v_user_id,
          p_clinical_date,
          jsonb_build_object('creatinine', p_numeric_value, 'age', v_age, 'sex', v_sex),
          jsonb_build_object('creatinine', p_original_unit, 'age', 'years'),
          ARRAY[v_record_id],
          v_rounded_egfr,
          'mL/min/1.73m²',
          'Cálculo automático de TFGe vinculado à confirmação laboratorial.'
        );

        -- Inserir também a TFGe em lab_results para alimentação imediata de gráficos e séries
        INSERT INTO public.lab_results (
          clinical_record_id,
          exam_name,
          numeric_value,
          original_unit,
          comparator,
          source_origin
        ) VALUES (
          v_record_id,
          'TFGe (CKD-EPI 2021)',
          v_rounded_egfr,
          'mL/min/1.73m²',
          '=',
          'CALCULATED'
        );
      END IF;
    END IF;
  END IF;

  -- 7. Gravação obrigatória da auditoria
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_user_id,
    p_patient_id,
    'LAB_EXAM_CONFIRMED',
    'clinical_records',
    'SUCCESS',
    jsonb_build_object(
      'clinical_record_id', v_record_id,
      'exam_name', p_exam_name,
      'value', p_numeric_value,
      'egfr_calculated', v_rounded_egfr
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_record_id,
    'egfr', v_rounded_egfr,
    'stage', v_stage,
    'message', 'Exame laboratorial registrado e confirmado com sucesso no prontuário.'
  );
END;
$$;

-- Restrição estrita de execução
REVOKE ALL ON FUNCTION public.rpc_record_lab_exam FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_lab_exam TO authenticated;
