'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/auth/actions'
import {
  Activity,
  LayoutDashboard,
  Users,
  UserCheck,
  Link2,
  ListOrdered,
  ShieldCheck,
  FileCheck,
  Building2,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'

const navItems = [
  {
    name: 'Visão Geral',
    href: '/admin',
    icon: LayoutDashboard,
    badge: null,
  },
  {
    name: 'Gestão de Pacientes',
    href: '/admin/pacientes',
    icon: Users,
    badge: 'LGPD',
  },
  {
    name: 'Corpo Clínico & Médicos',
    href: '/admin/medicos',
    icon: UserCheck,
    badge: null,
  },
  {
    name: 'Vínculos & Representantes',
    href: '/admin/vinculos',
    icon: Link2,
    badge: null,
  },
  {
    name: 'Filas de Trabalho (5)',
    href: '/admin/filas',
    icon: ListOrdered,
    badge: 'Backoffice',
  },
  {
    name: 'Auditoria & Rastreabilidade',
    href: '/admin/auditoria',
    icon: ShieldCheck,
    badge: 'Append-only',
  },
  {
    name: 'Documentos Legais',
    href: '/admin/legal',
    icon: FileCheck,
    badge: null,
  },
  {
    name: 'Unidades & Instituição',
    href: '/admin/configuracoes',
    icon: Building2,
    badge: null,
  },
]

interface AdminSidebarProps {
  adminName?: string
  adminEmail?: string
}

export function AdminSidebar({
  adminName = 'Administrador do Sistema',
  adminEmail = 'admin@nefrohub.med.br',
}: AdminSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await logoutAction()
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#1A252C] text-slate-100 border-r border-[#26353E]">
      {/* Topo / Branding */}
      <div className="p-6 border-b border-[#26353E] flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg tracking-tight text-white font-heading">
                Nefro<span className="text-[#4E9EA6]">Hub</span>
              </span>
              <span className="text-[10px] font-semibold bg-primary/20 text-[#71C5CD] px-1.5 py-0.5 rounded border border-primary/30">
                ADMIN
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Governança Hospitalar</p>
          </div>
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white p-1 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Regra de Ouro da Seção 2.2 do Documentation */}
      <div className="mx-4 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Acesso Segregado</span>
        </div>
        <p className="text-[11px] text-amber-200/80 mt-1 leading-tight">
          Acesso clínico negado por padrão. Operações auditadas e restritas ao backoffice.
        </p>
      </div>

      {/* Itens de Navegação */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Módulos Administrativos
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary text-white shadow-xs font-semibold'
                  : 'text-slate-300 hover:bg-[#24333C] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      isActive
                        ? 'bg-primary-hover text-white'
                        : 'bg-[#24333C] text-slate-300 border border-[#2D3F4A]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                <ChevronRight className={`w-3.5 h-3.5 opacity-50 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              </div>
            </Link>
          )
        })}
      </div>

      {/* Perfil e Logout */}
      <div className="p-4 border-t border-[#26353E] bg-[#151E24]">
        <div className="flex items-center justify-between mb-3">
          <div className="truncate pr-2">
            <p className="text-xs font-semibold text-white truncate">{adminName}</p>
            <p className="text-[11px] text-slate-400 truncate">{adminEmail}</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Sessão Ativa" />
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#202D35] hover:bg-destructive-bg hover:text-destructive hover:border-destructive/30 text-slate-300 text-xs font-medium transition-colors border border-[#2A3B46] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão</span>
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <>
      {/* Botão Hambúrguer Mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#1A252C] border-b border-[#26353E] p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-bold text-white text-base font-heading">NefroHub Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-slate-300 hover:text-white p-2 rounded-lg bg-[#24333C] cursor-pointer"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Drawer Mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex">
          <div className="w-72 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
          <div className="flex-1" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Sidebar Desktop Fixa */}
      <aside className="hidden lg:block w-72 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  )
}
