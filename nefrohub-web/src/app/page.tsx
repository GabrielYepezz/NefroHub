import { redirect } from 'next/navigation';

export default function Home() {
  // Redireciona automaticamente o usuário da raiz '/' para a página de '/login'
  redirect('/login');
}
