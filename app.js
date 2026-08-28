const API = 'https://ingest.launchpad-studio.co.za';

let currentOrder = null;

const $ = (id) => document.getElementById(id);

$('lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
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
}

$('pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
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

    $('preview-frame').srcdoc = data.html;
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

$('comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
