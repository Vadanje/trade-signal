// ===== BUILD RESULTS =====
function buildResults(entry, sl, tp) {
  const slPips = Math.abs(entry - sl) / 0.0001;
  const tpPips = Math.abs(tp - entry) / 0.0001;
  const badgeClass = direction === 'buy' ? 'badge-buy' : 'badge-sell';
  const rr = (tpPips / slPips).toFixed(1);

  // Summary
  document.getElementById('signalSummary').innerHTML = `
    <div class="signal-summary">
      <span class="direction-badge ${badgeClass}">${direction.toUpperCase()}</span> GBPUSD · ${mode.toUpperCase()}
      <div class="summary-details">
        Entry <span>${formatPrice(entry)}</span>${mode === 'market' ? ' (ref)' : ''} · SL <span>${formatPrice(sl)}</span> · TP <span>${formatPrice(tp)}</span> · <span>${slPips.toFixed(1)}p → ${tpPips.toFixed(1)}p (1:${rr})</span>
      </div>
    </div>`;
  document.getElementById('signalSummary').classList.remove('hidden');
  document.getElementById('inputSection').classList.add('hidden');

  // Build sequence and cards
  copySequence = [];
  let html = '';

  ACCOUNTS.forEach((acc, ai) => {
    const lots = (acc.risk / (slPips * PIP_VALUE)).toFixed(2);
    html += `<div class="account-card" id="card-${ai}">`;
    html += `<h2>${acc.name}</h2>`;
    html += `<div class="risk-info">${acc.platform} · $${acc.risk} risk · ${acc.phase}</div>`;
    if (mode === 'market') {
      html += `<div class="ref-price">Ref price: ${formatPrice(entry)} — adjust lots if fill deviates</div>`;
    }

    const fields = [{ label: 'Lots', value: lots }];
    if (mode === 'limit') {
      fields.push({ label: 'Entry', value: formatPrice(entry) });
    }
    if (acc.format === 'pips') {
      fields.push({ label: 'SL (pips)', value: '-' + slPips.toFixed(1) });
      fields.push({ label: 'TP (pips)', value: tpPips.toFixed(1) });
    } else {
      fields.push({ label: 'SL Level', value: formatPrice(sl) });
      fields.push({ label: 'TP Level', value: formatPrice(tp) });
    }

    fields.forEach((f) => {
      const idx = copySequence.length;
      copySequence.push({ account: ai, value: f.value, label: f.label, accName: acc.name });
      html += `<div class="field-row" id="row-${idx}">
        <span class="field-label">${f.label}</span>
        <span class="field-value" id="val-${idx}" onclick="copyStep(${idx})">${f.value}</span>
      </div>`;
    });
    html += `</div>`;
  });

  document.getElementById('results').innerHTML = html;
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('shareSection').classList.remove('hidden');

  // Progress bar
  let progHtml = '';
  for (let i = 0; i < copySequence.length; i++) {
    progHtml += `<div class="progress-step" id="prog-${i}"></div>`;
  }
  document.getElementById('progressBar').innerHTML = progHtml;
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('stepCounter').classList.remove('hidden');

  currentStep = 0;
  highlightNext();

  // Store signal data for position tracking
  window._lastSignal = { entry, sl, tp, direction, mode, slPips, tpPips };
}

// ===== COPY FLOW =====
function highlightNext() {
  document.querySelectorAll('.field-value').forEach(el => el.classList.remove('next-field'));
  document.querySelectorAll('.field-row').forEach(el => el.classList.remove('field-done'));
  document.querySelectorAll('.account-card').forEach(el => {
    el.classList.remove('card-done', 'card-active', 'direction-buy', 'direction-sell');
  });
  document.querySelectorAll('.progress-step').forEach(el => el.classList.remove('active', 'done'));

  const dirClass = direction === 'buy' ? 'direction-buy' : 'direction-sell';

  for (let i = 0; i < currentStep; i++) {
    document.getElementById('row-' + i).classList.add('field-done');
    document.getElementById('prog-' + i).classList.add('done');
  }

  if (currentStep < copySequence.length) {
    const cur = copySequence[currentStep];
    for (let i = 0; i < cur.account; i++) {
      document.getElementById('card-' + i).classList.add('card-done');
    }
    document.getElementById('card-' + cur.account).classList.add('card-active', dirClass);
    document.getElementById('val-' + currentStep).classList.add('next-field');
    document.getElementById('prog-' + currentStep).classList.add('active');
    const fieldsInAccount = copySequence.filter(s => s.account === cur.account).length;
    const fieldIdx = copySequence.slice(0, currentStep).filter(s => s.account === cur.account).length + 1;
    document.getElementById('stepCounter').textContent =
      `${cur.label} · Field ${fieldIdx} of ${fieldsInAccount} · ${cur.accName}`;
  } else {
    ACCOUNTS.forEach((_, i) => document.getElementById('card-' + i).classList.add('card-done'));
    document.getElementById('stepCounter').textContent = '✓ All fields copied';
    showToast('✓ All accounts done', false);
    vibrate([50, 50, 50]);
  }
}

