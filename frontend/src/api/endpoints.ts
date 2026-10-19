import { apiClient } from './client';
import type {
  Account,
  AccountBalance,
  AccountKind,
  AllocationBy,
  AllocationSlice,
  AlertTrigger,
  AnalyticsReturns,
  AppNotification,
  AssignedClient,
  AumSummary,
  AuthSession,
  BenchmarkComparison,
  CaptureRatio,
  ClientSummary,
  ContributionPlan,
  ContributionPlanPayload,
  CorrelationMatrix,
  CostBasis,
  Diversification,
  DrawdownsResponse,
  ForecastResponse,
  Goal,
  GoalContribution,
  GoalPayload,
  GoalProgress,
  GoalScenarioParams,
  GoalScenarioRun,
  HealthStatus,
  HistoryPoint,
  IncomeSummary,
  Insight,
  InsightQuery,
  Instrument,
  InstrumentDetail,
  Invitation,
  LoginPayload,
  LoginResponse,
  MeResponse,
  MfaSetupResponse,
  NoteAttachment,
  NoteTag,
  NotificationKind,
  NotificationPreferences,
  NotificationPreferencesPayload,
  Organization,
  OrganizationMembership,
  OrgRole,
  Paginated,
  PatchProfilePayload,
  PerformanceResponse,
  Portfolio,
  PortfolioSummary,
  PricePoint,
  RebalanceApplyPayload,
  RebalanceSuggestions,
  RecoveryCodesResponse,
  RegisterPayload,
  Report,
  ReportFormat,
  ReportKind,
  ReportPayload,
  ResearchNote,
  ResearchNotePayload,
  RiskMetrics,
  RollingMetrics,
  ScenarioParams,
  ScenarioResult,
  ScheduledReport,
  ScheduledReportPayload,
  SecurityInfo,
  SparklineItem,
  TargetAllocation,
  Transaction,
  TransactionPayload,
  TransactionSummary,
  TransactionType,
  UnreadCount,
  User,
  Watchlist,
  WatchlistAlert,
  WatchlistItem,
  WatchlistOverviewItem,
} from './types';

/* ============================================================
   Auth & users
   ============================================================ */

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<User>('/auth/register/', payload).then((r) => r.data),
  login: (payload: LoginPayload) => apiClient.post<LoginResponse>('/auth/login/', payload).then((r) => r.data),
  refresh: (refresh: string) => apiClient.post<{ access: string }>('/auth/refresh/', { refresh }).then((r) => r.data),
  verifyEmail: (token: string) =>
    apiClient.get<{ detail?: string }>(`/auth/verify-email/${token}/`).then((r) => r.data),
  resendVerification: (email: string) =>
    apiClient.post<{ detail?: string }>('/auth/resend-verification/', { email }).then((r) => r.data),
  forgotPassword: (email: string) =>
    apiClient.post<{ detail?: string }>('/auth/password-reset/', { email }).then((r) => r.data),
  resetPassword: (token: string, password: string) =>
    apiClient
      .post<{ detail?: string }>('/auth/password-reset/confirm/', { token, password })
      .then((r) => r.data),
  mfaSetup: () => apiClient.get<MfaSetupResponse>('/auth/mfa/setup/').then((r) => r.data),
  mfaConfirm: (code: string) =>
    apiClient.post<{ detail?: string }>('/auth/mfa/confirm/', { code }).then((r) => r.data),
  mfaDisable: (code: string) =>
    apiClient.post<{ detail?: string }>('/auth/mfa/disable/', { code }).then((r) => r.data),
  mfaRecoveryCodes: (code: string) =>
    apiClient
      .post<RecoveryCodesResponse>('/auth/mfa/recovery-codes/', { code })
      .then((r) => r.data),
  changePassword: (old_password: string, new_password: string) =>
    apiClient
      .post<{ detail?: string }>('/auth/change-password/', { old_password, new_password })
      .then((r) => r.data),
};

