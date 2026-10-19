import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Card, Input, Button } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
      toastSuccess('Reset link sent', 'If that email exists, a reset link is on its way.');
    } catch (err) {
      toastError('Could not send reset link', apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Card className="text-center animate-slide-in">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
          <MailCheck size={24} style={{ color: 'var(--success)' }} />
        </div>
        <h2 className="text-lg font-bold">Check your inbox</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          We sent a password reset link to <span className="font-semibold">{email}</span>. The link expires
          after a short while — use it soon.
        </p>
        <Link to="/auth/login" className="link text-sm block mt-6">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-in">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Reset your password</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Enter your account email and we’ll send a reset link.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset link
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
