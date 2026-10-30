import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Olá, Administrador</h2>
        <p className="mt-2 text-gray-600">
          Acompanhe as filas operacionais e gerencie os acessos do sistema.
        </p>
      </div>

      {/* Cards de Resumo das Filas (Baseado na Seção 7.3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500">Profissionais Pendentes</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">5</p>
          <p className="text-xs text-gray-400 mt-1">Aguardando aprovação de conta</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500">Vínculos Médico-Paciente</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">12</p>
          <p className="text-xs text-gray-400 mt-1">Solicitações pendentes</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500">Desativações</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">2</p>
          <p className="text-xs text-gray-400 mt-1">Exigem reatribuição de pacientes</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-sm font-medium text-gray-500">Correções Clínicas</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">4</p>
          <p className="text-xs text-gray-400 mt-1">Aguardando roteamento</p>
        </div>
      </div>

      {/* Ações Rápidas */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/pacientes/novo" className="flex items-center justify-center p-4 border-2 border-dashed border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-blue-700 font-medium">
            + Cadastrar Paciente
          </Link>
          <Link href="/admin/profissionais" className="flex items-center justify-center p-4 border-2 border-dashed border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-blue-700 font-medium">
            Analisar Profissionais
          </Link>
          <Link href="/admin/filas" className="flex items-center justify-center p-4 border-2 border-dashed border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-blue-700 font-medium">
            Acessar Backoffice
          </Link>
        </div>
      </div>
    </div>
  );
}