import { Page, expect } from '@playwright/test'

/**
 * Realiza login via interface gráfica web do NefroHub
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
  expectedPathPrefix: string = '/'
) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  // Aguardar hidratação completa do React no cliente
  await page.waitForSelector('[data-hydrated="true"]', { timeout: 10000 })

  // Preencher formulário de login
  await page.locator('input#email').fill(email)
  await page.locator('input#password').fill(password)

  // Submeter formulário
  await page.getByRole('button', { name: /Entrar na Plataforma/i }).click()

  // Aguardar transição e redirecionamento de autorização
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 })

  if (expectedPathPrefix && expectedPathPrefix !== '/') {
    await expect(page).toHaveURL(new RegExp(expectedPathPrefix), { timeout: 15000 })
  }
}

/**
 * Realiza logout via interface gráfica
 */
export async function logoutViaUI(page: Page) {
  // Localizar botão de sair (sidebar do admin, navbar do médico ou header do paciente)
  const logoutBtn = page.getByRole('button', { name: /Sair|Encerrar|Logout/i })
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  }
}
