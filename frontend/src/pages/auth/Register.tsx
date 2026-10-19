import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Input, Button } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password === form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      await authApi.register({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
      });
      toastSuccess('Account created', 'Check your inbox to verify your email address.');
      navigate('/auth/login');
    } catch (err) {
      const msg = apiErrorMessage(err, 'Registration failed.');
      setError(msg);
      toastError('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-slide-in">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Start tracking portfolios, goals and research in minutes.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" required value={form.first_name} onChange={set('first_name')} autoComplete="given-name" />
          <Input label="Last name" required value={form.last_name} onChange={set('last_name')} autoComplete="family-name" />
        </div>
        <Input label="Email address" type="email" required value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
        <Input
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          hint="At least 10 characters, not purely numeric."
        />
        <Input label="Confirm password" type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />

        {error ? (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
      </form>

      <p className="text-sm text-center mt-6" style={{ color: 'var(--muted)' }}>
        Already have an account?{' '}
        <Link to="/auth/login" className="link">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
