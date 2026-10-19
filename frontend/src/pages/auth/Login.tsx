import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, Input, Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function LoginPage() {
  const { login, loadMe } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email, password, mfa_code: mfaCode || undefined });
      if (res.mfa_required) {
        setMfaRequired(true);
        toastSuccess('MFA required', 'Enter your authenticator code to continue.');
      } else {
        await loadMe().catch(() => undefined);
        toastSuccess('Welcome back!');
        navigate('/portfolios', { replace: true });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to sign in. Check your credentials.'));
      toastError('Sign in failed', apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-slide-in">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Sign in to Aurevia</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Manage your investments, track goals, and stay informed.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {mfaRequired ? (
          <div className="space-y-1.5">
            <Input
              label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              hint="Two-factor authentication is enabled on this account."
            />
            <Link to="/auth/mfa" className="link text-xs inline-flex items-center gap-1">
              <ShieldCheck size={13} /> Use a recovery code instead
            </Link>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Link to="/auth/forgot-password" className="link text-sm">
            Forgot password?
          </Link>
          <Link to="/auth/mfa" className="link text-sm">
            MFA sign-in
          </Link>
        </div>

        {error ? (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          {mfaRequired ? 'Verify & sign in' : 'Sign in'}
        </Button>
      </form>

      <p className="text-sm text-center mt-6" style={{ color: 'var(--muted)' }}>
        New to Aurevia?{' '}
        <Link to="/auth/register" className="link">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
