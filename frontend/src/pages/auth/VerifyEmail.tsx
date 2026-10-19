import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Mail, XCircle } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (token) {
      setState('error');
      setMessage('No verification token provided. Enter your email below to resend the link.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => {
        setState('success');
        toastSuccess('Email verified', 'You can now sign in.');
      })
      .catch((err) => {
        setState('error');
        setMessage(apiErrorMessage(err, 'This verification link is invalid or has expired.'));
        toastError('Verification failed', apiErrorMessage(err));
      });
  }, [token]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResending(true);
    try {
      await authApi.resendVerification(resendEmail);
      setResendSent(true);
      toastSuccess('Verification email sent');
    } catch (err) {
      toastError('Could not resend', apiErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <Card className="text-center animate-slide-in">
      {state === 'loading' ? (
        <div className="py-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--surface-2)' }}>
            <Mail size={22} style={{ color: 'var(--muted)' }} />
          </div>
          <p className="text-sm font-medium">Verifying your email…</p>
        </div>
      ) : state === 'success' ? (
        <div className="py-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
          </div>
          <h2 className="text-lg font-bold">Email verified!</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            Your account is ready. Sign in to start using Aurevia.
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate('/auth/login')}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <div className="py-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
            <XCircle size={24} style={{ color: 'var(--danger)' }} />
          </div>
          <h2 className="text-lg font-bold">Verification failed</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            {message}
          </p>

          {!resendSent ? (
            <form onSubmit={resend} className="mt-6 space-y-3 text-left">
              <input
                className="input"
                type="email"
                required
                placeholder="Your account email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                aria-label="Account email"
              />
              <Button type="submit" variant="secondary" className="w-full" loading={resending}>
                Resend verification email
              </Button>
            </form>
          ) : (
            <p className="text-sm mt-6" style={{ color: 'var(--success)' }}>
              Verification email sent — check your inbox.
            </p>
          )}

          <p className="text-sm mt-6">
            <Link to="/auth/login" className="link">
              Back to sign in
            </Link>
          </p>
        </div>
      )}
    </Card>
  );
}
