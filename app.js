// ===== CONFIGURATION =====
const ACCOUNTS = [
  { name: 'FTMO 150K', risk: 875, platform: 'cTrader', format: 'pips', phase: 'funded', newsRule: 'ftmo' },
  { name: 'FTMO 100K P1', risk: 1000, platform: 'cTrader', format: 'pips', phase: 'evaluation', newsRule: 'none' },
  { name: '5ers 100K', risk: 700, platform: 'cTrader', format: 'pips', phase: 'funded', newsRule: '5ers' },
  { name: 'QuantTekkel P2', risk: 1000, platform: 'MT5', format: 'levels', phase: 'evaluation', newsRule: 'none' }
];
const PIP_VALUE = 10;
const RR = 2.5;
const MIN_PRICE = 1.00000;
const MAX_PRICE = 1.42000;
const MIN_SL_PIPS = 7;
const MAX_SL_PIPS = 40;
// Grace periods in minutes
const NEWS_GRACE_PERIOD = 10; // alert this many mins before event
const MARKET_CLOSE_WARN = 30; // warn 30 mins before Friday close
const WEEKEND_WARN = 60; // warn 60 mins before Friday close for weekend
const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// ===== STATE =====
let direction = null;
let mode = 'limit'; // 'limit' or 'market'
let copySequence = [];
let currentStep = 0;
let calculated = false;
let openPositions = JSON.parse(localStorage.getItem('openPositions') || '[]');
let newsEvents = JSON.parse(localStorage.getItem('newsEvents') || '[]');
let newsLastFetch = parseInt(localStorage.getItem('newsLastFetch') || '0');
let alertInterval = null;

// ===== INITIALIZATION =====
function init() {
  renderPositionTracker();
  fetchNewsEvents();
  startAlertLoop();
  // Load from URL params
  const params = new URLSearchParams(location.search);
  if (params.get('e') && params.get('sl') && params.get('d')) {
    document.getElementById('entry').value = params.get('e');
    document.getElementById('sl').value = params.get('sl');
    if (params.get('tp')) document.getElementById('tp').value = params.get('tp');
    setDirection(params.get('d'));
    if (params.get('m')) setMode(params.get('m'));
    calculated = true;
    calculate();
  }
}

// ===== MODE =====
function setMode(m) {
  mode = m;
  document.getElementById('modeLimit').className = 'mode-btn' + (m === 'limit' ? ' mode-active' : '');
  document.getElementById('modeMarket').className = 'mode-btn' + (m === 'market' ? ' mode-active' : '');
  document.getElementById('limitFields').classList.toggle('hidden', m === 'market');
  document.getElementById('marketFields').classList.toggle('hidden', m === 'limit');
  // In market mode, show TP field; in limit mode hide it (calculated from RR)
  document.getElementById('tpField').classList.toggle('hidden', m === 'limit');
}

// ===== DIRECTION =====
function setDirection(d) {
  direction = d;
  document.getElementById('btnBuy').className = d === 'buy' ? 'active-buy' : '';
  document.getElementById('btnSell').className = d === 'sell' ? 'active-sell' : '';
  clearError();
  triggerFlash(d);
}

function triggerFlash(d) {
  const el = document.getElementById('flashOverlay');
  el.className = 'flash-overlay';
  void el.offsetWidth;
  el.classList.add(d === 'buy' ? 'flash-buy' : 'flash-sell');
  setTimeout(() => { el.className = 'flash-overlay'; }, 300);
}

// ===== VALIDATION =====
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('show');
  showToast(msg, true);
}

function clearError() {
  document.getElementById('errorMsg').classList.remove('show');
  document.querySelectorAll('input').forEach(i => i.classList.remove('input-error'));
}

function formatPrice(val) { return parseFloat(val).toFixed(5); }

