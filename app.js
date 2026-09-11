const API = 'https://ingest.launchpad-studio.co.za';

let currentOrder = null;

const $ = (id) => document.getElementById(id);

function withSubmitGuard(form, handler) {
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const btn = form.querySelector('button');
    const originalText = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
      await handler(e);
    } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
}

withSubmitGuard($('lookup-form'), async () => {
  const username = $('tracking_username').value.trim();
  $('lookup-error').classList.add('hidden');

  try {
    const res = await fetch(`${API}/track/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error('Order not found — check your tracking username.');
    currentOrder = await res.json();
    renderOrder();
  } catch (err) {
    $('lookup-error').textContent = err.message;
    $('lookup-error').classList.remove('hidden');
  }
});

function renderOrder() {
  $('lookup-screen').classList.add('hidden');
  $('order-screen').classList.remove('hidden');
  $('order-company').textContent = currentOrder.company_name;
  $('order-status').textContent = currentOrder.status.replace('_', ' ');
  $('order-tier').textContent = currentOrder.package_tier;
  loadComments();
  loadInvoices();
}

withSubmitGuard($('pin-form'), async () => {
  const pin = $('pin-input').value.trim();
  $('pin-error').classList.add('hidden');

  try {
    const res = await fetch(`${API}/track/${currentOrder.tracking_username}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Incorrect PIN');

    $('preview-frame').src = `${API}${data.preview_url}`;
    $('pin-gate').classList.add('hidden');
    $('preview-frame-wrap').classList.remove('hidden');
  } catch (err) {
    $('pin-error').textContent = err.message;
    $('pin-error').classList.remove('hidden');
    $('pin-input').value = '';
  }
});

async function loadComments() {
  const res = await fetch(`${API}/track/${currentOrder.tracking_username}/comments`);
  const comments = await res.json();
  const list = $('comments-list');
  list.innerHTML = comments.map(c => `
    <div class="comment ${c.author_type}">
      <div class="meta">${c.author_type === 'admin' ? 'Launchpad' : (c.author_name || 'You')} · ${new Date(c.created_at * 1000).toLocaleString()}</div>
      <div>${escapeHtml(c.message)}</div>
    </div>
  `).join('') || '<p class="muted">No comments yet.</p>';
  list.scrollTop = list.scrollHeight;
}

withSubmitGuard($('comment-form'), async () => {
  const message = $('comment-input').value.trim();
  if (!message) return;

  await fetch(`${API}/track/${currentOrder.tracking_username}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  $('comment-input').value = '';
  loadComments();
});

async function loadInvoices() {
  const res = await fetch(`${API}/track/${currentOrder.tracking_username}/invoices`);
  const invoices = await res.json();
  const list = $('invoices-list');
  list.innerHTML = invoices.map(inv => `
    <div class="comment" style="display:flex; justify-content:space-between; align-items:center; border-left:3px solid var(--forest);">
      <div>
        <div class="meta">${inv.type === 'quote' ? 'Quote' : 'Invoice'} ${inv.number} · ${new Date(inv.issued_at*1000).toLocaleDateString()}</div>
        <div>R ${(inv.total/100).toFixed(2)} — <span style="text-transform:capitalize;">${inv.status}</span></div>
      </div>
      <button type="button" onclick="downloadInvoicePdf('${inv.id}')" style="flex-shrink:0;">Download</button>
    </div>
  `).join('') || '<p class="muted">No invoices or quotes yet.</p>';
  window._trackInvoices = invoices; // stash for the download function, avoids a refetch
}

function downloadInvoicePdf(id) {
  const inv = (window._trackInvoices || []).find(i => i.id === id);
  if (!inv) return;

  const rowsHtml = inv.line_items.map(li => `
    <tr>
      <td>${escapeHtml(li.desc)}</td>
      <td style="text-align:center">${li.qty}</td>
      <td style="text-align:right">R ${(li.unit_price/100).toFixed(2)}</td>
      <td style="text-align:right">R ${((li.qty*li.unit_price)/100).toFixed(2)}</td>
    </tr>
  `).join('');

  const win = window.open('', '_blank');
  win.document.write(`
    <html>
    <head>
      <title>${inv.number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1A1D29; }
        h1 { font-size: 1.4rem; margin-bottom: 4px; }
        .meta { color: #666; font-size: 0.85rem; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 0.9rem; }
        th { text-align: left; background: #F0EEE8; text-transform: uppercase; font-size: 0.7rem; }
        .totals { width: 260px; margin-left: auto; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.9rem; }
        .totals .grand { font-weight: bold; font-size: 1.1rem; border-top: 2px solid #1A1D29; margin-top: 6px; padding-top: 8px; }
        .ember { color: #E8542E; }
      </style>
    </head>
    <body>
      <h1>LAUNCHPAD<span class="ember">.</span> — ${inv.type.toUpperCase()}</h1>
      <div class="meta">
        ${inv.number} &middot; Issued ${new Date(inv.issued_at*1000).toLocaleDateString()}<br>
        ${escapeHtml(currentOrder.company_name)}
      </div>
      <table>
        <thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="totals">
        <div><span>Subtotal</span><span>R ${(inv.subtotal/100).toFixed(2)}</span></div>
        ${inv.vat ? `<div><span>VAT (15%)</span><span>R ${(inv.vat/100).toFixed(2)}</span></div>` : ''}
        <div class="grand"><span>Total</span><span>R ${(inv.total/100).toFixed(2)}</span></div>
      </div>
      ${inv.pay_to_details ? `
        <div style="margin-top:32px; padding-top:16px; border-top:1px solid #ddd;">
          <div style="font-size:0.7rem; text-transform:uppercase; color:#666; margin-bottom:6px; letter-spacing:0.05em;">Pay To</div>
          <div style="font-size:0.9rem; white-space:pre-wrap;">${escapeHtml(inv.pay_to_details)}</div>
        </div>
      ` : ''}
      <scr` + `ipt>window.onload = () => window.print();</scr` + `ipt>
    </body>
    </html>
  `);
  win.document.close();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