export const usersApi = {
  me: () => apiClient.get<MeResponse>('/users/me/').then((r) => r.data),
  patchMe: (payload: PatchProfilePayload) =>
    apiClient.patch<MeResponse>('/users/me/', payload).then((r) => r.data),
  security: () => apiClient.get<SecurityInfo>('/users/me/security/').then((r) => r.data),
};

/* ============================================================
   Organizations
   ============================================================ */

export const orgsApi = {
  list: () => apiClient.get<Organization[]>('/orgs/').then((r) => r.data),
  create: (name: string) => apiClient.post<Organization>('/orgs/', { name }).then((r) => r.data),
  detail: (id: string) => apiClient.get<Organization>(`/orgs/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<Pick<Organization, 'name'>>) =>
    apiClient.patch<Organization>(`/orgs/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/orgs/${id}/`).then((r) => r.data),
  members: (id: string) =>
    apiClient.get<OrganizationMembership[]>(`/orgs/${id}/members/`).then((r) => r.data),
  updateMemberRole: (id: string, userId: string, role: OrgRole) =>
    apiClient
      .patch<OrganizationMembership>(`/orgs/${id}/members/${userId}/`, { role })
      .then((r) => r.data),
  invite: (id: string, email: string, role: OrgRole) =>
    apiClient.post<Invitation>(`/orgs/${id}/invitations/`, { email, role }).then((r) => r.data),
  pendingInvitations: () =>
    apiClient.get<Invitation[]>('/invitations/pending/').then((r) => r.data),
  acceptInvitation: (id: string) =>
    apiClient.post<{ detail?: string }>(`/invitations/${id}/accept/`).then((r) => r.data),
  declineInvitation: (id: string) => apiClient.delete(`/invitations/${id}/`).then((r) => r.data),
};

/* ============================================================
   Clients (advisor)
   ============================================================ */

export const clientsApi = {
  list: () => apiClient.get<AssignedClient[]>('/clients/').then((r) => r.data),
  assign: (client_id: string, portfolio_id?: string) =>
    apiClient
      .post<AssignedClient>('/clients/assign/', { client_id, portfolio_id })
      .then((r) => r.data),
  summary: (id: string) => apiClient.get<ClientSummary>(`/clients/${id}/summary/`).then((r) => r.data),
};

/* ============================================================
   Instruments & market data
   ============================================================ */

export interface InstrumentQuery {
  search?: string;
  asset_class?: string;
  currency?: string;
  page?: number;
}

export const instrumentsApi = {
  list: (params: InstrumentQuery = {}) =>
    apiClient.get<Paginated<Instrument>>('/instruments/', { params }).then((r) => r.data),
  detail: (symbol: string) =>
    apiClient.get<InstrumentDetail>(`/instruments/${symbol}/`).then((r) => r.data),
  prices: (symbol: string, params: { from?: string; to?: string; interval?: string } = {}) =>
    apiClient.get<PricePoint[]>(`/instruments/${symbol}/price/`, { params }).then((r) => r.data),
};

/* ============================================================
   Portfolios
   ============================================================ */

export interface CreatePortfolioPayload {
  name: string;
  currency: string;
  description?: string;
}

export const portfoliosApi = {
  list: () => apiClient.get<Portfolio[]>('/portfolio/').then((r) => r.data),
  create: (payload: CreatePortfolioPayload) =>
    apiClient.post<Portfolio>('/portfolios/', payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Portfolio>(`/portfolios/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<CreatePortfolioPayload> & { is_archived?: boolean }) =>
    apiClient.patch<Portfolio>(`/portfolios/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/portfolios/${id}/`).then((r) => r.data),
  duplicate: (id: string) => apiClient.post<Portfolio>(`/portfolios/${id}/duplicate/`).then((r) => r.data),
  targets: (id: string) => apiClient.get<TargetAllocation>(`/portfolios/${id}/targets/`).then((r) => r.data),
  updateTargets: (
    id: string,
    payload: { items: Partial<TargetAllocation['items'][number]>[]; drift_threshold_pct?: string | number },
  ) => apiClient.put<TargetAllocation>(`/portfolios/${id}/targets/`, payload).then((r) => r.data),
  rebalanceSuggestions: (id: string) =>
    apiClient.get<RebalanceSuggestions>(`/portfolios/${id}/rebalance-suggestions/`).then((r) => r.data),
  applyRebalance: (id: string, payload: RebalanceApplyPayload) =>
    apiClient.post<{ detail?: string }>(`/portfolios/${id}/rebalance/apply/`, payload).then((r) => r.data),
  contributionPlans: (id: string) =>
    apiClient.get<ContributionPlan[]>(`/portfolios/${id}/contribution-plans/`).then((r) => r.data),
  createContributionPlan: (id: string, payload: ContributionPlanPayload) =>
    apiClient.post<ContributionPlan>(`/portfolios/${id}/contribution-plans/`, payload).then((r) => r.data),
  holdings: (id: string) =>
    apiClient.get<import('./types').Holding[] | { results: import('./types').Holding[]; count: number }>(
      `/portfolios/${id}/holdings/`,
    ).then((r) => {
      const d = r.data;
      if (Array.isArray(d)) return { results: d, count: d.length };
      return d;
    }),
  transactions: (id: string, params: { type?: TransactionType; from?: string; to?: string; page?: number } = {}) =>
    apiClient
      .get<Paginated<Transaction>>(`/portfolios/${id}/transactions/`, { params })
      .then((r) => r.data),
  transactionsSummary: (id: string) =>
    apiClient.get<TransactionSummary>(`/portfolios/${id}/transactions/summary/`).then((r) => r.data),
  performance: (id: string, params: { from?: string; to?: string; benchmark?: string } = {}) =>
    apiClient.get<PerformanceResponse>(`/portfolios/${id}/performance/`, { params }).then((r) => r.data),
  allocation: (id: string, by: AllocationBy = 'asset_class') =>
    apiClient.get<AllocationSlice[]>(`/portfolios/${id}/allocation/`, { params: { by } }).then((r) => r.data),
  history: (id: string, params: { interval?: 'day' | 'week' | 'month' } = {}) =>
    apiClient.get<HistoryPoint[]>(`/portfolios/${id}/history/`, { params }).then((r) => r.data),
  income: (id: string, params: { from?: string; to?: string } = {}) =>
    apiClient.get<IncomeSummary>(`/portfolios/${id}/income/`, { params }).then((r) => r.data),
  watchlist: (id: string) =>
    apiClient.get<WatchlistItem[]>(`/portfolios/${id}/watchlist/`).then((r) => r.data),
};

