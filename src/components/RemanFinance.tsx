import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { useSession } from '@/contexts/SessionContext';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

// Admin-only Finance tab — requested directly: "can you calculate how
// much profit we make a year at least try to come up with a number give
// me some fields so i can change in the app." Revenue is the one number
// here that isn't a manual field — it's `reman_analytics`'s own
// `totalRevenue` (HT, validated against the shop's real production
// reports — see reman.rs's "Revenue accuracy" investigation), called here
// with a trailing-365-day window. Everything else has no source of truth
// in 4D, so it's editable instead of guessed. Same admin gating as the
// roster (`reman_get_finance_settings`/`reman_update_finance_settings`
// check `requestingTechId` server-side too, a client-side hide alone
// isn't a real boundary).

interface FinanceSettings {
  rentMonthly: number | null;
  electricityMonthly: number | null;
  reimbursementsMonthly: number | null;
  insuranceMonthly: number | null;
  suppliesMonthly: number | null;
  subscriptionsMonthly: number | null;
  miscMonthly: number | null;
  debtBalance: number | null;
  debtMonthlyPayment: number | null;
  stockValue: number | null;
  taxRatePercent: number | null;
  employerChargesPercent: number | null;
}

interface RosterEntryLite {
  techId: string;
  techName: string;
  isActive: boolean;
  salaryMonthly: number | null;
}

// Real supplier-invoice figures (ledger-account based, see reman.rs's
// "Supplier cost estimate" doc comment) — partsCogs and
// subcontractedServices are both subtracted automatically, like revenue;
// externalCharges is shown only as a reference next to the manual
// fixed-cost fields, never auto-applied to them.
interface SupplierCostEstimate {
  partsCogs: number;
  subcontractedServices: number;
  externalCharges: number;
}

const EMPTY_SETTINGS: FinanceSettings = {
  rentMonthly: null,
  electricityMonthly: null,
  reimbursementsMonthly: null,
  insuranceMonthly: null,
  suppliesMonthly: null,
  subscriptionsMonthly: null,
  miscMonthly: null,
  debtBalance: null,
  debtMonthlyPayment: null,
  stockValue: null,
  taxRatePercent: null,
  employerChargesPercent: null,
};

const eurFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formatEUR = (n: number) => eurFormatter.format(n);

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Monthly cost fields folded into the annual estimate — debtBalance and
// stockValue are deliberately excluded, they're point-in-time balance
// figures, not recurring costs, and shown separately instead.
const MONTHLY_FIELDS: (keyof FinanceSettings)[] = [
  'rentMonthly', 'electricityMonthly', 'reimbursementsMonthly', 'insuranceMonthly',
  'suppliesMonthly', 'subscriptionsMonthly', 'miscMonthly', 'debtMonthlyPayment',
];

// Fiscal year picker — requested directly after comparing against a real
// filed P&L (a company-registry "bilan" showing "Date de clôture:
// 31/03/2025" under the column header "2024"), which confirmed this
// shop's fiscal year runs 1 April → 31 March, labeled by its start year.
// `startYear` below means "fiscal year starting April of `startYear`."
// If that boundary is ever wrong, it only lives here — one place to fix.
const FISCAL_YEAR_START_MONTH = 4; // April, 1-indexed

function currentFiscalYearStart(today: Date): number {
  const month = today.getMonth() + 1;
  return month >= FISCAL_YEAR_START_MONTH ? today.getFullYear() : today.getFullYear() - 1;
}

function fiscalYearRange(startYear: number): { from: string; to: string } {
  const from = `${startYear}-04-01`;
  const naturalTo = `${startYear + 1}-03-31`;
  const today = toISO(new Date());
  // Cap at today for the still-in-progress fiscal year — a future date
  // range would just come back empty from 4D, not an error, but "empty"
  // reads as a bug rather than "this year isn't over yet."
  const to = naturalTo < today ? naturalTo : today;
  return { from, to };
}

