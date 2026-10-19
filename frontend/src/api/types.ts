/* ============================================================
   Aurevia API types — mirror of the DRF contract (§5).
   Money is ALWAYS a string on the wire (Decimal serialization).
   ============================================================ */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO-8601 datetime (UTC)

/* ---------- Money helpers ---------- */

export function parseMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  value: string | number | null | undefined,
  currency = 'USD',
  locale = 'en-US',
): string {
  const n = parseMoney(value);
  let key = `${locale}|${currency}`;
  let fmt = moneyFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatterCache.set(key, fmt);
  }
  return fmt.format(n);
}

export function formatMoneyCompact(
  value: string | number | null | undefined,
  currency = 'USD',
  locale = 'en-US',
): string {
  const n = parseMoney(value);
  const key = `${locale}|${currency}|compact`;
  let fmt = moneyFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    moneyFormatterCache.set(key, fmt);
  }
  return fmt.format(n);
}

export function formatPercent(value: string | number | null | undefined, digits = 2): string {
  const n = parseMoney(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatNumber(value: string | number | null | undefined, digits = 2): string {
  const n = parseMoney(value);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signClass(value: string | number | null | undefined): string {
  const n = parseMoney(value);
  if (n > 0) return 'text-positive';
  if (n < 0) return 'text-negative';
  return '';
}

/* ---------- Pagination ---------- */

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/* ---------- Auth / users ---------- */

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_email_verified: boolean;
  mfa_enabled: boolean;
  last_login_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface UserProfile {
  timezone: string;
  locale: string;
  base_currency: string;
  risk_profile: RiskProfile;
  onboarded: boolean;
}

export interface MeResponse {
  user: User;
  profile: UserProfile;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
  mfa_required?: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  mfa_code?: string;
}

export interface RefreshResponse {
  access: string;
}

export interface MfaSetupResponse {
  secret: string;
  otpauth_url: string;
  qr_svg: string;
}

export interface RecoveryCodesResponse {
  codes: string[];
}

export interface SecurityInfo {
  email_verified: boolean;
  mfa_enabled: boolean;
  last_login: ISODateTime | null;
  email: string;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export interface PatchProfilePayload {
  timezone?: string;
  locale?: string;
  base_currency?: string;
  risk_profile?: RiskProfile;
  onboarded?: boolean;
}

/* ---------- Organizations ---------- */

export type OrgRole = 'owner' | 'admin' | 'advisor' | 'member';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: ISODateTime;
}

export interface OrganizationMembership {
  id: string;
  user: User;
  role: OrgRole;
  joined_at: ISODateTime;
}

export interface Invitation {
  id: string;
  org: Organization | string;
  email: string;
  role: OrgRole;
  invited_by: string;
  accepted_at: ISODateTime | null;
  expires_at: ISODateTime;
  created_at: ISODateTime;
}

/* ---------- Instruments ---------- */

export type AssetClass = 'stock' | 'etf' | 'bond' | 'fund' | 'cash' | 'crypto' | 'private' | 'other';

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  sector: string | null;
  region: string | null;
  currency: string;
  risk_category: string | null;
  exchange: string | null;
  isin: string | null;
  latest_price?: string | null;
  change_pct?: string | null;
}

export interface PricePoint {
  date: ISODate;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
}

export interface InstrumentDetail extends Instrument {
  prices: PricePoint[];
  history_summary: {
    from: ISODate;
    to: ISODate;
    change_pct: string;
    high: string;
    low: string;
    avg_volume: number;
  } | null;
}

/* ---------- Portfolios ---------- */

export interface PortfolioSummary {
  total_value: string;
  total_cost: string;
  cash: string;
  realized_gains: string;
  unrealized_gains: string;
  return_pct: string;
}

export interface Portfolio {
  id: string;
  owner: string;
  org: string | null;
  name: string;
  currency: string;
  description: string;
  is_archived: boolean;
  created_at: ISODateTime;
  summary?: PortfolioSummary;
}

export interface Holding {
  instrument: Instrument;
  quantity: string;
  avg_cost: string;
  market_value: string;
  unrealized_gain: string;
  unrealized_gain_pct: string;
  weight_pct: string;
}

export type TransactionType =
  | 'buy'
  | 'sell'
  | 'desposit'
  | 'withdrawal'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'transfer'
  | 'corporate_action';

export type CorporateActionType = 'split' | 'merger' | 'spinoff' | 'name_change';

export interface Transaction {
  id: string;
  portfolio: string;
  account: string | null;
  instrument: Instrument | null;
  type: TransactionType;
  quantity: string | null;
  price: string | null;
  amount: string;
  fee: string;
  currency: string;
  date: ISODate;
  notes: string;
  corporate_action_type: CorporateActionType | null;
  created_by: string;
  created_at: ISODateTime;
}

export interface TransactionPayload {
  account?: string | null;
  instrument?: string | null;
  type: TransactionType;
  quantity?: string | number | null;
  price?: string | number | null;
  amount?: string | number | null;
  currency?: string | null;
  fee?: string | number | null;
  date: ISODate;
  notes?: string | null;
  corporate_action_type?: CorporateActionType | null;
}

export interface PerformanceResponse {
  dates: ISODate[];
  portfolio: (string | null)[];
  benchmark: (string | null)[];
  returns: Record<string, string | number | null>;
}

export interface AllocationSlice {
  label: string;
  value: string;
  weight_pct: string;
  color: string | null;
}

export type AllocationBy = 'asset_class' | 'sector' | 'region' | 'currency' | 'risk';

export interface HistoryPoint {
  date: ISODate;
  value: string;
  cash: string;
  invested: string;
  gains: string;
}

export interface IncomeSummary {
  dividends: string;
  interest: string;
  fees: string;
  by_month: { month: string; dividends: string; interest: string; fees: string }[];
}

export interface TransactionSummary {
  by_type: { type: TransactionType; amount: string; count: number }[];
  total_buys: string;
  total_sells: string;
  dividends: string;
  fees: string;
  net_cashflow: string;
}

/* ---------- Accounts ---------- */

export type AccountKind = 'cash' | 'brokerage' | 'retirement';

export interface Account {
  id: string;
  portfolio: string;
  name: string;
  broker: string;
  currency: string;
  kind: AccountKind;
  created_at: ISODateTime;
}

export interface AccountBalance {
  balance: string;
  currency: string;
  as_of: ISODate;
}

/* ---------- Analytics ---------- */

export interface AnalyticsReturns {
  total_return_pct: string;
  annualized_return_pct: string;
  twr_pct: string;
  mwr_pct: string;
  benchmark_return_pct: string;
  excess_return_pct: string;
  alpha: string;
  beta: string;
  sharpe: string;
  sortino: string;
  volatility_pct: string;
  max_drawdown_pct: string;
  best_month_pct: string;
  worst_month_pct: string;
  winning_months_pct: string;
  series: { date: ISODate; portfolio: string | null; benchmark: string | null }[];
}

export interface CostBasisHolding {
  symbol: string;
  quantity: string;
  avg_cost: string;
  total_cost: string;
  market_value: string;
  realized_gain: string;
  unrealized_gain: string;
}

export interface CostBasis {
  method: 'fifo' | 'average';
  holdings: CostBasisHolding[];
}

export interface Diversification {
  hhi: string;
  effective_count: string;
  concentration_level: string;
  top_10_weight_pct: string;
  by_asset_class: { asset_class: AssetClass; weight_pct: string }[];
}

export interface RiskMetrics {
  volatility_pct: string;
  var_95_pct: string;
  cvar_95_pct: string;
  beta: string;
  drawdown_series: { date: ISODate; drawdown_pct: string }[];
}

export interface BenchmarkComparison {
  symbol: string;
  correlation: string;
  beta: string;
  excess_return_pct: string;
  since: ISODate;
}

export interface ForecastResponse {
  goal_value: string;
  projected_value: string;
  probability_of_success: string;
  series: { year: number; value: string; contributed: string }[];
}

export type ContributionFreq = 'monthly' | 'quarterly' | 'yearly' | 'one-time';

/* ---------- Goals ---------- */

export interface Goal {
  id: string;
  owner: string;
  name: string;
  target_amount: string;
  target_date: ISODate;
  starting_amount: string;
  monthly_contribution: string;
  expected_return_pct: string;
  risk_level: RiskProfile;
  portfolio: string | null;
  is_achieved: boolean;
  created_at: ISODateTime;
}

export interface GoalPayload {
  name: string;
  target_amount: string | number;
  target_date: ISODate;
  starting_amount?: string | number;
  monthly_contribution?: string | number;
  expected_return_pct?: string | number;
  risk_level?: RiskProfile;
  portfolio?: string | null;
}

export interface GoalProgress {
  current_value: string;
  target_amount: string;
  progress_pct: string;
  on_track: boolean;
  projected_value_at_target: string;
  projected_date: ISODate | null;
  shortfall: string;
  months_remaining: number;
  series: { month: ISODate; value: string; projected: string }[];
}

export interface GoalContribution {
  id: string;
  goal: string;
  amount: string;
  date: ISODate;
  note: string;
  created_at: ISODateTime;
}

/* ---------- Watchlists ---------- */

export interface Watchlist {
  id: string;
  owner: string;
  name: string;
  is_default: boolean;
  created_at: ISODateTime;
}

export interface WatchlistItem {
  id: string;
  watchlist: string;
  instrument: Instrument;
  target_price: string | null;
  notes: string;
  favorite: boolean;
  added_at: ISODateTime;
}

export interface WatchlistOverviewItem {
  id: string;
  name: string;
  items: {
    instrument: Instrument;
    last_price: string | null;
    change_pct: string | null;
    target_price: string | null;
    distance_pct: string | null;
    favorite: boolean;
  }[];
}

export interface WatchlistAlert {
  id: string;
  owner: string;
  instrument: Instrument;
  watchlist: string | null;
  condition: 'above' | 'below' | 'change_pct';
  threshold: string;
  active: boolean;
  last_triggered_at: ISODateTime | null;
  created_at: ISODateTime;
}

/* ---------- Research ---------- */

export interface ResearchNote {
  id: string;
  owner: string;
  title: string;
  content: string;
  instrument: Instrument | null;
  portfolio: Portfolio | null;
  tags: string[];
  attachments?: NoteAttachment[];
  is_private: boolean;
  is_shared: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ResearchNotePayload {
  title: string;
  content: string;
  instrument?: string | null;
  portfolio?: string | null;
  tags?: string[];
  is_private?: boolean;
  is_shared?: boolean;
}

export interface NoteTag {
  name: string;
  count: number;
}

export interface NoteAttachment {
  id: string;
  note: string;
  file: string;
  filename?: string;
  uploaded_at: ISODateTime;
}

/* ---------- Reports ---------- */

export type ReportKind =
  | 'holdings'
  | 'transactions'
  | 'performance'
  | 'allocation'
  | 'income'
  | 'realized_gains'
  | 'portfolio_history'
  | 'client_portfolios';

export type ReportFormat = 'pdf' | 'csv';
export type ReportStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface Report {
  id: string;
  owner: string;
  kind: ReportKind;
  portfolio: string | null;
  client: string | null;
  format: ReportFormat;
  status: ReportStatus;
  download_url: string | null;
  error: string | null;
  params: Record<string, unknown>;
  created_at: ISODateTime;
  completed_at: ISODateTime | null;
}

export interface ReportPayload {
  kind: ReportKind;
  portfolio?: string | null;
  client?: string | null;
  format: ReportFormat;
  from?: ISODate | null;
  to?: ISODate | null;
}

/* ---------- Notifications ---------- */

export type NotificationKind =
  | 'price_alert'
  | 'portfolio_event'
  | 'dividend'
  | 'goal_milestone'
  | 'report_ready'
  | 'account_activity'
  | 'system';

export interface AppNotification {
  id: string;
  user: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: ISODateTime;
}

export interface UnreadCount {
  count: number;
}

/* ---------- Insights ---------- */

export type InsightKind =
  | 'drift'
  | 'rebalance'
  | 'goal'
  | 'risk'
  | 'concentration'
  | 'tax'
  | 'alert'
  | 'info';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: Severity;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_dismissed: boolean;
  created_at: ISODateTime;
  portfolio: string | null;
}

export interface InsightQuerry {
  kind?: InsightKind | '';
  severity?: Severity | '';
  unread_only?: boolean;
  page?: number;
}

/* ---------- Rebalancing ---------- */

export interface TargetAllocationItem {
  id: string;
  label: string;
  kind: string;
  target_weight_pct: string;
  current_weight_pct: string;
}

export interface TargetAllocation {
  items: TargetAllocationItem[];
  drift_threshold_pct: string;
}

export type RebalanceAction = 'buy' | 'sell' | 'hold';

export interface RebalanceSuggestion {
  label: string;
  kind: string;
  current_weight_pct: string;
  target_weight_pct: string;
  action: RebalanceAction;
  est_amount: string;
  est_quantity: string;
}

export interface RebalanceSuggestions {
  drift_pct: string;
  suggestions: RebalanceSuggestion[];
}

export interface RebalanceApplyItem {
  label: string;
  action: string;
  est_amount: string;
}

export interface RebalanceApplyPayload {
  items: RebalanceApplyItem[];
}

/* ---------- Contribution plans ---------- */

export interface ContributionPlan {
  id: string;
  portfolio: string;
  account: string | null;
  amount: string;
  frequency: string;
  day_of_month: number | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  next_run: ISODate | null;
  is_active: boolean;
}

export interface ContributionPlanPayload {
  account?: string | null;
  amount: string | number;
  frequency: string;
  day_of_month?: number | null;
  start_date?: ISODate | null;
  end_date?: ISODate | null;
  is_active?: boolean;
}

/* ---------- Analytics: rolling / drawdowns / capture / correlation / scenarios ---------- */

export interface RollingMetrics {
  window: number;
  dates: ISODate[];
  returns_pct: (string | null)[];
  volatility_pct: (string | null)[];
  sharpe: (string | null)[];
}

export interface DrawdownRow {
  start: ISODate;
  trough: ISODate;
  end: ISODate | null;
  depth_pct: string;
  duration_days: number;
  recovery_days: number | null;
}

export interface DrawdownsResponse {
  max_depth_pct: string;
  table: DrawdownRow[];
}

export interface CaptureRatio {
  benchmark: string;
  up_capture_pct: string;
  down_capture_pct: string;
  up_count: number;
  down_count: number;
  synthetic: boolean;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: (string | null)[][];
}

export interface ScenarioResult {
  base_value: string;
  scenario_value: string;
  change_pct: string;
  est_max_drawdown_pct: string;
  market_change_pct: number;
  vol_multiplier: number;
}

export interface ScenarioParams {
  market_change?: number;
  vol_multiplier?: number;
}

/* ---------- Goal scenarios ---------- */

export interface GoalScenarioSnapshot {
  projected_value?: string | null;
  projected_date?: ISODate | null;
  shortfall?: string | null;
  months_remaining?: number | null;
  [key: string]: unknown;
}

export interface GoalScenarioRun {
  baseline: GoalScenarioSnapshot;
  scenario: GoalScenarioSnapshot;
  difference: {
    months_earlier: number | null;
    extra_value: string;
    shortfall_reduction: string;
  };
}

export interface GoalScenarioParams {
  contribution?: number;
  return_pct?: number;
}

/* ---------- Watchlist sparklines & alert triggers ---------- */

export interface SparklinePoint {
  date: ISODate;
  close: string;
}

export interface SparklineItem {
  instrument_symbol: string;
  series: SparklinePoint[];
}

export interface AlertTrigger {
  id: string;
  price: string;
  condition: 'above' | 'below' | 'change_pct';
  threshold: string;
  triggered_at: ISODateTime;
}

/* ---------- Scheduled reports ---------- */

export interface ScheduledReport {
  id: string;
  kind: ReportKind;
  portfolio: string | null;
  format: ReportFormat;
  frequency: string;
  next_run: ISODateTime | null;
  last_run: ISODateTime | null;
  is_active: boolean;
}

export interface ScheduledReportPayload {
  kind: ReportKind;
  portfolio?: string | null;
  format: ReportFormat;
  frequency: string;
  is_active?: boolean;
}

/* ---------- Notification preferences ---------- */

export interface NotificationPreferences {
  email_enabled: Partial<Record<NotificationKind, boolean>>;
  inapp_enabled: Partial<Record<NotificationKind, boolean>>;
}

export interface NotificationPreferencesPayload {
  email_enabled?: Partial<Record<NotificationKind, boolean>>;
  inapp_enabled?: Partial<Record<NotificationKind, boolean>>;
}

/* ---------- Auth sessions ---------- */

export interface AuthSession {
  id: string;
  device_name: string;
  ip: string;
  user_agent: string;
  last_used_at: ISODateTime | null;
  created_at: ISODateTime;
  current: boolean;
}

/* ---------- Clients (advisor) ---------- */

export interface AumPortfolio {
  id: string;
  name: string;
  owner_email: string;
  value: string;
  return_ytd_pct: string;
}

export interface AumSummary {
  clients_count: number;
  aum: string;
  avg_return_ytd_pct: string;
  net_flows_ytd: string;
  portfolios: AumPortfolio[];
}

export interface ClientSummary {
  client: User;
  portfolios: { id: string; name: string; value: string; return: string }[];
}

export interface AssignedClient {
  id: string;
  client: User;
  portfolio: string | null;
  status: string;
  assigned_at: ISODateTime;
}

/* ---------- Misc ---------- */

export interface HealthStatus {
  status: string;
  database: boolean;
  redis: boolean;
}
