import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, KeyRound, Laptop, MailCheck, MailWarning, ShieldCheck, ShieldOff, Bell, LogOut } from 'lucide-react';
import { authApi, notificationPreferencesApi, orgsApi, usersApi } from '../../api/endpoints';
import type { NotificationKind, NotificationPreferences, OrgRole, RiskProfile } from '../../api/types';
import { Badge, Button, Card, CardHeader, Input, Modal, Select, SkeletonCard, Tabs, Toggle, EmptyState } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useSessions } from '../../hooks/useSessions';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess, toastInfo } from '../../store/toast';

const TZ_OPTIONS = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
].map((t) => ({ value: t, label: t }));

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'AED', 'EGP', 'SAR'].map((c) => ({ value: c, label: c }));
const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'ar-EG', label: 'العربية (مصر)' },
  { value: 'es-ES', label: 'Español' },
];
const RISK_OPTIONS: { value: RiskProfile; label: string }[] = [
  { value: 'conservative', label: 'Conservative — capital preservation' },
  { value: 'moderate', label: 'Moderate — balanced growth' },
  { value: 'aggressive', label: 'Aggressive — maximize growth' },
];

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'member', label: 'Member' },
];

export default function SettingsPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const validTabs = ['profile', 'security', 'organization', 'notifications'];
  const tab = tabParam && validTabs.includes(tabParam) ? tabParam : 'security';
  const navigate = useNavigate();

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'security', label: 'Security' },
    { key: 'organization', label: 'Organization' },
    { key: 'notifications', label: 'Notifications' },
  ];

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Manage your profile, security, organization and preferences.</p>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={(k) => navigate(`/settings/${k}`)} />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'organization' && <OrganizationTab />}
      {tab === 'notifications' && <ProfileTab />}
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileTab() {
  const { user, profile, loadMe } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    timezone: profile?.timezone ?? 'UTC',
    locale: profile?.locale ?? 'en-US',
    base_currency: profile?.base_currency ?? 'USD',
    risk_profile: (profile?.risk_profile ?? 'moderate') as RiskProfile,
  });

  const save = useMutation({
    mutationFn: () =>
      usersApi.patchMe({
        timezone: form.timezone,
        locale: form.locale,
        base_currency: form.base_currency,
        risk_profile: form.risk_profile,
      }),
    onSuccess: async () => {
      toastSuccess('Profile saved');
      await loadMe().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toastError('Save failed', apiErrorMessage(err)),
  });

  return (
    <Card>
      <CardHeader title="Profile" subtitle="Defaults used across the app for formatting and risk guidance" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <Input label="First name" value={form.first_name} disabled hint={user ? `Account: ${user.email}` : undefined} />
        <Input label="Last name" value={form.last_name} disabled />
        <Select label="Timezone" options={TZ_OPTIONS} value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
        <Select label="Locale" options={LOCALE_OPTIONS} value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} />
        <Select label="Base currency" options={CURRENCY_OPTIONS} value={form.base_currency} onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value }))} />
        <div>
          <label className="field-label">Risk profile</label>
          <select className="select" value={form.risk_profile} onChange={(e) => setForm((f) => ({ ...f, risk_profile: e.target.value as RiskProfile }))}>
            {RISK_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-5">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save profile
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- Security ---------------- */

function SecurityTab() {
  const { user, loadMe } = useAuth();
  const navigate = useNavigate();
  const security = useQuery({ queryKey: ['security'], queryFn: usersApi.security });
  const { sessions, revoke, revokeAll } = useSessions();
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const revokeSession = (id: string) =>
    revoke.mutate(id, {
      onSuccess: () => toastSuccess('Session revoked'),
      onError: (err) => toastError('Could not revoke session', apiErrorMessage(err)),
    });

  const revokeAllSessions = () =>
    revokeAll.mutate(undefined, {
      onSuccess: () => toastSuccess('Other sessions revoked', 'You’ll stay signed in on this device.'),
      onError: (err) => toastError('Could not revoke sessions', apiErrorMessage(err)),
    });

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(pwForm.old_password, pwForm.new_password),
    onSuccess: () => {
      toastSuccess('Password changed');
      setPwForm({ old_password: '', new_password: '', confirm: '' });
    },
    onError: (err) => toastError('Could not change password', apiErrorMessage(err)),
  });

  const resendVerification = useMutation({
    mutationFn: () => authApi.resendVerification(user?.email ?? ''),
    onSuccess: () => toastSuccess('Verification email sent'),
    onError: (err) => toastError('Could not resend', apiErrorMessage(err)),
  });

  const disableMfa = useMutation({
    mutationFn: () => authApi.mfaDisable(mfaCode),
    onSuccess: async () => {
      toastSuccess('Two-factor authentication disabled');
      setMfaCode('');
      await loadMe().catch(() => undefined);
      void security.refetch();
    },
    onError: (err) => toastError('Could not disable MFA', apiErrorMessage(err)),
  });

  const getRecoveryCodes = useMutation({
    mutationFn: () => authApi.mfaRecoveryCodes(mfaCode),
    onSuccess: (res) => {
      setRecoveryCodes(res.codes);
      setShowRecovery(true);
      toastInfo('Recovery codes generated', 'These replace any previous codes.');
    },
    onError: (err) => toastError('Could not generate codes', apiErrorMessage(err)),
  });

  const info = security.data;
  const mfaEnabled = user?.mfa_enabled ?? info?.mfa_enabled ?? false;
  const emailVerified = user?.is_email_verified ?? info?.email_verified ?? false;

  if (security.isLoading) return <SkeletonCard rows={4} />;

  return (
    <div className="space-y-5">
      {/* Email verification */}
      <Card>
        <CardHeader title="Email verification" />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {emailVerified ? (
              <MailCheck size={20} style={{ color: 'var(--success)' }} />
            ) : (
              <MailWarning size={20} style={{ color: 'var(--warning)' }} />
            )}
            <div>
              <p className="text-sm font-semibold">
                {emailVerified ? 'Email verified' : 'Email not verified'}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {user?.email} · {emailVerified ? 'All features unlocked' : 'Verify to create organizations and portfolios'}
              </p>
            </div>
          </div>
          {!emailVerified ? (
            <Button variant="secondary" size="sm" onClick={() => resendVerification.mutate()} loading={resendVerification.isPending}>
              Resend verification email
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader title="Change password" subtitle="At least 10 characters, not purely numeric" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <Input label="Current password" type="password" value={pwForm.old_password} onChange={(e) => setPwForm((f) => ({ ...f, old_password: e.target.value }))} autoComplete="current-password" />
          <div />
          <Input label="New password" type="password" value={pwForm.new_password} onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))} autoComplete="new-password" />
          <Input label="Confirm new password" type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" />
        </div>
        <div className="mt-4">
          <Button
            onClick={() => {
              if (pwForm.new_password !== pwForm.confirm) {
                toastError('Passwords do not match');
                return;
              }
              changePassword.mutate();
            }}
            loading={changePassword.isPending}
            disabled={!pwForm.old_password || !pwForm.new_password}
            icon={<KeyRound size={14} />}
          >
            Update password
          </Button>
        </div>
      </Card>

      {/* MFA */}
      <Card>
        <CardHeader
          title="Two-factor authentication"
          subtitle={mfaEnabled ? 'Enabled — TOTP codes required at sign-in' : 'Disabled — recommended for account security'}
        />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {mfaEnabled ? (
              <ShieldCheck size={20} style={{ color: 'var(--success)' }} />
            ) : (
              <ShieldOff size={20} style={{ color: 'var(--muted)' }} />
            )}
            <div>
              <p className="text-sm font-semibold">{mfaEnabled ? 'MFA is on' : 'MFA is off'}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {info?.last_login ? `Last sign-in: ${new Date(info.last_login).toLocaleString()}` : ''}
              </p>
            </div>
          </div>
          {mfaEnabled ? (
            <div className="flex flex-wrap items-end gap-3 max-w-md">
              <div className="flex-1 min-w-[180px]">
                <Input label="Authenticator code" inputMode="numeric" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" hint="Required to confirm sensitive actions" />
              </div>
              <Button variant="secondary" size="sm" onClick={() => disableMfa.mutate()} loading={disableMfa.isPending} disabled={mfaCode.length !== 6}>
                Disable MFA
              </Button>
              <Button variant="secondary" size="sm" onClick={() => getRecoveryCodes.mutate()} loading={getRecoveryCodes.isPending} disabled={mfaCode.length !== 6}>
                Show recovery codes
              </Button>
            </div>
          ) : (
            <Button onClick={() => navigate('/auth/mfa/setup')} icon={<ShieldCheck size={14} />}>
              Set up two-factor authentication
            </Button>
          )}
        </div>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader
          title={`Active sessions (${sessions.data?.length ?? 0})`}
          subtitle="Devices signed in to your account — revoke any you don’t recognize"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (window.confirm('Sign out all other devices? You’ll stay signed in here.')) revokeAllSessions();
              }}
              loading={revokeAll.isPending}
              icon={<LogOut size={13} />}
            >
              Revoke all others
            </Button>
          }
        />
        {sessions.isLoading ? (
          <SkeletonCard rows={3} />
        ) : (sessions.data ?? []).length === 0 ? (
          <EmptyState title="No active sessions" message="Sessions for this account will appear here." compact />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP address</th>
                  <th>Last used</th>
                  <th>Signed in</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sessions.data ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <p className="font-medium flex items-center gap-2">
                        <Laptop size={14} style={{ color: 'var(--muted)' }} /> {s.device_name || 'Unknown device'}
                      </p>
                      {s.user_agent ? (
                        <p className="text-xs max-w-[280px] truncate" style={{ color: 'var(--muted)' }} title={s.user_agent}>
                          {s.user_agent}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-xs font-mono">{s.ip || '—'}</td>
                    <td className="text-xs">{s.last_used_at ? new Date(s.last_used_at).toLocaleString() : '—'}</td>
                    <td className="text-xs">{new Date(s.created_at).toLocaleString()}</td>
                    <td>
                      {s.current ? <Badge tone="success">Current</Badge> : <Badge tone="muted">Active</Badge>}
                    </td>
                    <td className="text-right">
                      {s.current ? (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>This device</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Sign out this device?')) revokeSession(s.id);
                          }}
                          loading={revoke.isPending}
                          style={{ color: 'var(--danger)' }}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recovery codes */}
      <Modal open={showRecovery} onClose={() => setShowRecovery(false)} title="Recovery codes" subtitle="Each code works once — store them safely">        <div className="grid grid-cols-2 gap-2">
          {(recoveryCodes ?? []).map((c) => (
            <code key={c} className="rounded-lg px-3 py-2 text-center text-sm font-mono font-semibold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {c}
            </code>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setShowRecovery(false)}>I saved them</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Organization ---------------- */

function OrganizationTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: orgsApi.list });
  const invitations = useQuery({ queryKey: ['invitations', 'pending'], queryFn: orgsApi.pendingInvitations });

  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');

  const create = useMutation({
    mutationFn: () => orgsApi.create(orgName),
    onSuccess: () => {
      toastSuccess('Organization created');
      setCreateOpen(false);
      setOrgName('');
      void queryClient.invalidateQueries({ queryKey: ['orgs'] });
    },
    onError: (err) => toastError('Could not create organization', apiErrorMessage(err)),
  });

  const invite = useMutation({
    mutationFn: () => orgsApi.invite(activeOrgId(), inviteEmail, inviteRole),
    onSuccess: () => {
      toastSuccess('Invitation sent', inviteEmail);
      setInviteOpen(false);
      setInviteEmail('');
    },
    onError: (err) => toastError('Could not send invitation', apiErrorMessage(err)),
  });

  const changeRole = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: string; userId: string; role: OrgRole }) =>
      orgsApi.updateMemberRole(orgId, userId, role),
    onSuccess: () => {
      toastSuccess('Role updated');
      void queryClient.invalidateQueries({ queryKey: ['orgs'] });
    },
    onError: (err) => toastError('Update failed', apiErrorMessage(err)),
  });

  const accept = useMutation({
    mutationFn: (id: string) => orgsApi.acceptInvitation(id),
    onSuccess: () => {
      toastSuccess('Invitation accepted');
      void queryClient.invalidateQueries({ queryKey: ['orgs'] });
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (err) => toastError('Could not accept', apiErrorMessage(err)),
  });

  const decline = useMutation({
    mutationFn: (id: string) => orgsApi.declineInvitation(id),
    onSuccess: () => {
      toastSuccess('Invitation declined');
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (err) => toastError('Could not decline', apiErrorMessage(err)),
  });

  function activeOrgId(): string {
    return orgs.data?.[0]?.id ?? '';
  }

  const myOrgs = orgs.data ?? [];
  const pending = invitations.data ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Organizations (${myOrgs.length})`}
          subtitle="Create or join an organization to collaborate with advisors and members"
          action={
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
              Create organization
            </Button>
          }
        />
        {myOrgs.length === 0 ? (
          <EmptyState
            title="You’re not in an organization yet"
            message="Organizations let firms and advisors share client portfolios with role-based access."
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create one</Button>}
            compact
          />
        ) : (
          <div className="space-y-6">
            {myOrgs.map((org) => (
              <OrgSection
                key={org.id}
                orgId={org.id}
                orgName={org.name}
                currentUserEmail={user?.email ?? ''}
                onInvite={() => setInviteOpen(true)}
                onChangeRole={(userId, role) => changeRole.mutate({ orgId: org.id, userId, role })}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={`Pending invitations (${pending.length})`} subtitle="Join an organization you were invited to" />
        {pending.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No pending invitations.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 flex-wrap rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {typeof inv.org === 'string' ? inv.org : inv.org.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Invited as {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => accept.mutate(inv.id)} loading={accept.isPending}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => decline.mutate(inv.id)}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create organization" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!orgName.trim()}>Create</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Input label="Organization name" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Meridian Wealth Advisors" autoFocus />
        </form>
      </Modal>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite member" subtitle="They must have a verified Aurevia account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!inviteEmail.trim()}>Send invitation</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
          <Input label="Email" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" autoFocus />
          <div>
            <label className="field-label">Role</label>
            <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface OrgSectionProps {
  orgId: string;
  orgName: string;
  currentUserEmail: string;
  onInvite: () => void;
  onChangeRole: (userId: string, role: OrgRole) => void;
}

function OrgSection({ orgId, orgName, currentUserEmail, onInvite, onChangeRole }: OrgSectionProps) {
  const members = useQuery({ queryKey: ['org', orgId, 'members'], queryFn: () => orgsApi.members(orgId) });
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold flex items-center gap-2">
          <Building2 size={15} style={{ color: 'var(--primary)' }} /> {orgName}
        </h4>
        <Button size="sm" variant="secondary" onClick={onInvite}>Invite member</Button>
      </div>
      {members.isLoading ? (
        <SkeletonCard rows={2} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(members.data ?? []).map((m) => {
                const isSelf = m.user.email === currentUserEmail;
                const isOwner = m.role === 'owner';
                return (
                  <tr key={m.id}>
                    <td>
                      <p className="font-medium">
                        {m.user.first_name} {m.user.last_name}
                        {isSelf ? <Badge tone="info" className="ml-2">You</Badge> : null}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{m.user.email}</p>
                    </td>
                    <td>
                      <Badge tone={m.role === 'owner' ? 'danger' : m.role === 'admin' ? 'warning' : m.role === 'advisor' ? 'primary' : 'muted'}>
                        {m.role}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {!isOwner ? (
                        <select
                          className="select !w-32 !py-1 text-xs"
                          value={m.role}
                          disabled={isSelf}
                          onChange={(e) => onChangeRole(m.user.id, e.target.value as OrgRole)}
                          aria-label={`Role for ${m.user.email}`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>Owner</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Notification preferences (server-backed) ---------------- */

const NOTIF_KIND_ROWS: { key: NotificationKind; label: string; desc: string }[] = [
  { key: 'price_alert', label: 'Price alerts', desc: 'When a watchlist alert condition triggers' },
  { key: 'portfolio_event', label: 'Portfolio events', desc: 'Large trades, transfers and corporate actions' },
  { key: 'dividend', label: 'Dividends', desc: 'Dividend payments and reminders' },
  { key: 'goal_milestone', label: 'Goal milestones', desc: 'Goal progress milestones and achievements' },
  { key: 'report_ready', label: 'Reports ready', desc: 'When an async report finishes generating' },
  { key: 'account_activity', label: 'Account activity', desc: 'Balance changes and account events' },
  { key: 'system', label: 'System', desc: 'Maintenance and security notices' },
];

function NotificationPrefsTab() {
  const queryClient = useQueryClient();
  const prefs = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationPreferencesApi.get,
  });
  const [local, setLocal] = useState<NotificationPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (prefs.data && !loaded) {
      setLocal(prefs.data);
      setLoaded(true);
    }
  }, [prefs.data, loaded]);

  const save = useMutation({
    mutationFn: () => notificationPreferencesApi.update(local ?? { email_enabled: {}, inapp_enabled: {} }),
    onSuccess: () => {
      toastSuccess('Preferences saved');
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (err) => toastError('Save failed', apiErrorMessage(err)),
  });

  const setKind = (kind: NotificationKind, channel: 'email_enabled' | 'inapp_enabled', value: boolean) => {
    setLocal((prev) => {
      const base = prev ?? { email_enabled: {}, inapp_enabled: {} };
      return { ...base, [channel]: { ...(base[channel] ?? {}), [kind]: value } };
    });
  };

  return (
    <Card>
      <CardHeader
        title="Notification preferences"
        subtitle="Choose which channels receive each kind of notification"
        action={
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!loaded}>
            Save preferences
          </Button>
        }
      />
      {prefs.isLoading ? (
        <SkeletonCard rows={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NOTIF_KIND_ROWS.map((r) => (
            <div key={r.key} className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium flex items-center gap-2">
                <Bell size={13} style={{ color: 'var(--muted)' }} /> {r.label}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{r.desc}</p>
              <div className="flex items-center gap-6 mt-3">
                <Toggle
                  checked={local?.inapp_enabled?.[r.key] ?? true}
                  onChange={(v) => setKind(r.key, 'inapp_enabled', v)}
                  label="In-app"
                  size="sm"
                />
                <Toggle
                  checked={local?.email_enabled?.[r.key] ?? true}
                  onChange={(v) => setKind(r.key, 'email_enabled', v)}
                  label="Email"
                  size="sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