function copyStep(idx) {
  const val = copySequence[idx].value;
  navigator.clipboard.writeText(val);
  const el = document.getElementById('val-' + idx);
  el.classList.add('copied');
  setTimeout(() => el.classList.remove('copied'), 500);

  const prevAccount = currentStep < copySequence.length ? copySequence[currentStep].account : -1;
  if (idx >= currentStep) { currentStep = idx + 1; }
  highlightNext();

  const newAccount = currentStep < copySequence.length ? copySequence[currentStep].account : -1;
  if (newAccount !== prevAccount && prevAccount !== -1) {
    vibrate([50, 30, 50]);
    if (newAccount >= 0) {
      setTimeout(() => {
        document.getElementById('card-' + newAccount).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  } else {
    vibrate([50]);
  }
  showToast('Copied: ' + val, false);
}

function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

// ===== POSITION TRACKING =====
function markPositionOpen() {
  if (!window._lastSignal) return;
  const sig = window._lastSignal;
  const now = Date.now();
  const signalId = now.toString();
  // Store as a single signal with all accounts
  openPositions.push({
    id: signalId,
    direction: sig.direction,
    entry: sig.entry,
    sl: sig.sl,
    tp: sig.tp,
    mode: sig.mode,
    openedAt: now,
    accounts: ACCOUNTS.map(acc => ({ name: acc.name, newsRule: acc.newsRule, phase: acc.phase }))
  });
  localStorage.setItem('openPositions', JSON.stringify(openPositions));
  renderPositionTracker();
  showToast('Position open — all accounts', false);
}

function closePosition(id) {
  openPositions = openPositions.filter(p => p.id !== id);
  localStorage.setItem('openPositions', JSON.stringify(openPositions));
  renderPositionTracker();
  showToast('Position closed — all accounts', false);
}

function renderPositionTracker() {
  const container = document.getElementById('positionTracker');
  if (openPositions.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  let html = `<h3><span class="pulse"></span> Open Positions (${openPositions.length})</h3>`;
  openPositions.forEach(p => {
    const badge = p.direction === 'buy' ? 'badge-buy' : 'badge-sell';
    const elapsed = timeSince(p.openedAt);
    const accNames = p.accounts.map(a => a.name).join(', ');
    html += `<div class="position-account">
      <div class="acc-name"><span class="direction-badge ${badge}">${p.direction.toUpperCase()}</span> GBPUSD · ${p.mode.toUpperCase()}</div>
      <div class="acc-detail">SL: ${formatPrice(p.sl)} · TP: ${formatPrice(p.tp)} · Open ${elapsed}</div>
      <div class="acc-detail">${accNames}</div>
      <button class="close-position-btn" onclick="closePosition('${p.id}')">✕ Close All Accounts</button>
    </div>`;
  });
  container.innerHTML = html;
}

function timeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  return hrs + 'h ' + (mins % 60) + 'm ago';
}

// ===== NEWS EVENTS =====
function fetchNewsEvents() {
  // Refresh every 4 hours
  if (Date.now() - newsLastFetch < 4 * 3600000 && newsEvents.length > 0) {
    renderNews();
    return;
  }
  fetch(FF_CALENDAR_URL)
    .then(r => r.json())
    .then(data => {
      newsEvents = data.filter(e => e.impact === 'High' && (e.country === 'GBP' || e.country === 'USD'));
      localStorage.setItem('newsEvents', JSON.stringify(newsEvents));
      localStorage.setItem('newsLastFetch', Date.now().toString());
      newsLastFetch = Date.now();
      renderNews();
    })
    .catch(() => { renderNews(); });
}

function renderNews() {
  const container = document.getElementById('newsContent');
  if (newsEvents.length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:0.8rem;">No high-impact GBP/USD events this week</p>';
    return;
  }
  const now = Date.now();
  let html = '';
  newsEvents.forEach(e => {
    const eventTime = new Date(e.date).getTime();
    const passed = eventTime < now;
    const countryClass = e.country === 'GBP' ? 'news-country-gbp' : 'news-country-usd';
    const timeStr = new Date(e.date).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    html += `<div class="news-event ${passed ? 'news-passed' : ''}">
      <span class="news-time">${timeStr}</span>
      <span class="news-title">${e.title}</span>
      <span class="news-country ${countryClass}">${e.country}</span>
    </div>`;
  });
  container.innerHTML = html;
}

function toggleNews() {
  const content = document.getElementById('newsContent');
  const toggle = document.getElementById('newsToggle');
  content.classList.toggle('hidden');
  toggle.textContent = content.classList.contains('hidden') ? '▼' : '▲';
}

// ===== ALERT SYSTEM =====
function startAlertLoop() {
  checkAlerts();
  alertInterval = setInterval(checkAlerts, 10000); // every 10s
  // Also refresh position tracker every minute
  setInterval(renderPositionTracker, 60000);
}

function checkAlerts() {
  if (openPositions.length === 0) {
    document.getElementById('alertBanner').classList.add('hidden');
    return;
  }

  const now = new Date();
  const alerts = [];

  // Check news events
  newsEvents.forEach(e => {
    const eventTime = new Date(e.date).getTime();
    const minsUntil = (eventTime - now.getTime()) / 60000;
    if (minsUntil > 0 && minsUntil <= NEWS_GRACE_PERIOD) {
      // Which accounts are affected across all open positions?
      const affected = [];
      openPositions.forEach(p => {
        p.accounts.forEach(acc => {
          if (acc.newsRule === '5ers' || acc.newsRule === 'ftmo') {
            affected.push(acc.name);
          }
        });
      });
      if (affected.length > 0) {
        alerts.push({
          type: minsUntil <= 3 ? 'critical' : 'warning',
          title: `⚠️ ${e.title} (${e.country}) in ${Math.ceil(minsUntil)}m`,
          detail: `Close affected positions before news event`,
          accounts: affected,
          minsUntil: minsUntil
        });
      }
    }
  });

  // Check Friday market close (17:00 UTC NY close)
  const day = now.getUTCDay();
  if (day === 5) { // Friday
    const closeTime = new Date(now);
    closeTime.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 17:00 ET
    const minsUntilClose = (closeTime.getTime() - now.getTime()) / 60000;
    if (minsUntilClose > 0 && minsUntilClose <= WEEKEND_WARN) {
      const allAccounts = [];
      openPositions.forEach(p => p.accounts.forEach(a => allAccounts.push(a.name)));
      alerts.push({
        type: minsUntilClose <= MARKET_CLOSE_WARN ? 'critical' : 'warning',
        title: `🕐 Market close in ${Math.ceil(minsUntilClose)}m — CLOSE ALL`,
        detail: 'No weekend holding. Close all positions before market close.',
        accounts: allAccounts,
        minsUntil: minsUntilClose
      });
    }
  }

  // Check daily overnight (after 20:00 UTC for spread widening)
  const hour = now.getUTCHours();
  if (hour >= 19 && day >= 1 && day <= 4) {
    const minsUntilSessionEnd = (20 - hour) * 60 + (60 - now.getUTCMinutes());
    if (minsUntilSessionEnd <= 60 && minsUntilSessionEnd > 0) {
      const allAccounts = [];
      openPositions.forEach(p => p.accounts.forEach(a => allAccounts.push(a.name)));
      alerts.push({
        type: 'warning',
        title: `🌙 Session ending — spreads widening soon`,
        detail: 'Consider closing positions before overnight hold.',
        accounts: allAccounts,
        minsUntil: minsUntilSessionEnd
      });
    }
  }

  // Render alerts
  const banner = document.getElementById('alertBanner');
  if (alerts.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  // Show most urgent alert
  const urgent = alerts.sort((a, b) => a.minsUntil - b.minsUntil)[0];
  const isWarning = urgent.type === 'warning';
  banner.className = 'alert-banner' + (isWarning ? ' warning' : '');
  const mins = Math.floor(urgent.minsUntil);
  const secs = Math.floor((urgent.minsUntil - mins) * 60);
  banner.innerHTML = `
    <h4>${urgent.title}</h4>
    <p>${urgent.detail}</p>
    <div class="countdown">${mins}:${secs.toString().padStart(2, '0')}</div>
    <div class="affected-accounts">Affected: ${[...new Set(urgent.accounts)].join(', ')}</div>`;
  banner.classList.remove('hidden');
}
