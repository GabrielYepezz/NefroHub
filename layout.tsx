import Link from 'next/link';
import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50 font-sans">
      {/* Sidebar (Menu Lateral) */}
      <aside className="w-64 bg-blue-900 text-white flex flex-col shadow-xl">
        <div className="p-6 border-b border-blue-800">
          <h1 className="text-2xl font-bold tracking-tight">Nefrohub</h1>
          <p className="text-sm text-blue-300 mt-1">Painel Administrativo</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link href="/admin" className="block px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
            Visão Geral
          </Link>
          <Link href="/admin/pacientes" className="block px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
            Cadastros de Pacientes
          </Link>
          <Link href="/admin/profissionais" className="block px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
            Contas e Profissionais
          </Link>
          <Link href="/admin/filas" className="block px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
            Filas Administrativas
          </Link>
          <Link href="/admin/auditoria" className="block px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
            Auditoria de Acessos
          </Link>
        </nav>
        
        <div className="p-4 border-t border-blue-800">
          <button className="w-full text-left px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-white">
            Sair do sistema
          </button>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}