export default function RemanFinance() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const requestingTechId = currentUser?.remanTechId ?? '';

  const [settings, setSettings] = useState<FinanceSettings>(EMPTY_SETTINGS);
  const [draft, setDraft] = useState<FinanceSettings>(EMPTY_SETTINGS);
  const [roster, setRoster] = useState<RosterEntryLite[]>([]);
  const [annualRevenue, setAnnualRevenue] = useState<number | null>(null);
  const [supplierCost, setSupplierCost] = useState<SupplierCostEstimate | null>(null);
  const [fiscalYearStart, setFiscalYearStart] = useState(() => currentFiscalYearStart(new Date()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);

  const fiscalYearOptions = useMemo(() => {
    const current = currentFiscalYearStart(new Date());
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, []);

  const load = useCallback(() => {
    if (!requestingTechId) return;
    setLoading(true);
    setError('');
    const { from, to } = fiscalYearRange(fiscalYearStart);

    Promise.all([
      invoke<FinanceSettings>('reman_get_finance_settings', { requestingTechId }),
      invoke<RosterEntryLite[]>('reman_list_roster', { requestingTechId }),
      invoke<{ totalRevenue: number }>('reman_analytics', { fromDate: from, toDate: to }),
      invoke<SupplierCostEstimate>('reman_supplier_cost_estimate', { fromDate: from, toDate: to }),
    ])
      .then(([fetchedSettings, fetchedRoster, analytics, cost]) => {
        setSettings(fetchedSettings);
        setDraft(fetchedSettings);
        setRoster(fetchedRoster);
        setAnnualRevenue(analytics.totalRevenue);
        setSupplierCost(cost);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [requestingTechId, fiscalYearStart]);

  useEffect(() => { load(); }, [load]);

  const isDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await invoke('reman_update_finance_settings', { requestingTechId, settings: draft });
      setSettings(draft);
      setSavedJustNow(true);
      setTimeout(() => setSavedJustNow(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: keyof FinanceSettings, raw: string) => {
    const trimmed = raw.trim();
    setDraft(prev => ({ ...prev, [field]: trimmed === '' ? null : Number(trimmed) }));
  };

  const activeSalaryMonthlyTotal = roster
    .filter(r => r.isActive && r.salaryMonthly != null)
    .reduce((sum, r) => sum + (r.salaryMonthly ?? 0), 0);
  const missingSalaryCount = roster.filter(r => r.isActive && r.salaryMonthly == null).length;

  const monthlyCostTotal = MONTHLY_FIELDS.reduce((sum, f) => sum + (draft[f] ?? 0), 0);
  const annualFixedCosts = monthlyCostTotal * 12;
  // Employer charges (charges patronales) applied on top of gross salary
  // — added after the first real comparison against a filed P&L showed
  // salary alone understated true labor cost.
  const employerChargesMultiplier = 1 + (draft.employerChargesPercent ?? 0) / 100;
  const annualSalaries = activeSalaryMonthlyTotal * 12 * employerChargesMultiplier;
  const revenue = annualRevenue ?? 0;
  // Both live-computed from real supplier invoices (Lig_FactureFr, French
  // ledger accounts), not manual fields — see reman.rs's "Supplier cost
  // estimate" doc comment. Split apart (not one lumped "COGS" figure)
  // after the first pass conflated parts/materials with purchased
  // services, which made the combined number read as far higher than
  // "units bought to resell" alone would suggest.
  const partsCogs = supplierCost?.partsCogs ?? 0;
  const subcontractedServices = supplierCost?.subcontractedServices ?? 0;
  const preTaxProfit = revenue - partsCogs - subcontractedServices - annualSalaries - annualFixedCosts;
  const taxRate = (draft.taxRatePercent ?? 0) / 100;
  const estimatedTax = preTaxProfit > 0 ? preTaxProfit * taxRate : 0;
  const netProfit = preTaxProfit - estimatedTax;

  if (!requestingTechId) {
    return <p className="text-sm text-text-tertiary py-8 text-center">{t('reman.roster.claim_first')}</p>;
  }

  const FIELD_GROUPS: { title: string; fields: { key: keyof FinanceSettings; label: string; placeholder?: string; hint?: string }[] }[] = [
    {
      title: t('reman.finance.group_payroll'),
      fields: [
        {
          key: 'employerChargesPercent',
          label: t('reman.finance.field_employer_charges'),
          placeholder: '%',
          hint: t('reman.finance.field_employer_charges_hint'),
        },
      ],
    },
    {
      title: t('reman.finance.group_fixed_costs'),
      fields: [
        { key: 'rentMonthly', label: t('reman.finance.field_rent') },
        { key: 'electricityMonthly', label: t('reman.finance.field_electricity') },
        { key: 'insuranceMonthly', label: t('reman.finance.field_insurance') },
        { key: 'suppliesMonthly', label: t('reman.finance.field_supplies') },
        { key: 'subscriptionsMonthly', label: t('reman.finance.field_subscriptions') },
        { key: 'reimbursementsMonthly', label: t('reman.finance.field_reimbursements') },
        { key: 'miscMonthly', label: t('reman.finance.field_misc') },
      ],
    },
    {
      title: t('reman.finance.group_debt'),
      fields: [
        { key: 'debtMonthlyPayment', label: t('reman.finance.field_debt_payment') },
        { key: 'debtBalance', label: t('reman.finance.field_debt_balance') },
      ],
    },
    {
      title: t('reman.finance.group_other'),
      fields: [
        { key: 'stockValue', label: t('reman.finance.field_stock_value') },
        { key: 'taxRatePercent', label: t('reman.finance.field_tax_rate'), placeholder: '%' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
      {loading && (
        <div className="text-center py-16 text-text-tertiary text-sm">{t('common.loading')}</div>
      )}

      {!loading && (
        <>
          {/* Summary */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-text-primary">{t('reman.finance.summary_title')}</h3>
              <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                {t('reman.finance.fiscal_year')}
                <select
                  value={fiscalYearStart}
                  onChange={e => setFiscalYearStart(Number(e.target.value))}
                  className="text-xs bg-elevated border border-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {fiscalYearOptions.map(y => (
                    <option key={y} value={y}>{y}–{y + 1}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryStat label={t('reman.finance.stat_revenue')} value={formatEUR(revenue)} />
              <SummaryStat label={t('reman.finance.stat_parts_cogs')} value={formatEUR(partsCogs)} negative />
              <SummaryStat label={t('reman.finance.stat_subcontracted')} value={formatEUR(subcontractedServices)} negative />
              <SummaryStat label={t('reman.finance.stat_salaries')} value={formatEUR(annualSalaries)} negative />
              <SummaryStat label={t('reman.finance.stat_fixed_costs')} value={formatEUR(annualFixedCosts)} negative />
              <SummaryStat label={t('reman.finance.stat_tax')} value={formatEUR(estimatedTax)} negative />
              <SummaryStat label={t('reman.finance.stat_pretax_profit')} value={formatEUR(preTaxProfit)} highlight={preTaxProfit >= 0} />
              <SummaryStat label={t('reman.finance.stat_net_profit')} value={formatEUR(netProfit)} highlight={netProfit >= 0} bold />
              <SummaryStat label={t('reman.finance.stat_stock_value')} value={formatEUR(draft.stockValue ?? 0)} />
              <SummaryStat label={t('reman.finance.stat_debt_balance')} value={formatEUR(draft.debtBalance ?? 0)} />
            </div>
            <div className="flex items-start gap-1.5 text-[10px] text-text-tertiary pt-1 border-t border-border">
              <InformationCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>
                {t('reman.finance.summary_caveat', { count: roster.filter(r => r.isActive).length })}
                {missingSalaryCount > 0 && ` ${t('reman.finance.summary_missing_salary', { count: missingSalaryCount })}`}
                {supplierCost != null && ` ${t('reman.finance.summary_external_charges_ref', { amount: formatEUR(supplierCost.externalCharges) })}`}
              </p>
            </div>
          </div>

          {/* Editable fields */}
          {FIELD_GROUPS.map(group => (
            <div key={group.title} className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{group.title}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {group.fields.map(f => (
                  <label key={f.key} className="space-y-1">
                    <span className="text-[11px] text-text-tertiary">{f.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft[f.key] ?? ''}
                      placeholder={f.placeholder ?? '0'}
                      onChange={e => setField(f.key, e.target.value)}
                      className="w-full text-xs bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    {f.hint && <p className="text-[10px] text-text-tertiary">{f.hint}</p>}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end gap-2">
            {savedJustNow && <span className="text-[11px] text-success">{t('reman.finance.saved')}</span>}
            <button
              type="button"
              onClick={save}
              disabled={!isDirty || saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, negative, highlight, bold }: { label: string; value: string; negative?: boolean; highlight?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className={[
        bold ? 'text-base font-bold' : 'text-sm font-semibold',
        highlight === undefined ? 'text-text-primary' : highlight ? 'text-success' : 'text-danger',
        negative ? 'text-text-secondary' : '',
      ].filter(Boolean).join(' ')}
      >
        {negative ? `-${value}` : value}
      </p>
    </div>
  );
}