export const transactionsApi = {
  create: (portfolioId: string, payload: TransactionPayload) =>
    apiClient.post<Transaction>(`/portfolios/${portfolioId}/transactions/`, payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Transaction>(`/transactions/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<TransactionPayload>) =>
    apiClient.patch<Transaction>(`/transactions/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/transactions/${id}/`).then((r) => r.data),
};

/* ============================================================
   Accounts
   ============================================================ */

export const accountsApi = {
  list: (portfolioId: string) =>
    apiClient.get<Account[]>(`/portfolios/${portfolioId}/accounts/`).then((r) => r.data),
  create: (
    portfolioId: string,
    payload: { name: string; broker?: string; currency: string; kind: AccountKind },
  ) => apiClient.post<Account>(`/portfolios/${portfolioId}/accounts/`, payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Account>(`/accounts/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<{ name: string; broker: string; kind: AccountKind }>) =>
    apiClient.patch<Account>(`/accounts/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/accounts/${id}/`).then((r) => r.data),
  balance: (id: string) => apiClient.get<AccountBalance>(`/accounts/${id}/balance/`).then((r) => r.data),
};

/* ============================================================
   Analytics
   ============================================================ */

export const analyticsApi = {
  returns: (portfolioId: string, params: { from?: string; to?: string; benchmark?: string } = {}) =>
    apiClient.get<AnalyticsReturns>(`/analytics/portfolios/${portfolioId}/return/`, { params }).then((r) => r.data),
  costBasis: (portfolioId: string) =>
    apiClient.get<CostBasis>(`/analytics/portfolios/${portfolioId}/cost-basis/`).then((r) => r.data),
  diversification: (portfolioId: string) =>
    apiClient.get<Diversification>(`/analytics/portfolios/${portfolioId}/diversification/`).then((r) => r.data),
  risk: (portfolioId: string) =>
    apiClient.get<RiskMetrics>(`/analytics/portfolios/${portfolioId}/risk/`).then((r) => r.data),
  benchmarks: (portfolioId: string, symbols: string) =>
    apiClient
      .get<BenchmarkComparison[]>(`/analytics/portfolios/${portfolioId}/benchmarks/`, { params: { symbols } })
      .then((r) => r.data),
  forecast: (
    portfolioId: string,
    params: { years?: number; expected_return?: number; contribution?: number; contribution_freq?: string } = {},
  ) =>
    apiClient.get<ForecastResponse>(`/analytics/portfolios/${portfolioId}/forecast/`, { params }).then((r) => r.data),
  rolling: (portfolioId: string, window: number) =>
    apiClient.get<RollingMetrics>(`/analytics/portfolios/${portfolioId}/rolling/`, { params: { window } }).then((r) => r.data),
  drawdowns: (portfolioId: string) =>
    apiClient.get<DrawdownsResponse>(`/analytics/portfolios/${portfolioId}/drawdowns/`).then((r) => r.data),
  capture: (portfolioId: string, benchmark: string) =>
    apiClient
      .get<CaptureRatio>(`/analytics/portfolios/${portfolioId}/capture/`, { params: { benchmark } })
      .then((r) => r.data),
  correlation: (portfolioId: string) =>
    apiClient.get<CorrelationMatrix>(`/analytics/portfolios/${portfolioId}/correlation/`).then((r) => r.data),
  scenarios: (portfolioId: string, params: ScenarioParams = {}) =>
    apiClient.get<ScenarioResult>(`/analytics/portfolios/${portfolioId}/scenarios/`, { params }).then((r) => r.data),
};

/* ============================================================
   Goals
   ============================================================ */

export const goalsApi = {
  list: () => apiClient.get<Goal[]>('/goals/').then((r) => r.data),
  create: (payload: GoalPayload) => apiClient.post<Goal>('/goals/', payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Goal>(`/goals/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<GoalPayload>) =>
    apiClient.patch<Goal>(`/goals/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/goals/${id}/`).then((r) => r.data),
  progress: (id: string) => apiClient.get<GoalProgress>(`/goals/${id}/progress/`).then((r) => r.data),
  contributions: (id: string) =>
    apiClient.get<GoalContribution[]>(`/goals/${id}/contributions/`).then((r) => r.data),
  addContribution: (id: string, payload: { amount: string | number; date: string; note?: string }) =>
    apiClient.post<GoalContribution>(`/goals/${id}/contributions/`, payload).then((r) => r.data),
  scenarios: (id: string, params: GoalScenarioParams = {}) =>
    apiClient.get<GoalScenarioRun>(`/goals/${id}/scenarios/`, { params }).then((r) => r.data),
};

/* ============================================================
   Watchlists
   ============================================================ */

export const watchlistsApi = {
  list: () => apiClient.get<Watchlist[]>('/watchlists/').then((r) => r.data),
  create: (payload: { name: string; is_default?: boolean }) =>
    apiClient.post<Watchlist>('/watchlists/', payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Watchlist>(`/watchlists/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<{ name: string; is_default: boolean }>) =>
    apiClient.patch<Watchlist>(`/watchlists/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/watchlists/${id}/`).then((r) => r.data),
  items: (id: string) => apiClient.get<WatchlistItem[]>(`/watchlists/${id}/items/`).then((r) => r.data),
  addItem: (id: string, payload: { instrument: string; target_price?: string | number; notes?: string; favorite?: boolean }) =>
    apiClient.post<WatchlistItem>(`/watchlists/${id}/items/`, payload).then((r) => r.data),
  overview: () => apiClient.get<WatchlistOverviewItem[]>('/watchlists/overview/').then((r) => r.data),
  sparklines: (id: string) =>
    apiClient.get<SparklineItem[]>(`/watchlists/${id}/sparklines/`).then((r) => r.data),
};

export const watchlistItemsApi = {
  patch: (id: string, payload: Partial<{ target_price: string | number; notes: string; favorite: boolean }>) =>
    apiClient.patch<WatchlistItem>(`/watchlist-items/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/watchlist-items/${id}/`).then((r) => r.data),
};

export const watchlistAlertsApi = {
  list: () => apiClient.get<WatchlistAlert[]>('/watchlist-alerts/').then((r) => r.data),
  create: (payload: {
    instrument: string;
    watchlist?: string | null;
    condition: 'above' | 'below' | 'change_pct';
    threshold: string | number;
    active?: boolean;
  }) => apiClient.post<WatchlistAlert>('/watchlist-alert/', payload).then((r) => r.data),
  patch: (id: string, payload: Partial<{ threshold: string | number; condition: 'above' | 'below' | 'change_pct'; active: boolean }>) =>
    apiClient.patch<WatchlistAlert>(`/watchlist-alerts/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/watchlist-alerts/${id}/`).then((r) => r.data),
  triggers: (id: string, params: { page?: number } = {}) =>
    apiClient.get<Paginated<AlertTrigger>>(`/watchlist-alerts/${id}/triggers/`, { params }).then((r) => r.data),
};

/* ============================================================
   Research
   ============================================================ */

export const researchApi = {
  list: (params: { tag?: string; page?: number; shared?: boolean } = {}) =>
    apiClient
      .get<Paginated<ResearchNote>>('/research/notes/', {
        params: { ...params, shared: params.shared ? 'true' : undefined },
      })
      .then((r) => r.data),
  create: (payload: ResearchNotePayload) =>
    apiClient.post<ResearchNote>('/research/notes/', payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<ResearchNote>(`/research/notes/${id}/`).then((r) => r.data),
  patch: (id: string, payload: Partial<ResearchNotePayload>) =>
    apiClient.patch<ResearchNote>(`/research/notes/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/research/notes/${id}/`).then((r) => r.data),
  uploadAttachment: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post<NoteAttachment>(`/research/notes/${noteId}/attachments/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  deleteAttachment: (attachmentId: string) =>
    apiClient.delete(`/research/attachments/${attachmentId}/`).then((r) => r.data),
  tags: () => apiClient.get<NoteTag[]>('/research/tags/').then((r) => r.data),
};

/* ============================================================
   Reports
   ============================================================ */

export const reportsApi = {
  list: (params: { status?: string; page?: number } = {}) =>
    apiClient.get<Paginated<Report>>('/reports/', { params }).then((r) => r.data),
  create: (payload: ReportPayload) => apiClient.post<Report>('/reports/', payload).then((r) => r.data),
  detail: (id: string) => apiClient.get<Report>(`/reports/${id}/`).then((r) => r.data),
  downloadUrl: (id: string) => `/api/v1/reports/${id}/download/`,
};

/** Download a report file as an attachment. */
export async function downloadReport(id: string, filename: string): Promise<void> {
  const res = await apiClient.get(`/reports/${id}/download/`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/* ============================================================
   Notifications
   ============================================================ */

export const notificationsApi = {
  list: (params: { unread_only?: boolean; kind?: NotificationKind | ''; page?: number } = {}) =>
    apiClient
      .get<Paginated<AppNotification>>('/notifications/', {
        params: {
          unread_only: params.unread_only ? 'true' : undefined,
          kind: params.kind || undefined,
          page: params.page,
        },
      })
      .then((r) => r.data),
  markRead: (id: string) =>
    apiClient.post<{ detail?: string }>(`/notifications/${id}/read/`).then((r) => r.data),
  markAllRead: () =>
    apiClient.post<{ detail?: string }>('/notifications/read-all/').then((r) => r.data),
  unreadCount: () => apiClient.get<UnreadCount>('/notifications/unread-count/').then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/notifications/${id}/`).then((r) => r.data),
};

/* ============================================================
   Insights
   ============================================================ */

export const insightsApi = {
  list: (params: InsightQuery = {}) =>
    apiClient
      .get<Paginated<Insight>>('/insights/', {
        params: {
          kind: params.kind || undefined,
          severity: params.severity || undefined,
          unread_only: params.unread_only ? 'true' : undefined,
          page: params.page,
        },
      })
      .then((r) => r.data),
  portfolioInsights: (portfolioId: string) =>
    apiClient.get<Insight[]>(`/insights/portfolios/${portfolioId}/`).then((r) => r.data),
  dismiss: (id: string) =>
    apiClient.post<{ detail?: string }>(`/insights/${id}/dismiss/`).then((r) => r.data),
  unreadCount: () => apiClient.get<UnreadCount>('/insights/unread-count/').then((r) => r.data),
};

/* ============================================================
   Contribution plans
   ============================================================ */

export const contributionPlansApi = {
  patch: (id: string, payload: Partial<ContributionPlanPayload>) =>
    apiClient.patch<ContributionPlan>(`/contribution-plans/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/contribution-plans/${id}/`).then((r) => r.data),
};

/* ============================================================
   Scheduled reports
   ============================================================ */

export const scheduledReportsApi = {
  list: () => apiClient.get<ScheduledReport[]>('/scheduled-reports/').then((r) => r.data),
  create: (payload: ScheduledReportPayload) =>
    apiClient.post<ScheduledReport>('/scheduled-reports/', payload).then((r) => r.data),
  patch: (id: string, payload: Partial<ScheduledReportPayload>) =>
    apiClient.patch<ScheduledReport>(`/scheduled-reports/${id}/`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/scheduled-reports/${id}/`).then((r) => r.data),
};

/* ============================================================
   Notification preferences
   ============================================================ */

export const notificationPreferencesApi = {
  get: () => apiClient.get<NotificationPreferences>('/notifications/preferences/').then((r) => r.data),
  update: (payload: NotificationPreferencesPayload) =>
    apiClient.put<NotificationPreferences>('/notifications/preferences/', payload).then((r) => r.data),
};

/* ============================================================
   Auth sessions
   ============================================================ */

export const sessionsApi = {
  list: () => apiClient.get<AuthSession[]>('/auth/sessions/').then((r) => r.data),
  revoke: (id: string) => apiClient.post<{ detail?: string }>(`/auth/sessions/${id}/revoke/`).then((r) => r.data),
  revokeAll: () => apiClient.post<{ detail?: string }>('/auth/sessions/revoke-all/').then((r) => r.data),
};

/* ============================================================
   Clients AUM
   ============================================================ */

export const aumApi = {
  summary: () => apiClient.get<AumSummary>('/clients/aum/').then((r) => r.data),
};

/* ============================================================
   Misc
   ============================================================ */

export const healthApi = {
  check: () => apiClient.get<HealthStatus>('/health/').then((r) => r.data),
};

/* Re-export common shapes for convenience */
export type { AccountKind, NotificationKind, ReportFormat, ReportKind, TransactionType, PortfolioSummary };
