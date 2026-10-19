import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, Input, Button, Badge } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';
import { useAuth } from '../../hooks/useAuth';

export default function MfaSetupPage() {
  const { user, loadMe } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const setup = useQuery({
    queryKey: ['mfa', 'setup'],
    queryFn: authApi.mfaSetup,
    enabled: !user?.mfa_enabled && recoveryCodes !== null,
    retry: false,
  });

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.mfaConfirm(code.replace(/\s/g, ''));
      const codes = await authApi.mfaRecoveryCodes(code.replace(/\s/g, ''));
      setRecoveryCodes(codes.codes);
      setConfirmed(true);
      toastSuccess('Two-factor authentication enabled');
      await loadMe().catch(() => undefined);
    } catch (err) {
      toastError('Invalid code', apiErrorMessage(err, 'The code did not match. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (user?.mfa_enabled && !confirmed) {
    return (
      <Card className="text-center animate-slide-in">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
          <ShieldCheck size={24} style={{ color: 'var(--success)' }} />
        </div>
        <h2 className="text-lg font-bold">MFA is already enabled</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          Two-factor authentication is active on your account. You can manage it from Settings → Security.
        </p>
        <Button className="mt-6 w-full" onClick={() => navigate('/settings/security')}>
          Go to security settings
        </Button>
      </Card>
    );
  }

  if (recoveryCodes) {
    return (
      <Card className="animate-slide-in">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-bold">Save your recovery codes</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Each code works once. Store them somewhere safe — they’re your only way back in without your
            authenticator.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {recoveryCodes.map((c) => (
            <code
              key={c}
              className="rounded-lg px-3 py-2 text-center text-sm font-mono font-semibold"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {c}
            </code>
          ))}
        </div>
        <Button className="w-full" onClick={() => navigate('/settings/security')}>
          I saved my codes — continue
        </Button>
      </Card>
    );
  }

  if (setup.isLoading) {
    return (
      <Card>
        <div className="skeleton h-48 w-full rounded-xl" />
      </Card>
    );
  }

  if (setup.isError || !setup.data) {
    return (
      <Card className="text-center animate-slide-in">
        <h2 className="text-lg font-bold">Could not start MFA setup</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          {apiErrorMessage(setup.error, 'An error occurred while preparing MFA.')}
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => setup.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-in">
      <div className="mb-5 text-center">
        <h1 className="text-xl font-bold">Set up two-factor authentication</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Scan the QR code with your authenticator app, then confirm with a code.
        </p>
      </div>

      <div className="flex justify-center mb-5">
        {/* qr_svg is raw SVG markup from the backend */}
        <div
          className="rounded-xl p-3"
          style={{ background: '#fff', border: '1px solid var(--border)' }}
          dangerouslySetInnerHTML={{ __html: setup.data.qr_svg }}
        />
      </div>

      <p className="text-xs text-center mb-5" style={{ color: 'var(--muted)' }}>
        Can’t scan? Manual secret:{' '}
        <code className="font-mono font-semibold">{setup.data.secret}</code>
      </p>

      <form onSubmit={confirm} className="space-y-4">
        <Input
          label="Authenticator code"
          inputMode="numeric"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit code"
        />
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Enable two-factor authentication
        </Button>
      </form>
      <p className="text-sm text-center mt-4">
        <Link to="/settings/security" className="link">
          Cancel
        </Link>
      </p>
      <div className="mt-3 text-center">
        <Badge tone="info">Recovery codes are shown once after enabling</Badge>
      </div>
    </Card>
  );
}
