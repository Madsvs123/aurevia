import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Input, Button } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Missing reset token. Use the full link from your email.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      toastSuccess('Password updated', 'You can now sign in with your new password.');
      navigate('/auth/login');
    } catch (err) {
      const msg = apiErrorMessage(err, 'Unable to reset password.');
      setError(msg);
      toastError('Reset failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-slide-in">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Use at least 10 characters and avoid common passwords.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Input label="New password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <Input label="Confirm new password" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {error ? (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
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
