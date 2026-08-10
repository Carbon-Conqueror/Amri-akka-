
(function(){
  'use strict';
  var csrfToken = null;
  var offset = 0;
  var limit = 25;
  var lastTotal = 0;

  var loginView = document.getElementById('loginView');
  var dashView = document.getElementById('dashView');

  function fmtAmount(paise, currency){
    return (currency || 'INR') + ' ' + (paise / 100).toLocaleString('en-IN', {minimumFractionDigits: 2});
  }
  function fmtDate(iso){
    try { return new Date(iso).toLocaleString('en-IN'); } catch(e){ return iso; }
  }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  async function api(path, opts){
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
    if (csrfToken && opts.method && opts.method !== 'GET') {
      opts.headers['X-CSRF-Token'] = csrfToken;
    }
    var res = await fetch('/api/admin' + path, opts);
    var data = await res.json().catch(function(){ return {}; });
    if (!res.ok) {
      var err = new Error(data.error || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showDashboard(){
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');
    loadSummary();
    loadDonations();
  }
  function showLogin(){
    dashView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function checkSession(){
    try {
      var data = await api('/session');
      csrfToken = data.csrfToken;
      showDashboard();
    } catch (e) {
      showLogin();
    }
  }

  document.getElementById('loginForm').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    try {
      var data = await api('/login', {method:'POST', body: JSON.stringify({email:email, password:password})});
      csrfToken = data.csrfToken;
      showDashboard();
    } catch (e) {
      errEl.textContent = e.message || 'Sign in failed.';
      errEl.style.display = 'block';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async function(){
    try { await api('/logout', {method:'POST'}); } catch(e) {}
    csrfToken = null;
    showLogin();
  });

  async function loadSummary(){
    try {
      var data = await api('/summary');
      var byStatus = {};
      (data.byStatus || []).forEach(function(r){ byStatus[r.payment_status] = r; });
      var paid = byStatus.paid || {count:0,total_amount:0};
      var pending = byStatus.pending || {count:0,total_amount:0};
      var failed = byStatus.failed || {count:0,total_amount:0};
      var refunded = byStatus.refunded || {count:0,total_amount:0};

      var cards = [
        {label:'Verified / Paid', value: paid.count, sub: fmtAmount(paid.total_amount, 'INR')},
        {label:'Pending', value: pending.count, sub: fmtAmount(pending.total_amount, 'INR')},
        {label:'Failed', value: failed.count, sub: fmtAmount(failed.total_amount, 'INR')},
        {label:'Refunded', value: refunded.count, sub: fmtAmount(refunded.total_amount, 'INR')}
      ];
      document.getElementById('summaryCards').innerHTML = cards.map(function(c){
        return '<div class="card"><div class="label">'+escapeHtml(c.label)+'</div><div class="value">'+c.value+'</div><div class="sub">'+escapeHtml(c.sub)+'</div></div>';
      }).join('');
    } catch (e) {
      if (e.status === 401) return showLogin();
    }
  }

  async function loadDonations(){
    var errEl = document.getElementById('err');
    errEl.textContent = '';
    var status = document.getElementById('fStatus').value;
    var purpose = document.getElementById('fPurpose').value;
    var search = document.getElementById('fSearch').value.trim();

    var qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (purpose) qs.set('purpose', purpose);
    if (search) qs.set('search', search);
    qs.set('limit', limit);
    qs.set('offset', offset);

    try {
      var data = await api('/donations?' + qs.toString());
      lastTotal = data.total;
      var rows = data.donations || [];
      document.getElementById('rows').innerHTML = rows.map(function(d){
        return '<tr>' +
          '<td>'+escapeHtml(d.public_reference)+'</td>' +
          '<td>'+escapeHtml(d.donor_name)+'<br><span class="muted">'+escapeHtml(d.donor_email)+'</span></td>' +
          '<td>'+fmtAmount(d.amount, d.currency)+'</td>' +
          '<td>'+escapeHtml(d.purpose)+'</td>' +
          '<td><span class="status-pill status-'+escapeHtml(d.payment_status)+'">'+escapeHtml(d.payment_status)+'</span></td>' +
          '<td>'+escapeHtml(d.receipt_status)+'</td>' +
          '<td>'+fmtDate(d.created_at)+'</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7" class="muted">No donations match these filters.</td></tr>';

      document.getElementById('pageInfo').textContent =
        (lastTotal === 0 ? '0' : (offset + 1)) + '-' + Math.min(offset + limit, lastTotal) + ' of ' + lastTotal;
      document.getElementById('prevPage').disabled = offset === 0;
      document.getElementById('nextPage').disabled = offset + limit >= lastTotal;
    } catch (e) {
      if (e.status === 401) return showLogin();
      errEl.textContent = e.message || 'Failed to load donations.';
    }
  }

  document.getElementById('applyFilters').addEventListener('click', function(){
    offset = 0;
    loadDonations();
  });
  document.getElementById('prevPage').addEventListener('click', function(){
    offset = Math.max(0, offset - limit);
    loadDonations();
  });
  document.getElementById('nextPage').addEventListener('click', function(){
    offset = offset + limit;
    loadDonations();
  });

  checkSession();
})();