function validate(entry, sl, tp) {
  clearError();
  if (!direction) { showError('Select BUY or SELL'); return false; }
  if (mode === 'limit') {
    if (!entry || isNaN(entry)) {
      document.getElementById('entry').classList.add('input-error');
      showError('Enter a valid entry price'); return false;
    }
    if (entry < MIN_PRICE || entry > MAX_PRICE) {
      document.getElementById('entry').classList.add('input-error');
      showError('Entry out of range'); return false;
    }
  }
  if (mode === 'market') {
    if (!entry || isNaN(entry)) {
      document.getElementById('marketEntry').classList.add('input-error');
      showError('Enter current market price'); return false;
    }
  }
  if (!sl || isNaN(sl)) {
    document.getElementById('sl').classList.add('input-error');
    showError('Enter a valid stop loss price'); return false;
  }
  if (sl < MIN_PRICE || sl > MAX_PRICE) {
    document.getElementById('sl').classList.add('input-error');
    showError('SL out of range'); return false;
  }
  if (mode === 'market' && (!tp || isNaN(tp))) {
    document.getElementById('tp').classList.add('input-error');
    showError('Enter a valid take profit price'); return false;
  }
  if (entry === sl) {
    showError('Entry and SL cannot be the same'); return false;
  }
  if (direction === 'buy' && sl >= entry) {
    showError('BUY: Stop loss must be BELOW entry'); return false;
  }
  if (direction === 'sell' && sl <= entry) {
    showError('SELL: Stop loss must be ABOVE entry'); return false;
  }
  const pips = Math.round(Math.abs(entry - sl) / 0.0001 * 10) / 10;
  if (pips < MIN_SL_PIPS) { showError('SL too tight: ' + pips.toFixed(1) + ' pips (min ' + MIN_SL_PIPS + ')'); return false; }
  if (pips > MAX_SL_PIPS) { showError('SL too wide: ' + pips.toFixed(1) + ' pips (max ' + MAX_SL_PIPS + ')'); return false; }
  if (mode === 'market') {
    if (direction === 'buy' && tp <= entry) { showError('BUY: TP must be ABOVE entry'); return false; }
    if (direction === 'sell' && tp >= entry) { showError('SELL: TP must be BELOW entry'); return false; }
  }
  return true;
}

// ===== CALCULATE =====
function calculate() {
  let entry, sl, tp;
  if (mode === 'limit') {
    entry = parseFloat(document.getElementById('entry').value);
    sl = parseFloat(document.getElementById('sl').value);
  } else {
    entry = parseFloat(document.getElementById('marketEntry').value);
    sl = parseFloat(document.getElementById('sl').value);
    tp = parseFloat(document.getElementById('tp').value);
  }
  if (!validate(entry, sl, tp)) return;

  if (mode === 'limit') {
    const slPips = Math.abs(entry - sl) / 0.0001;
    const tpPips = slPips * RR;
    tp = direction === 'buy' ? entry + tpPips * 0.0001 : entry - tpPips * 0.0001;
  }

  const fromUrl = new URLSearchParams(location.search).get('e');
  if (!fromUrl && !calculated) {
    showConfirmScreen(entry, sl, tp);
    return;
  }
  buildResults(entry, sl, tp);
}

function showConfirmScreen(entry, sl, tp) {
  const slPips = Math.abs(entry - sl) / 0.0001;
  const tpPips = Math.abs(tp - entry) / 0.0001;
  const badgeClass = direction === 'buy' ? 'badge-buy' : 'badge-sell';
  const rr = (tpPips / slPips).toFixed(1);

  document.getElementById('confirmScreen').innerHTML = `
    <div class="confirm-screen">
      <h3>Confirm Signal</h3>
      <div class="confirm-detail"><span class="direction-badge ${badgeClass}">${direction.toUpperCase()}</span> GBPUSD · ${mode.toUpperCase()}</div>
      <div class="confirm-detail">Entry: <span>${formatPrice(entry)}</span>${mode === 'market' ? ' (ref)' : ''}</div>
      <div class="confirm-detail">Stop Loss: <span>${formatPrice(sl)}</span> (${slPips.toFixed(1)} pips)</div>
      <div class="confirm-detail">Take Profit: <span>${formatPrice(tp)}</span> (${tpPips.toFixed(1)} pips)</div>
      <div class="confirm-detail">Risk:Reward: <span>1:${rr}</span></div>
      <br>
      <button class="btn btn-confirm-share" onclick="confirmCalculate()">✓ Confirm & Calculate</button>
    </div>`;
  document.getElementById('confirmScreen').classList.remove('hidden');
  document.getElementById('inputSection').classList.add('hidden');
}

function confirmCalculate() {
  calculated = true;
  let entry, sl, tp;
  if (mode === 'limit') {
    entry = parseFloat(document.getElementById('entry').value);
    sl = parseFloat(document.getElementById('sl').value);
    const slPips = Math.abs(entry - sl) / 0.0001;
    tp = direction === 'buy' ? entry + slPips * RR * 0.0001 : entry - slPips * RR * 0.0001;
  } else {
    entry = parseFloat(document.getElementById('marketEntry').value);
    sl = parseFloat(document.getElementById('sl').value);
    tp = parseFloat(document.getElementById('tp').value);
  }
  document.getElementById('confirmScreen').classList.add('hidden');
  buildResults(entry, sl, tp);
}
