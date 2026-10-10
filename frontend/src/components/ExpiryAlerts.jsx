import { useEffect, useState } from 'react';
import { api, json } from '../api';
import { stores } from '../config';
import { useResource } from '../hooks/useResource';
import { useToast } from './Toast';
import { ErrorMessage } from './UI';

export default function ExpiryAlerts() {
  const { data, loading, error, reload } = useResource(() => api('/ai/expiry-alerts'), null);
  const [dismissing, setDismissing] = useState(null);
  const toast = useToast();
  const alerts = data?.alerts || [];
  const pending = alerts.some(alert => ['PENDING', 'GENERATING'].includes(alert.recommendationStatus));
  useEffect(() => {
    const timer = setInterval(reload, pending ? 5_000 : 60_000);
    const focus = () => { if (!document.hidden) reload(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [pending, reload]);
  async function dismiss(id) {
    setDismissing(id);
    try { await api(`/ai/expiry-alerts/${id}/dismiss`, json('PATCH', {})); await reload(); toast('Expiry alert dismissed'); }
    catch (failure) { toast(failure.message, { tone: 'error' }); }
    finally { setDismissing(null); }
  }
  return <section className="panel card section-spaced" aria-labelledby="expiry-warnings-heading">
    <h2 id="expiry-warnings-heading">Expiry warnings · next 2 days</h2>
    <p className="muted">Dates use UTC calendar days. Purchase suggestions are advisory; no stock is changed.</p>
    <ErrorMessage message={error} />
    {loading && !data && <p role="status">Checking expiry dates...</p>}
    {data && !alerts.length && <p>No active expiry warnings.</p>}
    <div className="expiry-list">{alerts.map(alert => {
      const recommendation = alert.recommendation;
      const basis = recommendation?.salesBasis;
      const generating = ['PENDING', 'GENERATING'].includes(alert.recommendationStatus);
      return <article className="section-spaced" key={alert._id} aria-label={`Expiry warning for ${alert.productName}`}>
        <h3>{alert.productName} <span className="badge warn">{alert.daysRemaining === 0 ? 'Expires today' : `Expires in ${alert.daysRemaining} day${alert.daysRemaining === 1 ? '' : 's'}`}</span></h3>
        <p>{stores[alert.shopType].label} · Expiry: {alert.expiryDay} · Current stock: {alert.currentStock}</p>
        <p><strong>Suggested next purchase: {recommendation?.suggestedPurchaseQuantity == null ? generating ? 'Pending' : 'Not enough data' : `${recommendation.suggestedPurchaseQuantity} units`}</strong></p>
        {generating && <p role="status">Preparing sales-based recommendation...</p>}
        {recommendation && <><p>{basis.unitsSold} units recorded over {basis.observationDays} calendar day(s), across {basis.saleDays} sale day(s). Estimate covers seven days after expiry.</p>
          <p className="muted">{basis.confidence === 'MODERATE' ? 'Moderate evidence' : basis.confidence === 'LIMITED' ? 'Limited confidence' : 'No sales history'} · Review recorded demand and replacement shelf life before buying.</p>
          <details><summary>Sales basis and limitations</summary><p>{recommendation.explanation}</p>
            <p>{basis.limitation}</p>
            <p className="muted">Analysis: {new Date(recommendation.generatedAt).toLocaleString('en-IN')} · Stock at analysis: {basis.currentStockAtAnalysis} · Estimated unsold at expiry: {basis.estimatedUnsoldAtExpiry} units. The estimate is a snapshot; review later sales and stock before buying.</p></details></>}
        {alert.recommendationStatus === 'UNAVAILABLE' && <p>Gemini explanation is temporarily unavailable. {recommendation ? 'The application sales estimate is shown.' : 'The expiry warning remains active; a recommendation will be retried.'}</p>}
        {recommendation?.source === 'GEMINI' && <p className="muted">Gemini-assisted explanation · quantity calculated from recorded sales.</p>}
        <button className="btn secondary" aria-label={`Dismiss warning for ${alert.productName}`} disabled={dismissing === alert._id} onClick={() => dismiss(alert._id)}>Dismiss warning</button>
      </article>;
    })}</div>
  </section>;
}
