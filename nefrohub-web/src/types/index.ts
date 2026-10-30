// src/types/index.ts
export type UserRole =
  | 'admin'
  | 'doctor'
  | 'patient'
  | 'ADMIN'
  | 'DOCTOR'
  | 'DOCTOR_MASTER'
  | 'PATIENT'
  | 'LEGAL_REPRESENTANT'

export interface UserMetadata {
  name: string
  role: UserRole
  phone?: string
  institution_id?: string
}

export * from './database'
