
(function(){
  'use strict';

  var API_BASE = window.SAIJEEVANSEVA_API_BASE || '';

  var PURPOSE_LABEL_FALLBACK = {
    general_fund: 'General Fund',
    orphan_care: 'Orphan Care',
    medical_aid: 'Medical Aid',
    where_needed_most: 'Where Needed Most'
  };
  var PRESETS = [100, 250, 500, 1000, 2500, 5000];

  var cfg = null;
  var selectedAmount = null;
  var formView = document.getElementById('formView');
  var resultView = document.getElementById('resultView');

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function buildAmountGrid(){
    var grid = document.getElementById('amountGrid');
    grid.innerHTML = PRESETS.map(function(amt, i){
      var id = 'amt_' + amt;
      return '<div class="amount-chip">' +
        '<input type="radio" name="amountPreset" id="' + id + '" value="' + amt + '"' + (i === 2 ? ' checked' : '') + ' />' +
        '<label for="' + id + '">₹' + amt.toLocaleString('en-IN') + '</label></div>';
    }).join('');
    grid.querySelectorAll('input[name="amountPreset"]').forEach(function(input){
      input.addEventListener('change', function(){
        document.getElementById('customAmount').value = '';
        selectedAmount = parseInt(input.value, 10);
      });
    });
    selectedAmount = PRESETS[2];
  }

  document.getElementById('customAmount').addEventListener('input', function(e){
    var v = e.target.value;
    if (v) {
      document.querySelectorAll('input[name="amountPreset"]').forEach(function(r){ r.checked = false; });
      selectedAmount = parseInt(v, 10) || null;
    } else {
      selectedAmount = null;
    }
  });

  function buildPurposeGrid(purposes, defaultId){
    var grid = document.getElementById('purposeGrid');
    grid.innerHTML = purposes.map(function(p, i){
      var id = 'purpose_' + p.id;
      var checked = p.id === defaultId ? ' checked' : (!defaultId && i === 0 ? ' checked' : '');
      return '<div class="purpose-chip">' +
        '<input type="radio" name="purpose" id="' + id + '" value="' + p.id + '"' + checked + ' />' +
        '<label for="' + id + '">' + escapeHtml(p.label) + '</label></div>';
    }).join('');
  }

  function selectedPurpose(){
    var el = document.querySelector('input[name="purpose"]:checked');
    return el ? el.value : null;
  }

  function setFieldError(fieldId, message){
    var field = document.getElementById(fieldId);
    var err = field.querySelector('.err');
    if (message) {
      field.classList.add('invalid');
      err.textContent = message;
    } else {
      field.classList.remove('invalid');
      err.textContent = '';
    }
  }

  function clearFieldErrors(){
    ['fieldName','fieldEmail','fieldPhone'].forEach(function(id){ setFieldError(id, ''); });
  }

  async function loadConfig(){
    try {
      var res = await fetch(API_BASE + '/api/donations/config');
      cfg = await res.json();
      buildPurposeGrid(cfg.purposes && cfg.purposes.length ? cfg.purposes : Object.keys(PURPOSE_LABEL_FALLBACK).map(function(id){ return {id:id, label: PURPOSE_LABEL_FALLBACK[id]}; }), cfg.defaultPurposeId);
      document.getElementById('amountHint').textContent =
        'Amount must be between ₹' + cfg.minAmountInr + ' and ₹' + cfg.maxAmountInr.toLocaleString('en-IN') + '.';
    } catch (e) {
      buildPurposeGrid(Object.keys(PURPOSE_LABEL_FALLBACK).map(function(id){ return {id:id, label: PURPOSE_LABEL_FALLBACK[id]}; }), 'where_needed_most');
      document.getElementById('amountHint').textContent = 'Enter the amount you would like to donate.';
    }
  }

  function validateForm(){
    clearFieldErrors();
    var ok = true;
    var name = document.getElementById('donorName').value.trim();
    var email = document.getElementById('donorEmail').value.trim();
    var phone = document.getElementById('donorPhone').value.trim();

    if (name.length < 2) { setFieldError('fieldName', 'Please enter your full name.'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('fieldEmail', 'Please enter a valid email address.'); ok = false; }
    if (!/^(\+?91[-\s]?)?[6-9]\d{9}$/.test(phone)) { setFieldError('fieldPhone', 'Please enter a valid 10-digit Indian mobile number.'); ok = false; }

    var min = cfg ? cfg.minAmountInr : 10;
    var max = cfg ? cfg.maxAmountInr : 500000;
    var statusEl = document.getElementById('formStatus');
    statusEl.textContent = '';

    if (!selectedAmount || !Number.isInteger(selectedAmount) || selectedAmount < min || selectedAmount > max) {
      statusEl.textContent = 'Please choose an amount between ₹' + min + ' and ₹' + max.toLocaleString('en-IN') + '.';
      ok = false;
    }
    if (!selectedPurpose()) {
      statusEl.textContent = statusEl.textContent || 'Please choose where your donation should go.';
      ok = false;
    }
    return ok ? { name: name, email: email, phone: phone, amount: selectedAmount, purpose: selectedPurpose() } : null;
  }

  function setSubmitting(isSubmitting, label){
    var btn = document.getElementById('submitBtn');
    btn.disabled = isSubmitting;
    document.getElementById('submitLabel').textContent = label || (isSubmitting ? 'Please wait…' : 'Continue to secure payment');
  }

  function showResult(kind, opts){
    formView.style.display = 'none';
    resultView.style.display = 'block';
    var icon = document.getElementById('resultIcon');
    var title = document.getElementById('resultTitle');
    var desc = document.getElementById('resultDesc');
    var actions = document.getElementById('resultActions');
    icon.className = 'result-icon ' + kind;
    actions.innerHTML = '';

    if (kind === 'paid') {
      icon.textContent = '✓';
      title.textContent = 'Thank You for Making a Difference';
      desc.textContent = 'Your contribution to Sai Jeevan Seva has been received successfully.';
      fillReceipt(opts);
      actions.innerHTML = '<a href="index.html" class="btn-secondary">Return to homepage</a>';
    } else if (kind === 'pending') {
      icon.textContent = '⏳';
      title.textContent = 'Confirming your donation';
      desc.textContent = 'We are securely verifying your payment. Please do not make another payment yet - this page will update automatically.';
      fillReceipt(opts);
      actions.innerHTML = '<a href="index.html" class="btn-secondary">Return to homepage</a>';
      if (opts && opts.ref) pollStatus(opts.ref);
    } else {
      icon.textContent = '✕';
      title.textContent = 'Payment could not be completed';
      desc.textContent = 'No confirmed donation has been recorded. If any amount was deducted, it will be automatically reversed by your bank or Razorpay within a few business days.';
      actions.innerHTML = '<button class="btn-primary" id="retryBtn" type="button">Try again</button><a href="index.html" class="btn-secondary">Return to homepage</a>';
      var retryBtn = document.getElementById('retryBtn');
      if (retryBtn) retryBtn.addEventListener('click', resetToForm);
    }
  }

  function fillReceipt(opts){
    if (!opts) return;
    document.getElementById('receiptTable').style.display = '';
    document.getElementById('rRef').textContent = opts.ref || '-';
    document.getElementById('rAmount').textContent = opts.amount != null ? ('₹' + (opts.amount / 100).toLocaleString('en-IN')) : '-';
    document.getElementById('rDate').textContent = opts.date ? new Date(opts.date).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
    document.getElementById('rPurpose').textContent = opts.purpose ? (PURPOSE_LABEL_FALLBACK[opts.purpose] || opts.purpose) : '-';
    document.getElementById('rReceipt').textContent = opts.receiptStatus === 'available' ? 'Available' : 'Pending';
  }

  function resetToForm(){
    resultView.style.display = 'none';
    formView.style.display = 'block';
    setSubmitting(false);
  }

  var pollTimer = null;
  function pollStatus(ref){
    var attempts = 0;
    clearInterval(pollTimer);
    pollTimer = setInterval(async function(){
      attempts += 1;
      try {
        var res = await fetch(API_BASE + '/api/donations/status/' + encodeURIComponent(ref));
        var data = await res.json();
        if (data.ok && data.status === 'paid') {
          clearInterval(pollTimer);
          showResult('paid', { ref: data.public_reference, amount: data.amount, purpose: data.purpose, receiptStatus: data.receipt_status, date: data.created_at });
        } else if (data.ok && data.status === 'failed') {
          clearInterval(pollTimer);
          showResult('failed');
        }
      } catch (e) { /* keep polling until timeout */ }
      if (attempts >= 20) clearInterval(pollTimer); // ~2 minutes at 6s interval
    }, 6000);
  }

  async function handleSubmit(ev){
    ev.preventDefault();
    var values = validateForm();
    if (!values) return;

    setSubmitting(true, 'Starting secure checkout…');
    document.getElementById('formStatus').textContent = '';

    try {
      var res = await fetch(API_BASE + '/api/donations/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_name: values.name,
          donor_email: values.email,
          donor_phone: values.phone,
          amount: values.amount,
          purpose: values.purpose
        })
      });
      var data = await res.json();

      if (!res.ok || !data.ok) {
        if (data && data.errors) {
          if (data.errors.donor_name) setFieldError('fieldName', data.errors.donor_name);
          if (data.errors.donor_email) setFieldError('fieldEmail', data.errors.donor_email);
          if (data.errors.donor_phone) setFieldError('fieldPhone', data.errors.donor_phone);
          document.getElementById('formStatus').textContent = data.errors.amount || data.errors.purpose || 'Please check the highlighted fields.';
        } else {
          document.getElementById('formStatus').textContent = (data && data.error) || 'Could not start your donation. Please try again.';
        }
        setSubmitting(false);
        return;
      }

      if (typeof Razorpay === 'undefined') {
        document.getElementById('formStatus').textContent = 'Payment gateway failed to load. Please check your connection and try again.';
        setSubmitting(false);
        return;
      }

      var rzp = new Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: 'Sai Jeevan Seva',
        description: 'Donation - ' + (PURPOSE_LABEL_FALLBACK[data.purpose] || data.purpose),
        prefill: data.prefill,
        theme: { color: '#2D416C' },
        handler: async function(response){
          setSubmitting(true, 'Verifying payment…');
          try {
            var vRes = await fetch(API_BASE + '/api/donations/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            var vData = await vRes.json();
            if (vRes.ok && vData.ok && vData.status === 'paid') {
              showResult('paid', { ref: vData.public_reference, amount: data.amount, purpose: data.purpose, receiptStatus: 'available' });
            } else if (vRes.ok && vData.ok && vData.status === 'pending') {
              showResult('pending', { ref: vData.public_reference, amount: data.amount, purpose: data.purpose });
            } else {
              showResult('failed');
            }
          } catch (e) {
            showResult('pending', { ref: data.public_reference, amount: data.amount, purpose: data.purpose });
          }
        },
        modal: {
          ondismiss: function(){
            setSubmitting(false);
            document.getElementById('formStatus').textContent = 'Checkout closed. No payment was made - you can try again anytime.';
          }
        }
      });

      rzp.on('payment.failed', function(){
        showResult('failed');
      });

      setSubmitting(false, 'Continue to secure payment');
      rzp.open();
    } catch (e) {
      document.getElementById('formStatus').textContent = 'Something went wrong. Please try again.';
      setSubmitting(false);
    }
  }

  document.getElementById('donateForm').addEventListener('submit', handleSubmit);

  buildAmountGrid();
  loadConfig();

  // If arriving back with a reference in the query string (e.g. a
  // reconciliation link), show its current status instead of the form.
  var params = new URLSearchParams(window.location.search);
  var refParam = params.get('ref');
  if (refParam) {
    fetch(API_BASE + '/api/donations/status/' + encodeURIComponent(refParam)).then(function(r){ return r.json(); }).then(function(d){
      if (d.ok) {
        if (d.status === 'paid') showResult('paid', { ref: d.public_reference, amount: d.amount, purpose: d.purpose, receiptStatus: d.receipt_status, date: d.created_at });
        else if (d.status === 'failed') showResult('failed');
        else showResult('pending', { ref: d.public_reference, amount: d.amount, purpose: d.purpose });
      }
    }).catch(function(){});
  }
})();
