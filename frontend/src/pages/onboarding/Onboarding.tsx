import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { portfoliosApi, usersApi } from '../../api/endpoints';
import type { RiskProfile } from '../../api/types';
import { Button, Card } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'AED', 'EGP', 'SAR'];

const RISK_LEVELS: { value: RiskProfile; title: string; desc: string; emoji: string }[] = [
  { value: 'conservative', title: 'Conservative', desc: 'Capital preservation first · bonds, cash, low volatility', emoji: '🛡️' },
  { value: 'moderate', title: 'Moderate', desc: 'Balanced growth · a diversified mix of stocks and bonds', emoji: '⚖️' },
  { value: 'aggressive', title: 'Aggressive', desc: 'Maximize long-term growth · equities and high-volatility assets', emoji: '🚀' },
];

const STEP_LABELS = ['Welcome', 'Risk profile', 'First portfolio'];

export default function OnboardingPage() {
  const { user, loadMe } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState('USD');
  const [risk, setRisk] = useState<RiskProfile>('moderate');
  const [portfolioName, setPortfolioName] = useState('');
  const [portfolioDesc, setPortfolioDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const finish = useMutation({
    mutationFn: async () => {
      // Save preferences first.
      await usersApi.patchMe({ base_currency: currency, risk_profile: risk, onboarded: false });
      // Create the first portfolio (name defaults to the risk profile style).
      await portfoliosApi.create({
        name: portfolioName.trim() || `${risk[0].toUpperCase()}${risk.slice(1)} portfolio`,
        currency,
        description: portfolioDesc.trim() || undefined,
      });
    },
    onSuccess: async () => {
      toastSuccess('Welcome to Aurevia! 🎉');
      await loadMe().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      navigate('/', { replace: true });
    },
    onError: (err) => {
      toastError('Could not finish setup', apiErrorMessage(err));
      setSubmitting(false);
    },
  });

  const next = () => setStep((s) => Math.min(s + 1, 2));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = () => {
    setSubmitting(true);
    finish.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div
          className="mx-auto flex items-center justify-center rounded-2xl text-white"
          style={{ width: 56, height: 56, background: 'var(--primary)' }}
        >
          <Sparkles size={26} />
        </div>
        <h1 className="page-title">Welcome to Aurevia{user ? `, ${user.first_name}` : ''} 👋</h1>
        <p className="page-sub">Three quick steps to set up your workspace.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="flex items-center justify-center rounded-full text-xs font-bold"
              style={{
                width: 26,
                height: 26,
                background: i <= step ? 'var(--primary)' : 'var(--surface-2)',
                color: i <= step ? '#fff' : 'var(--muted)',
              }}
            >
              {i + 1}
            </span>
            <span className={`text-xs font-medium ${i <= step ? '' : ''}`} style={{ color: i <= step ? 'var(--text)' : 'var(--muted)' }}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 ? (
              <span className="w-8 h-px mx-1" style={{ background: 'var(--border)' }} />
            ) : null}
          </div>
        ))}
      </div>

      <Card className="animate-slide-in">
        {step === 0 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Set your base currency</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Used for formatting across dashboards, charts and reports. You can change it anytime in Settings.
              </p>
            </div>
            <div>
              <label className="field-label">Base currency</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button onClick={next} icon={<ArrowRight size={15} />} iconPosition="right">
                Continue
              </Button>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">What’s your risk profile?</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Guides goal projections and expected-return defaults.
              </p>
            </div>
            <div className="space-y-2.5">
              {RISK_LEVELS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRisk(r.value)}
                  className="w-full text-left rounded-xl p-4 border transition-colors"
                  style={{
                    borderColor: risk === r.value ? 'var(--primary)' : 'var(--border)',
                    background: risk === r.value ? 'color-mix(in srgb, var(--primary) 8%, var(--surface))' : 'var(--surface)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{r.emoji}</span>
                    <div>
                      <p className="font-semibold flex items-center gap-2">
                        {r.title}
                        {risk === r.value ? <ShieldCheck size={15} style={{ color: 'var(--primary)' }} /> : null}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{r.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={back} icon={<ArrowLeft size={15} />}>Back</Button>
              <Button onClick={next} icon={<ArrowRight size={15} />} iconPosition="right">Continue</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Create your first portfolio</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Start tracking holdings, transactions and performance right away.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Portfolio name</label>
                <input
                  className="input"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder={`e.g. ${risk[0].toUpperCase()}${risk.slice(1)} portfolio`}
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">Description (optional)</label>
                <input
                  className="input"
                  value={portfolioDesc}
                  onChange={(e) => setPortfolioDesc(e.target.value)}
                  placeholder="What is this portfolio for?"
                />
              </div>
              <div className="flex items-center gap-2 text-sm rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Wallet size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ color: 'var(--muted)' }}>
                  Currency: <span className="font-semibold" style={{ color: 'var(--text)' }}>{currency}</span> · Risk:{' '}
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{risk}</span>
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={back} icon={<ArrowLeft size={15} />}>Back</Button>
              <Button onClick={submit} loading={submitting} icon={<Sparkles size={15} />} iconPosition="right">
                Start using Aurevia
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
