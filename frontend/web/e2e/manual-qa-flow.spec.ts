import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `e2e-${runId}@example.com`;
const password = 'E2e-Strong-Password-42';
let workspaceUrl = '';
let projectUrl = '';
let runUrl = '';
let coveragePart = 0;

async function saveCoverage(page: Page, label: string) {
  const directory = process.env.E2E_COVERAGE_DIR;
  if (!directory || page.isClosed()) return;
  const coverage = await page.evaluate(() => Reflect.get(globalThis, '__coverage__') as unknown);
  if (!coverage) return;
  await mkdir(directory, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  coveragePart += 1;
  await writeFile(
    resolve(directory, `${String(coveragePart).padStart(2, '0')}-${safeLabel}.json`),
    JSON.stringify(coverage),
  );
}

test.afterEach(async ({ context }, testInfo) => {
  for (const page of context.pages()) await saveCoverage(page, testInfo.title);
});

async function login(page: Page, account = email) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/workspaces/);
}

test.describe.serial('critical manual QA flow against test API', () => {
  test('register → workspace → project → repository → case with steps', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Имя').fill('E2E QA');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await page.getByRole('button', { name: 'Создать workspace', exact: true }).click();
    await page.getByLabel('Название').fill(`E2E Workspace ${runId}`);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page).toHaveURL(/\/w\//);
    workspaceUrl = new URL(page.url()).pathname;
    await page.getByRole('button', { name: 'Новый проект' }).click();
    await page.getByLabel('Название проекта').fill('E2E Web');
    await page.getByLabel('Код').fill(`E${runId.replace(/\D/g, '').slice(-6)}`);
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    projectUrl = new URL(page.url()).pathname.replace(/\/dashboard$/, '');
    await page.getByText('Repository', { exact: true }).click();
    await page.getByRole('button', { name: 'Действия со suite' }).click();
    await page.getByText('Новый корневой suite').click();
    await page.getByLabel('Название').fill('Authentication');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByText('Authentication').click();
    await page.getByRole('button', { name: 'Создать test case' }).click();
    await page.getByLabel('Название').fill('Пользователь входит с корректными данными');
    await page.getByLabel('Действие').fill('Ввести корректные данные');
    await page.getByLabel('Ожидаемый результат').fill('Открывается dashboard');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText(/Пользователь входит/)).toBeVisible();
  });

  test('plan → environment → run → assign → start', async ({ page }) => {
    await login(page);
    await page.goto(`${projectUrl}/plans`);
    await page.getByRole('button', { name: 'Создать план' }).click();
    await page.getByLabel('Название').fill('Smoke plan');
    await page.getByRole('button', { name: 'Добавить кейсы' }).click();
    await page
      .getByRole('checkbox', { name: /Выбрать/ })
      .first()
      .check();
    await page.getByRole('button', { name: 'Готово' }).click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await saveCoverage(page, 'plans');
    await page.goto(`${projectUrl}/settings/environments`);
    await page.getByRole('button', { name: 'Создать' }).click();
    await page.getByLabel('Название').fill('Staging');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await saveCoverage(page, 'environments');
    await page.goto(`${projectUrl}/runs`);
    await page.getByRole('button', { name: 'Создать run' }).click();
    await page.getByLabel('Название запуска').fill('Staging Smoke');
    await page.getByLabel('Окружение').click();
    await page.getByText('Staging').click();
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await page.getByLabel('Тест-план').click();
    await page.getByText(/Smoke plan/).click();
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await page.getByRole('button', { name: 'Создать запуск' }).click();
    await expect(page).toHaveURL(/\/runs\//);
    runUrl = new URL(page.url()).pathname;
    await page.getByRole('checkbox').first().check();
    const assignee = page.getByLabel('Назначить выбранным');
    await assignee.click();
    await assignee.press('ArrowDown');
    await assignee.press('Enter');
    await page.getByRole('button', { name: 'Начать' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText('В работе')).toBeVisible();
  });

  test('FAILED with attachment → retest PASSED → history → complete', async ({ page }) => {
    await login(page);
    await page.goto(runUrl);
    await page.getByRole('button', { name: 'Открыть выполнение' }).click();
    await page.getByText('Провален', { exact: true }).first().click();
    await page.getByText('Провален', { exact: true }).last().click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('evidence'),
    });
    await expect(page.getByText('Готово')).toBeVisible();
    await page.getByRole('button', { name: 'Сохранить результат' }).click();
    await page.getByText('Пройден', { exact: true }).first().click();
    await page.getByText('Пройден', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Сохранить результат' }).click();
    await expect(page.locator('.result-panel .ant-collapse-item')).toHaveCount(2);
    await page
      .getByRole('button', { name: /Провален/ })
      .last()
      .click();
    await expect(page.getByText('Предыдущая попытка сохранена')).toBeVisible();
    await page.getByRole('button', { name: 'Выйти' }).click();
    await page.getByRole('button', { name: 'Завершить' }).click();
    await page.getByRole('button', { name: 'Завершить', exact: true }).last().click();
    await expect(page.getByText('Завершён')).toBeVisible();
  });

  test('second tenant cannot open foreign deep link', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const secondEmail = `foreign-${runId}@example.com`;
    await page.goto('/register');
    await page.getByLabel('Имя').fill('Foreign QA');
    await page.getByLabel('Email').fill(secondEmail);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page).toHaveURL(/\/workspaces/);
    await page.goto(runUrl);
    await expect(page.getByText(/не существует или недоступен/i)).toBeVisible();
    await saveCoverage(page, 'foreign-deep-link');
    await context.close();
  });

  test('session refresh after reload and logout cleanup', async ({ page }) => {
    await login(page);
    await page.goto(workspaceUrl);
    await page.reload();
    await expect(page).toHaveURL(workspaceUrl);
    await page.goto(`${projectUrl}/dashboard`);
    await page.getByRole('button', { name: 'Меню пользователя' }).click();
    await page.getByText('Выйти').click();
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('daevox.session.refresh'))).toBeNull();
  });
});
