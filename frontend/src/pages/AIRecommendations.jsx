import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usesExpiry } from '../config';
import { useSession } from '../session';
import { useToast } from '../components/Toast';
import { PageHeading, ResourceState, SummaryCards } from '../components/UI';
import Icon from '../components/Icon';
import ExpiryAlerts from '../components/ExpiryAlerts';
import { useSubmission } from '../hooks/useSubmission';
import { providerMessage, emptyRecommendationMessage, summarizeRecommendations } from '../utils/recommendationMessages';

export default function AIRecommendations() {
  const { shopType } = useSession();
  const [result, setResult] = useState(null);
  const { saving: loading, begin, end } = useSubmission();
  const [failure, setFailure] = useState(null);
  const toast = useToast();
  async function generate() {
    if (!begin()) return; setFailure(null);
    try { setResult(await api('/ai/reorder-suggestions')); toast('Recommendations refreshed'); }
    catch (error) { setFailure({ message: error.message, status: error.status }); toast(error.message, { tone: 'error' }); }
    finally { end(); }
  }
  const status = loading ? 'Analyzing real inventory and sales data...' : failure
    ? failure.status === 429 ? 'Recommendation requests are rate limited. Please wait before retrying.' : 'Recommendations could not be refreshed.'
    : result?.source === 'GEMINI' ? 'Generated with Gemini using your inventory and sales data.'
      : result?.source === 'RULE_BASED' ? (result.suggestions.length ? 'Gemini is unavailable, so safe rule-based recommendations are shown.' : 'Gemini is unavailable. The existing stock rules returned no reorder suggestions.')
        : result ? 'Add products and sales data to generate recommendations.' : 'Ready to analyze your inventory.';
  const rows = result?.suggestions || [];
  const totals = summarizeRecommendations(rows);
  const ready = result && !loading && !failure;
  const sourceLabel = result?.source === 'GEMINI' ? 'Gemini' : result?.source === 'RULE_BASED' ? 'Rule-based fallback' : 'No inventory data';
  const number = value => value == null ? 'Not provided' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
  return <div className="recommendations-page">
    <PageHeading title="AI Reorder Recommendations" description="Turn your recorded demand into informed replenishment decisions.">
      <div className="ai-actions"><button className="btn secondary" onClick={generate} disabled={loading}>Refresh</button>
        <button className="btn primary" onClick={generate} disabled={loading}><Icon name="ai-recommendations" />{loading ? 'Analyzing...' : 'Generate AI Recommendations'}</button></div>
    </PageHeading>
    <section className={'ai-summary card' + (failure ? ' ai-summary-error' : '')} aria-live="polite" aria-busy={loading}>
      <div><span className="ai-status-label">{loading ? 'Analysis in progress' : failure ? 'Analysis unavailable' : result ? sourceLabel : 'Inventory intelligence'}</span><strong>{status}</strong>
        {result?.generatedAt && <span className="analysis-timestamp">{failure || loading ? 'Previous analysis: ' : 'Last generated: '}{new Date(result.generatedAt).toLocaleString('en-IN')}</span>}
      </div><span className="ai-status-icon"><Icon name={failure ? 'warning' : 'ai-recommendations'} /></span>
    </section>
    <SummaryCards className="page-summary supplier-summary" items={[
      ['Returned suggestions', ready ? totals.returned : null],
      ['Actionable suggestions', ready ? totals.actionable : null],
      ['Purchase units suggested', ready ? totals.units : null],
    ]} />
    <section className="panel card recommendation-panel" aria-labelledby="reorder-suggestions-heading">
      <div className="panel-heading"><h2 id="reorder-suggestions-heading">Reorder suggestions</h2>{ready && <span className="badge ok">{sourceLabel}</span>}</div>
      <p className="panel-description">Guidance is based on recent 30-day sales and stock levels. Quantities are advisory; review stock before purchasing.</p>
      {ready && result.source === 'RULE_BASED' && <p className="fallback-note" role="status"><Icon name="warning" /><span>{providerMessage(result)} {rows.length ? 'Review these stock-rule suggestions against current demand before purchasing.' : 'No actionable stock-rule suggestions are available for this analysis.'}</span></p>}
      {ready && result.analysis && <p className="chart-note">Analyzed {result.analysis.totalProducts} products in the active store: {result.analysis.eligibleProducts} eligible under stock rules, {result.analysis.expiredProducts} expired, and {result.analysis.productsWithoutRecentSales} without recent recorded sales.</p>}
      <ResourceState loading={loading} error={failure?.message} onRetry={generate} empty={!rows.length}
        emptyMessage={emptyRecommendationMessage(result)}>
        <div className="recommendation-grid">{rows.map((row, index) => {
          const actionable = row.suggestedReorderQuantity > 0;
          const badge = row.urgency === 'CRITICAL' ? 'out' : ['HIGH', 'MEDIUM'].includes(row.urgency) ? 'warn' : 'ok';
          return <article className={'recommendation-card' + (row.urgency === 'CRITICAL' ? ' is-critical' : '')} key={row.productId || row.productName + '-' + index} aria-label={'Recommendation for ' + row.productName}>
            <div className="recommendation-heading"><h3>{row.productName}</h3><span className={'badge ' + badge}>{row.urgency || (actionable ? 'Review stock' : 'Informational')}</span></div>
            <p className="recommendation-kind">{actionable ? 'Replenishment to review' : 'Informational recommendation'}</p>
            <div className="purchase-estimate"><span>Suggested purchase</span><strong>{number(row.suggestedReorderQuantity)} <small>units</small></strong></div>
            <dl className="recommendation-metrics"><div><dt>Current stock</dt><dd>{number(row.currentStock)}</dd></div><div><dt>Average daily sales</dt><dd>{number(row.averageDailySales)}</dd></div></dl>
            {row.averageDailySales === 0 && <p className="demand-note">No daily demand recorded in the analysis window. Any purchase quantity shown follows the returned stock guidance.</p>}
            {row.demandObservation && <p className="demand-note">{row.demandObservation}</p>}
            <div className="recommendation-reason"><h4>Why this is suggested</h4><p>{row.reason}</p></div>
            <div className="priority-links"><Link className="text-link" to="/products">Review products</Link><Link className="text-link" to="/inventory">Manage stock</Link></div>
          </article>;
        })}</div>
      </ResourceState>
      <p className="chart-note">Generating or reviewing recommendations does not place orders or change inventory. Missing stock or demand fields are marked as not provided.</p>
    </section>
    {usesExpiry(shopType) && <><div className="expiry-guidance-intro"><h2>Plan replacements before expiry</h2><p>These existing warnings use a separate seven-day replacement estimate. Products without sufficient recorded sales retain their current no-sales state.</p></div><ExpiryAlerts /></>}
  </div>;
}
