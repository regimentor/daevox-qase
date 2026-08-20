import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LoginForm } from '@/features/auth-login';
import { RegisterForm } from '@/features/auth-register';

const meta = { title: 'Auth/Forms' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const LoginSuccess: Story = {
  render: () => <LoginForm login={fn().mockResolvedValue(undefined)} onSuccess={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Email'), ' QA@Example.COM ');
    await userEvent.type(canvas.getByLabelText('Пароль'), 'correct-password');
    await userEvent.click(canvas.getByRole('button', { name: 'Войти' }));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const LoginValidation: Story = {
  render: () => <LoginForm login={fn()} onSuccess={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(canvas.getByRole('button', { name: 'Войти' }));
    expect(await canvas.findByText('Проверьте формат email')).toBeVisible();
  },
};

export const LoginServerError: Story = {
  render: () => (
    <LoginForm login={fn().mockRejectedValue(new Error('Неверные данные'))} onSuccess={fn()} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Email'), 'qa@example.com');
    await userEvent.type(canvas.getByLabelText('Пароль'), 'wrong-password');
    await userEvent.click(canvas.getByRole('button', { name: 'Войти' }));
    expect(await canvas.findByRole('alert')).toBeVisible();
  },
};

export const RegisterSuccess: Story = {
  render: () => <RegisterForm register={fn().mockResolvedValue(undefined)} onSuccess={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Имя'), ' QA Lead ');
    await userEvent.type(canvas.getByLabelText('Email'), ' Lead@Example.COM ');
    await userEvent.type(canvas.getByLabelText('Пароль'), 'very-strong-password');
    await userEvent.click(canvas.getByRole('button', { name: 'Создать аккаунт' }));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const RegisterValidation: Story = {
  render: () => <RegisterForm register={fn()} onSuccess={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Имя'), 'QA');
    await userEvent.type(canvas.getByLabelText('Email'), 'qa@example.com');
    await userEvent.type(canvas.getByLabelText('Пароль'), 'short');
    await userEvent.click(canvas.getByRole('button', { name: 'Создать аккаунт' }));
    expect((await canvas.findAllByText('Минимум 12 символов')).length).toBeGreaterThan(1);
  },
};

export const RegisterServerError: Story = {
  render: () => (
    <RegisterForm
      register={fn().mockRejectedValue(new Error('Email уже используется'))}
      onSuccess={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Имя'), 'QA Lead');
    await userEvent.type(canvas.getByLabelText('Email'), 'qa@example.com');
    await userEvent.type(canvas.getByLabelText('Пароль'), 'very-strong-password');
    await userEvent.click(canvas.getByRole('button', { name: 'Создать аккаунт' }));
    expect(await canvas.findByRole('alert')).toBeVisible();
  },
};
