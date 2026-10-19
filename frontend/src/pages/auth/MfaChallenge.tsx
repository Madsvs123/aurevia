import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, Input, Button } from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';
import { useAuth } from '../../hooks/useAuth';

/**
 * Sign-in with a recovery code (for users who lost their authenticator),
 * or with a TOTP code when redirected from login with mfa_required.
 */
export default function MfaChallengePage() {
  const { login, loadMe } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email, password: '', mfa_code: code.trim() });
      // If the account has MFA but we got here, a correct recovery/TOTP code logs in.
      if (res.mfa_required || res.access) {
        await loadMe().catch(() => undefined);
        navigate('/', { replace: true });
        return;
      }
      if (res.mfa_required) {
        setError('That code was not accepted. Try again or use a different recovery code.');
        return;
      }
      await loadMe().catch(() => undefined);
      toastSuccess('Signed in');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = apiErrorMessage(err, 'MFA sign-in failed.');
      setError(msg);
      toastError('MFA sign-in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-slide-in">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <ShieldCheck size={22} style={{ color: 'var(--primary)' }} />
        </div>
        <h1 className="text-xl font-bold">Two-factor authentication</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Enter a recovery code or authenticator code to sign in.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Input
          label="Recovery or authenticator code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 4XK2-9P7Q-2M5D or 123456"
          hint="One-time recovery codes were shown when you enabled MFA."
        />
        {error ? (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Verify
        </Button>
      </form>
      <p className="text-sm text-center mt-6">
        <Link to="/auth/login" className="link">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
