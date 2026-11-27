/* 回頭車 PWA 介面邏輯 */
(function () {
  const D = window.HTData;
  const M = window.HTMatch;
  const S = window.HTStore;
  const store = S.createStore();

  const VIEWS = {
    dashboard: ['營運總覽', '掌握貨源、回程車與每趟節省'],
    cargos: ['貨運需求', '刊登待運貨物與條件'],
    trucks: ['回程車源', '登記空車回程與證照'],
    matching: ['智慧配對', '依路線、日期、載重與貨類計分'],
    trips: ['趟次紀錄', '原運費、回頭車價與節省'],
    savings: ['節省儀表板', '彙總已記錄的價差'],
    compliance: ['合規與範圍', '危品門檻與公路法說明'],
    settings: ['設定與資料', '備份、參數與示範登入'],
    more: ['更多', '車源、節省、合規與設定']
  };

  const NAV = [
    ['dashboard', '▦', '總覽'],
    ['cargos', '📦', '貨源'],
    ['trucks', '🚚', '車源'],
    ['matching', '✨', '配對'],
    ['trips', '📍', '趟次'],
    ['savings', '🪙', '節省'],
    ['compliance', '⚖️', '合規'],
    ['settings', '⚙️', '設定']
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
  const currency = n => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(Number(n) || 0);
  const number = n => new Intl.NumberFormat('zh-TW').format(Number(n) || 0);
  const uid = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtTime = iso => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  let state;
  let session;
  let currentView = 'dashboard';
  let confirmHandler = null;
  let deferredPrompt = null;
  let eventsBound = false;

  async function persist() { await store.save(state); }

  function toast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', type === 'error');
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function currentUser() {
    return D.DEMO_USERS.find(u => u.id === (session && session.userId)) || D.DEMO_USERS[2];
  }

  function addActivity(text, detail) {
    state.activities.unshift({ id: uid('AC'), text, detail, time: new Date().toISOString() });
    state.activities = state.activities.slice(0, 40);
  }

  function addNotification(title, body) {
    state.notifications.unshift({ id: uid('NT'), title, body, time: new Date().toISOString() });
  }

  function openModal(id) { $('#' + id).classList.add('show'); }
  function closeModal(id) { $('#' + id).classList.remove('show'); }

  function confirmAction(title, body, fn) {
    $('#confirmTitle').textContent = title;
    $('#confirmBody').textContent = body;
    confirmHandler = fn;
    openModal('confirmModal');
  }

  function fillSelect(el, items, withBlank) {
    if (!el) return;
    const cur = el.value;
    el.innerHTML = (withBlank ? '<option value=""></option>' : '') + items.map(v => {
      const val = typeof v === 'string' ? v : v.id;
      const label = typeof v === 'string' ? v : v.label;
      return `<option value="${escapeHTML(val)}">${escapeHTML(label)}</option>`;
    }).join('');
    if (cur) el.value = cur;
  }

  function fillStaticSelects() {
    fillSelect($('#cargoGoodsType'), D.GOODS_TYPES);
    fillSelect($('#cargoPackaging'), D.PACKAGING);
    fillSelect($('#cargoOrigin'), D.CITY_LIST);
    fillSelect($('#cargoDestination'), D.CITY_LIST);
    fillSelect($('#cargoVehicle'), D.VEHICLE_TYPES);
    fillSelect($('#cargoTemp'), D.TEMPERATURES);
    fillSelect($('#cargoUrgency'), D.URGENCY);
    fillSelect($('#cargoState'), D.PHYSICAL_STATES);
    fillSelect($('#truckOrigin'), D.CITY_LIST);
    fillSelect($('#truckDestination'), D.CITY_LIST);
    fillSelect($('#truckVehicle'), D.VEHICLE_TYPES);
    fillSelect($('#truckEquipment'), D.TRUCK_EQUIPMENT);
    fillSelect($('#truckLastGoods'), D.GOODS_TYPES, true);
    $('#cargoReqs').innerHTML = D.SPECIAL_REQS.map(r => `<label><input type="checkbox" value="${escapeHTML(r)}" /> ${escapeHTML(r)}</label>`).join('');
    $('#truckLicences').innerHTML = D.LICENCES.map(r => `<label><input type="checkbox" value="${escapeHTML(r)}" /> ${escapeHTML(r)}</label>`).join('');
    $('#truckAccepted').innerHTML = D.GOODS_TYPES.map(r => `<label><input type="checkbox" value="${escapeHTML(r)}" /> ${escapeHTML(r)}</label>`).join('');
  }

  function checkedValues(container) {
    return $$( 'input:checked', container).map(i => i.value);
  }

  function setChecked(container, values) {
    $$('input', container).forEach(i => { i.checked = (values || []).includes(i.value); });
  }

  function statusChip(status) {
    const map = { '待配對': 'teal', '詢價中': 'amber', '已成交': 'green', '可接單': 'teal', '洽談中': 'amber', '已排程': 'green', '待確認': 'amber', '已確認': 'teal', '運送中': 'teal', '已完成': 'green' };
    return `<span class="chip ${map[status] || ''}">${escapeHTML(status)}</span>`;
  }

  function switchView(name) {
    if (!VIEWS[name]) name = 'dashboard';
    currentView = name;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    const [title, sub] = VIEWS[name];
    $('#pageTitle').textContent = title;
    $('#pageSub').textContent = sub;
    $$('#sideNav button, #tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name || (name !== 'more' && b.dataset.view === 'more' && !['dashboard','cargos','matching','trips'].includes(name) && b.closest('#tabbar'))));
    $$('#sideNav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('#tabbar button').forEach(b => {
      const tab = b.dataset.view;
      const moreViews = ['trucks', 'savings', 'compliance', 'settings', 'more'];
      b.classList.toggle('active', tab === name || (tab === 'more' && moreViews.includes(name)));
    });
    if (location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
    renderCurrentView();
    window.scrollTo(0, 0);
  }

  function renderNav() {
    $('#sideNav').innerHTML = NAV.map(([id, ico, label]) =>
      `<button type="button" data-view="${id}"><span class="ico">${ico}</span>${label}</button>`
    ).join('');
    $('#tabbar').innerHTML = [
      ['dashboard', '▦', '總覽'],
      ['cargos', '📦', '貨源'],
      ['matching', '✨', '配對'],
      ['trips', '📍', '趟次'],
      ['more', '⋯', '更多']
    ].map(([id, ico, label]) =>
      `<button type="button" data-view="${id}"><span class="ico">${ico}</span>${label}</button>`
    ).join('');
  }

  function renderUser() {
    const u = currentUser();
    $('#userChip').innerHTML = `<span class="avatar">${escapeHTML(u.name[0])}</span><span>${escapeHTML(u.name)}・${escapeHTML(D.ROLES[u.role].label)}</span>`;
  }

  function tripSaving(t) {
    return M.computeSaving(t.originalFreight, t.backhaulPrice);
  }
  function savingClass(n) { return Number(n) >= 0 ? 'saving' : 'money'; }
  function savingLabel(n) { return Number(n) >= 0 ? '節省' : '增加成本'; }

  function totals() {
    const trips = state.trips || [];
    const saving = trips.reduce((s, t) => s + tripSaving(t), 0);
    const original = trips.reduce((s, t) => s + (Number(t.originalFreight) || 0), 0);
    const backhaul = trips.reduce((s, t) => s + (Number(t.backhaulPrice) || 0), 0);
    const openCargos = state.cargos.filter(c => ['待配對', '詢價中'].includes(c.status)).length;
    const openTrucks = state.trucks.filter(t => t.status === '可接單' && M.hasYellowPlate(t)).length;
    return { trips, saving, original, backhaul, openCargos, openTrucks };
  }

  function renderDashboard() {
    const t = totals();
    const rate = t.original ? Math.round(t.saving / t.original * 100) : 0;
    $('#dashStats').innerHTML = [
      ['🪙', '已記錄節省', currency(t.saving), `原運費 ${currency(t.original)}，約 ${rate}%`],
      ['📦', '待配對貨物', number(t.openCargos), `共 ${state.cargos.length} 筆示範貨物`],
      ['🚚', '可接單回程車', number(t.openTrucks), '已排除無黃牌車輛'],
      ['📍', '趟次', number(t.trips.length), `${t.trips.filter(x => x.status === '已完成').length} 筆已完成`]
    ].map(([ico, label, val, foot]) =>
      `<div class="stat"><div class="stat-head"><span>${label}</span><span>${ico}</span></div><div class="stat-value">${val}</div><div class="stat-foot">${foot}</div></div>`
    ).join('');

    const routes = (state.trips || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    $('#dashRoutes').innerHTML = routes.length ? routes.map(tr => {
      const c = state.cargos.find(x => x.id === tr.cargoId);
      const tk = state.trucks.find(x => x.id === tr.truckId);
      if (!c) return '';
      return `<div class="route-ish" style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 0;border-bottom:1px solid var(--line)">
        <div><strong>${escapeHTML(c.origin)} → ${escapeHTML(c.destination)}</strong>
        <div class="meta">${escapeHTML(c.title)}・${escapeHTML(tk ? tk.company : '')}</div></div>
        <div style="text-align:right"><div class="${savingClass(tripSaving(tr))}">${currency(tripSaving(tr))}</div><div class="meta">${savingLabel(tripSaving(tr))}</div></div>
      </div>`;
    }).join('') : '<div class="empty">尚無趟次紀錄</div>';

    $('#dashActivity').innerHTML = (state.activities || []).slice(0, 5).map(a =>
      `<div class="activity"><span class="activity-dot"></span><div><strong>${escapeHTML(a.text)}</strong><p>${escapeHTML(a.detail || '')}</p></div><time>${escapeHTML(fmtTime(a.time))}</time></div>`
    ).join('') || '<div class="empty">尚無動態</div>';
  }

  function renderCargos() {
    const q = ($('#cargoSearch').value || '').trim().toLowerCase();
    const f = $('#cargoFilter').value;
    const rows = state.cargos.filter(c => {
      if (f && c.status !== f) return false;
      const blob = [c.title, c.owner, c.origin, c.destination, c.goodsType].join(' ').toLowerCase();
      return !q || blob.includes(q);
    });
    $('#cargoList').innerHTML = rows.length ? rows.map(c => {
      const dg = M.assessDangerousGoods(c);
      return `<article class="card">
        <div class="card-top">
          <div><h3>${escapeHTML(c.title)}</h3><div class="meta">${escapeHTML(c.owner)}・${escapeHTML(c.id)}</div></div>
          ${statusChip(c.status)}
        </div>
        <div class="route"><span>${escapeHTML(c.origin)}</span><span class="arrow">→</span><span>${escapeHTML(c.destination)}</span></div>
        <div class="chips">
          <span class="chip teal">${escapeHTML(c.goodsType)}</span>
          <span class="chip">${escapeHTML(c.packaging || '')}</span>
          <span class="chip">${number(c.weight)} kg</span>
          <span class="chip">裝貨 ${escapeHTML(c.pickupDate)}</span>
          ${(c.specialReqs || []).slice(0, 3).map(s => `<span class="chip">${escapeHTML(s)}</span>`).join('')}
          ${c.isDangerous ? `<span class="chip ${dg.allowed ? 'amber' : 'red'}">${dg.allowed ? '危品未超量' : '危品超量（已擋）'}</span>` : ''}
        </div>
        <div class="meta" style="margin-top:8px">原運費 ${currency(c.originalFreight)}　預算 ${c.budget ? currency(c.budget) : '—'}</div>
        <div class="card-actions">
          <button class="btn small" data-edit-cargo="${c.id}">編輯</button>
          <button class="btn small secondary" data-match-cargo="${c.id}">找車</button>
          <button class="btn small outline" data-del-cargo="${c.id}">刪除</button>
        </div>
      </article>`;
    }).join('') : '<div class="empty">沒有符合的貨物。可新增一筆示範貨物。</div>';
  }

  function renderTrucks() {
    const q = ($('#truckSearch').value || '').trim().toLowerCase();
    const rows = state.trucks.filter(t => {
      const blob = [t.company, t.driver, t.plate, t.origin, t.destination].join(' ').toLowerCase();
      return !q || blob.includes(q);
    });
    $('#truckList').innerHTML = rows.map(t => {
      const yellow = M.hasYellowPlate(t);
      return `<article class="card">
        <div class="card-top">
          <div><h3>${escapeHTML(t.company)}</h3><div class="meta">${escapeHTML(t.driver || '—')}・${escapeHTML(t.plate || '未填車牌')}・${escapeHTML(t.id)}</div></div>
          ${statusChip(t.status)}
        </div>
        <div class="route"><span>${escapeHTML(t.origin)}</span><span class="arrow">→</span><span>${escapeHTML(t.destination)}</span></div>
        <div class="chips">
          <span class="chip teal">${escapeHTML(t.vehicleType)}</span>
          <span class="chip">載重 ${number(t.maxWeight)} kg</span>
          <span class="chip">${escapeHTML(t.availableDate)} 起</span>
          ${yellow ? '<span class="chip green">黃牌</span>' : '<span class="chip red">無黃牌・不媒合</span>'}
          ${(t.licences || []).filter(l => !l.includes('黃牌')).map(l => `<span class="chip">${escapeHTML(l)}</span>`).join('')}
        </div>
        <div class="meta" style="margin-top:8px">可承接：${escapeHTML((t.acceptedGoods || []).join('、') || '未設定')}　期望運價 ${t.askingPrice ? currency(t.askingPrice) : '—'}</div>
        <div class="card-actions">
          <button class="btn small" data-edit-truck="${t.id}">編輯</button>
          <button class="btn small outline" data-del-truck="${t.id}">刪除</button>
        </div>
      </article>`;
    }).join('') || '<div class="empty">尚無回程車源。</div>';
  }

  function renderMatching() {
    const open = state.cargos.filter(c => ['待配對', '詢價中'].includes(c.status));
    const sel = $('#matchCargo');
    const keep = sel.value;
    sel.innerHTML = open.map(c => `<option value="${c.id}">${escapeHTML(c.title)}（${c.origin}→${c.destination}）</option>`).join('');
    if (keep && open.some(c => c.id === keep)) sel.value = keep;
    const cargo = state.cargos.find(c => c.id === sel.value);
    if (!cargo) {
      $('#matchDgBox').innerHTML = '';
      $('#matchResults').innerHTML = '<div class="empty">目前沒有待配對貨物。</div>';
      return;
    }
    const dg = M.assessDangerousGoods(cargo);
    $('#matchDgBox').innerHTML = dg.allowed
      ? (dg.warning ? `<div class="warn">${escapeHTML(dg.warning)}</div>` : '')
      : `<div class="errbox">${escapeHTML(dg.reason)}</div>`;
    if (!dg.allowed) {
      $('#matchResults').innerHTML = '<div class="empty">此筆因危品數量超過第一版門檻，不會進行媒合。</div>';
      return;
    }
    const hits = M.listMatches(cargo, state.trucks, state.settings);
    const rejected = M.explainRejects(cargo, state.trucks, state.settings);
    const hiddenWhite = rejected.filter(r => (r.match.reasons || []).some(x => x.includes('黃牌'))).length;
    $('#matchResults').innerHTML = (hits.length ? hits.map(({ truck, match }) => `
      <article class="match-row">
        <div class="match-top">
          <div class="match-score">${match.score}</div>
          <div>
            <strong>${escapeHTML(truck.company)}</strong>
            <div class="meta">${escapeHTML(truck.driver || '')}・${escapeHTML(truck.vehicleType)}・${escapeHTML(truck.origin)} → ${escapeHTML(truck.destination)}</div>
            <div class="meta">起點偏移 ${match.pickupKm} km・迄點偏移 ${match.destinationKm} km・差 ${match.dd} 天</div>
          </div>
          <div style="text-align:right">
            <div class="money">${currency(match.suggested)}</div>
            <div class="meta">建議回頭車價</div>
            <div class="${savingClass(match.saving)}">${currency(match.saving)}</div>
            <div class="meta">${savingLabel(match.saving)}（相對原運費 ${currency(match.originalFreight)}）</div>
          </div>
        </div>
        <div class="bars">
          ${[['起點', match.originScore], ['迄點', match.destScore], ['日期', match.dateScore], ['車型', match.vehicleScore], ['載重', match.capacityScore], ['價格', match.priceScore], ['評價', match.ratingScore]].map(([k, v]) =>
            `<div class="bar"><span>${k}</span><i><em style="width:${v}%"></em></i><span>${v}</span></div>`).join('')}
        </div>
        <div class="card-actions">
          <button class="btn small" data-quote="${cargo.id}|${truck.id}">建立趟次</button>
          <button class="btn small outline" data-share="${cargo.id}|${truck.id}">用 LINE 分享</button>
        </div>
      </article>`).join('') : '<div class="empty">沒有符合條件的回程車。可放寬日期或新增車源。</div>')
      + (hiddenWhite ? `<p class="meta">另有 ${hiddenWhite} 筆因無營業貨車（黃牌）或其他硬條件被排除。</p>` : '');
  }

  function renderTrips() {
    const rows = (state.trips || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!rows.length) {
      $('#tripTable').innerHTML = '<div class="empty">尚無趟次。請先在配對頁建立一筆。</div>';
      return;
    }
    $('#tripTable').innerHTML = `<table><thead><tr>
      <th>趟次</th><th>貨物／路線</th><th>車行</th><th>原運費</th><th>回頭車價</th><th>節省</th><th>狀態</th><th></th>
    </tr></thead><tbody>${rows.map(t => {
      const c = state.cargos.find(x => x.id === t.cargoId);
      const tk = state.trucks.find(x => x.id === t.truckId);
      const next = D.STATUS_ACTION[t.status];
      return `<tr>
        <td>${escapeHTML(t.id)}<div class="meta">${escapeHTML(fmtTime(t.createdAt))}</div></td>
        <td><strong>${escapeHTML(c ? c.title : t.cargoId)}</strong><div class="meta">${c ? `${escapeHTML(c.origin)} → ${escapeHTML(c.destination)}` : ''}</div></td>
        <td>${escapeHTML(tk ? tk.company : t.truckId)}</td>
        <td>${currency(t.originalFreight)}</td>
        <td>${currency(t.backhaulPrice)}</td>
        <td class="${savingClass(tripSaving(t))}">${currency(tripSaving(t))}</td>
        <td>${statusChip(t.status)}</td>
        <td>
          ${next ? `<button class="btn small" data-advance="${t.id}">${escapeHTML(next)}</button>` : ''}
          <button class="btn small outline" data-share-trip="${t.id}">LINE</button>
          <button class="btn small outline" data-del-trip="${t.id}">刪除</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderSavings() {
    const t = totals();
    const rate = t.original ? Math.round(t.saving / t.original * 100) : 0;
    const avg = t.trips.length ? Math.round(t.saving / t.trips.length) : 0;
    $('#savingStats').innerHTML = [
      ['已記錄節省', currency(t.saving), `${t.trips.length} 筆趟次`],
      ['原運費合計', currency(t.original), '示範資料中的專車或既有報價'],
      ['回頭車價合計', currency(t.backhaul), '實際或約定回頭車價'],
      ['平均每趟節省', currency(avg), `節省率約 ${rate}%`]
    ].map(([label, val, foot]) =>
      `<div class="stat"><div class="stat-head"><span>${label}</span></div><div class="stat-value ${label.includes('節省') ? 'up' : ''}">${val}</div><div class="stat-foot">${foot}</div></div>`
    ).join('');

    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
    const values = days.map(d => (state.trips || []).filter(t => new Date(t.createdAt).toDateString() === d.toDateString()).reduce((s, t) => s + tripSaving(t), 0));
    const max = Math.max(1, ...values);
    $('#savingChart').innerHTML = days.map((d, i) => {
      const h = Math.round(values[i] / max * 100);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return `<div class="col" title="${currency(values[i])}"><b style="height:${h}%"></b><span>${label}</span></div>`;
    }).join('');

    const byRoute = {};
    (state.trips || []).forEach(tr => {
      const c = state.cargos.find(x => x.id === tr.cargoId);
      const key = c ? `${c.origin} → ${c.destination}` : '未知路線';
      byRoute[key] = (byRoute[key] || 0) + tripSaving(tr);
    });
    const list = Object.entries(byRoute).sort((a, b) => b[1] - a[1]);
    $('#savingRoutes').innerHTML = list.length ? list.map(([k, v]) =>
      `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${escapeHTML(k)}</span><span class="${savingClass(v)}">${currency(v)}</span></div>`
    ).join('') : '<div class="empty">尚無資料</div>';
  }

  function renderSettings() {
    $('#baseRateInput').value = state.settings.baseRate;
    $('#discountInput').value = state.settings.backhaulDiscount;
  }

  function renderNotifications() {
    const list = state.notifications || [];
    $('#notifyDot').hidden = !list.length;
    $('#notifyList').innerHTML = list.length ? list.map(n =>
      `<div class="activity"><span class="activity-dot"></span><div><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.body)}</p></div><time>${escapeHTML(fmtTime(n.time))}</time></div>`
    ).join('') : '<div class="empty">目前沒有通知</div>';
  }

  function renderCurrentView() {
    renderNotifications();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'cargos') renderCargos();
    if (currentView === 'trucks') renderTrucks();
    if (currentView === 'matching') renderMatching();
    if (currentView === 'trips') renderTrips();
    if (currentView === 'savings' || currentView === 'more') {
      if (currentView === 'savings') renderSavings();
    }
    if (currentView === 'savings') renderSavings();
    if (currentView === 'settings') renderSettings();
  }

  function renderAll() {
    renderUser();
    renderCurrentView();
  }

  function liveDgPreview() {
    const box = $('#cargoDgBox');
    const isDg = $('#cargoIsDangerous').checked;
    $('#cargoStateField').hidden = !isDg;
    if (!isDg) { box.innerHTML = ''; return; }
    const cargo = { isDangerous: true, physicalState: $('#cargoState').value, weight: Number($('#cargoWeight').value) || 0 };
    const dg = M.assessDangerousGoods(cargo);
    box.innerHTML = dg.allowed
      ? `<div class="warn">${escapeHTML(dg.warning || '已標示為危險物品。')}</div>`
      : `<div class="errbox">${escapeHTML(dg.reason)}</div>`;
  }

  function openCargoForm(id) {
    const u = currentUser();
    const c = id ? state.cargos.find(x => x.id === id) : null;
    $('#cargoModalTitle').textContent = c ? '編輯貨運需求' : '新增貨運需求';
    $('#cargoId').value = c?.id || '';
    $('#cargoTitle').value = c?.title || '';
    $('#cargoOwner').value = c?.owner || (u.role === 'shipper' ? u.org : '');
    $('#cargoGoodsType').value = c?.goodsType || '食品添加物';
    $('#cargoPackaging').value = c?.packaging || '紙袋／袋裝';
    $('#cargoOrigin').value = c?.origin || '台北市';
    $('#cargoDestination').value = c?.destination || '台中市';
    $('#cargoPickup').value = c?.pickupDate || D.addDays(1);
    $('#cargoDelivery').value = c?.deliveryDate || '';
    $('#cargoVehicle').value = c?.vehicleType || '3.5噸貨車';
    $('#cargoTemp').value = c?.temperature || '避光／乾燥';
    $('#cargoWeight').value = c?.weight || '';
    $('#cargoVolume').value = c?.volume || '';
    $('#cargoOriginal').value = c?.originalFreight || '';
    $('#cargoBudget').value = c?.budget || '';
    $('#cargoUrgency').value = c?.urgency || 'normal';
    $('#cargoIsDangerous').checked = !!c?.isDangerous;
    $('#cargoState').value = c?.physicalState || '固體';
    setChecked($('#cargoReqs'), c?.specialReqs || []);
    $('#cargoDocs').value = (c?.docs || []).join('、');
    $('#cargoNote').value = c?.note || '';
    liveDgPreview();
    openModal('cargoModal');
  }

  function openTruckForm(id) {
    const u = currentUser();
    const t = id ? state.trucks.find(x => x.id === id) : null;
    $('#truckModalTitle').textContent = t ? '編輯回程車源' : '新增回程車源';
    $('#truckId').value = t?.id || '';
    $('#truckCompany').value = t?.company || (u.role === 'carrier' ? u.org : '');
    $('#truckDriver').value = t?.driver || (u.role === 'carrier' ? u.name : '');
    $('#truckPlate').value = t?.plate || '';
    $('#truckVehicle').value = t?.vehicleType || '3.5噸貨車';
    $('#truckOrigin').value = t?.origin || '台北市';
    $('#truckDestination').value = t?.destination || '台中市';
    $('#truckAvailable').value = t?.availableDate || D.addDays(1);
    $('#truckEnd').value = t?.endDate || '';
    $('#truckMaxWeight').value = t?.maxWeight || D.VEHICLE_META['3.5噸貨車'].defaultWeight;
    $('#truckMaxVolume').value = t?.maxVolume || D.VEHICLE_META['3.5噸貨車'].defaultVolume;
    $('#truckPrice').value = t?.askingPrice || '';
    $('#truckEquipment').value = t?.equipment || '升降尾門';
    $('#truckPhone').value = t?.phone || '';
    $('#truckLastGoods').value = t?.lastGoodsType || '';
    setChecked($('#truckLicences'), t?.licences || ['營業貨車（黃牌）']);
    setChecked($('#truckAccepted'), t?.acceptedGoods || ['食品添加物', '藥用原料']);
    $('#truckCleaned').checked = t?.cleaned !== false;
    $('#truckNote').value = t?.note || '';
    openModal('truckModal');
  }

  function openQuote(cargoId, truckId) {
    const c = state.cargos.find(x => x.id === cargoId);
    const t = state.trucks.find(x => x.id === truckId);
    if (!c || !t) return;
    const m = M.getMatch(c, t, state.settings);
    if (!m.ok) { toast(m.reasons[0] || '無法媒合', 'error'); return; }
    $('#quoteCargoId').value = c.id;
    $('#quoteTruckId').value = t.id;
    $('#quoteOriginal').value = c.originalFreight || 0;
    $('#quotePrice').value = m.suggested;
    $('#quoteNote').value = '';
    $('#quoteSummary').innerHTML = `
      <div><span>貨物</span><strong>${escapeHTML(c.title)}</strong></div>
      <div><span>路線</span><strong>${escapeHTML(c.origin)} → ${escapeHTML(c.destination)}</strong></div>
      <div><span>承運</span><strong>${escapeHTML(t.company)}・${escapeHTML(t.driver || '')}</strong></div>
      <div><span>配對分數</span><strong>${m.score} 分</strong></div>
      <div><span>系統建議價</span><strong>${currency(m.suggested)}</strong></div>`;
    updateQuotePreview();
    openModal('quoteModal');
  }

  function updateQuotePreview() {
    const s = M.computeSaving($('#quoteOriginal').value, $('#quotePrice').value);
    $('#quoteSavingPreview').textContent = `此趟預估節省 ${currency(s)}（原運費減回頭車價）`;
  }

  async function saveCargo(e) {
    e.preventDefault();
    const draft = {
      id: $('#cargoId').value || uid('CG'),
      title: $('#cargoTitle').value.trim(),
      owner: $('#cargoOwner').value.trim(),
      origin: $('#cargoOrigin').value,
      destination: $('#cargoDestination').value,
      pickupDate: $('#cargoPickup').value,
      deliveryDate: $('#cargoDelivery').value,
      vehicleType: $('#cargoVehicle').value,
      temperature: $('#cargoTemp').value,
      goodsType: $('#cargoGoodsType').value,
      packaging: $('#cargoPackaging').value,
      physicalState: $('#cargoState').value,
      isDangerous: $('#cargoIsDangerous').checked,
      weight: Number($('#cargoWeight').value),
      volume: Number($('#cargoVolume').value) || 0,
      originalFreight: Number($('#cargoOriginal').value) || 0,
      budget: Number($('#cargoBudget').value) || 0,
      urgency: $('#cargoUrgency').value,
      specialReqs: checkedValues($('#cargoReqs')),
      docs: $('#cargoDocs').value.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      note: $('#cargoNote').value.trim(),
      status: '待配對',
      createdAt: new Date().toISOString()
    };
    if (draft.origin === draft.destination) { toast('起迄地不能相同', 'error'); return; }
    const dg = M.assessDangerousGoods(draft);
    if (!dg.allowed) { liveDgPreview(); toast('危品超過第一版門檻，無法儲存', 'error'); return; }
    const idx = state.cargos.findIndex(x => x.id === draft.id);
    if (idx >= 0) {
      draft.status = state.cargos[idx].status;
      draft.createdAt = state.cargos[idx].createdAt;
      state.cargos[idx] = draft;
      addActivity('更新貨運需求', draft.title);
    } else {
      state.cargos.unshift(draft);
      addActivity('新增貨運需求', `${draft.title}・${draft.origin} → ${draft.destination}`);
    }
    await persist();
    closeModal('cargoModal');
    renderAll();
    toast(idx >= 0 ? '貨運需求已更新' : '貨運需求已新增');
  }

  async function saveTruck(e) {
    e.preventDefault();
    const draft = {
      id: $('#truckId').value || uid('TR'),
      company: $('#truckCompany').value.trim(),
      driver: $('#truckDriver').value.trim(),
      plate: $('#truckPlate').value.trim(),
      vehicleType: $('#truckVehicle').value,
      origin: $('#truckOrigin').value,
      destination: $('#truckDestination').value,
      availableDate: $('#truckAvailable').value,
      endDate: $('#truckEnd').value,
      maxWeight: Number($('#truckMaxWeight').value),
      maxVolume: Number($('#truckMaxVolume').value) || 0,
      askingPrice: Number($('#truckPrice').value) || 0,
      rating: 4.6,
      phone: $('#truckPhone').value.trim(),
      equipment: $('#truckEquipment').value,
      licences: checkedValues($('#truckLicences')),
      acceptedGoods: checkedValues($('#truckAccepted')),
      lastGoodsType: $('#truckLastGoods').value,
      cleaned: $('#truckCleaned').checked,
      note: $('#truckNote').value.trim(),
      status: '可接單',
      createdAt: new Date().toISOString()
    };
    if (draft.origin === draft.destination) { toast('起迄地不能相同', 'error'); return; }
    if (!M.hasYellowPlate(draft)) {
      toast('未勾選營業貨車（黃牌），仍可儲存，但不會進入媒合', 'error');
    }
    const idx = state.trucks.findIndex(x => x.id === draft.id);
    if (idx >= 0) {
      draft.status = state.trucks[idx].status;
      draft.rating = state.trucks[idx].rating;
      draft.createdAt = state.trucks[idx].createdAt;
      state.trucks[idx] = draft;
      addActivity('更新回程車源', draft.company);
    } else {
      state.trucks.unshift(draft);
      addActivity('新增回程車源', `${draft.company}・${draft.origin} → ${draft.destination}`);
    }
    await persist();
    closeModal('truckModal');
    renderAll();
    toast(idx >= 0 ? '回程車已更新' : '回程車已新增');
  }

  async function saveQuote(e) {
    e.preventDefault();
    const cargoId = $('#quoteCargoId').value;
    const truckId = $('#quoteTruckId').value;
    const c = state.cargos.find(x => x.id === cargoId);
    const t = state.trucks.find(x => x.id === truckId);
    const originalFreight = Number($('#quoteOriginal').value) || 0;
    const backhaulPrice = Number($('#quotePrice').value) || 0;
    const saving = M.computeSaving(originalFreight, backhaulPrice);
    const trip = {
      id: uid('BK'), cargoId, truckId, originalFreight, backhaulPrice, saving,
      status: '待確認', note: $('#quoteNote').value.trim(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    state.trips.unshift(trip);
    if (c) c.status = '已成交';
    if (t && t.status === '可接單') t.status = '洽談中';
    addActivity('建立趟次紀錄', `${c ? c.title : cargoId}，節省 ${currency(saving)}`);
    addNotification('新趟次待確認', `${trip.id} 已建立，尚未確認裝貨與運價。`);
    await persist();
    closeModal('quoteModal');
    switchView('trips');
    toast('趟次已建立，節省 ' + currency(saving));
  }

  function shareText(text) {
    const url = 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
  }

  function shareMatch(cargoId, truckId) {
    const c = state.cargos.find(x => x.id === cargoId);
    const t = state.trucks.find(x => x.id === truckId);
    if (!c || !t) return;
    const m = M.getMatch(c, t, state.settings);
    const page = location.href.split('#')[0] + '#/matching';
    const text = [
      '【回頭車示範】建議媒合（非正式訂單）',
      c.title,
      `${c.origin} → ${c.destination}`,
      `車行：${t.company}`,
      m.ok ? `配對 ${m.score} 分` : '條件需再確認',
      `原運費 ${currency(c.originalFreight)}／建議回頭車價 ${currency(m.ok ? m.suggested : t.askingPrice)}／預估節省 ${currency(m.ok ? m.saving : 0)}`,
      '本訊息來自功能示範，資料為虛構示例。',
      page
    ].join('\n');
    if (navigator.share) {
      navigator.share({ title: '回頭車示範媒合', text }).catch(() => shareText(text));
    } else {
      shareText(text);
    }
  }

  function shareTrip(id) {
    const t = state.trips.find(x => x.id === id);
    if (!t) return;
    const c = state.cargos.find(x => x.id === t.cargoId);
    const tk = state.trucks.find(x => x.id === t.truckId);
    const page = location.href.split('#')[0] + '#/trips';
    const text = [
      '【回頭車示範】趟次摘要（非正式訂單）',
      t.id,
      c ? `${c.title}　${c.origin} → ${c.destination}` : '',
      tk ? `車行：${tk.company}` : '',
      `原運費 ${currency(t.originalFreight)}／回頭車價 ${currency(t.backhaulPrice)}／節省 ${currency(tripSaving(t))}`,
      `狀態：${t.status}`,
      '本示範不處理金流。',
      page
    ].join('\n');
    if (navigator.share) {
      navigator.share({ title: '回頭車示範趟次', text }).catch(() => shareText(text));
    } else shareText(text);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportJSON() {
    downloadFile('huitouche-demo.json', JSON.stringify(state, null, 2), 'application/json');
    toast('已匯出 JSON');
  }

  function exportTrips() {
    const header = ['趟次', '貨物', '路線', '車行', '原運費', '回頭車價', '節省', '狀態'];
    const lines = [header.join(',')].concat((state.trips || []).map(t => {
      const c = state.cargos.find(x => x.id === t.cargoId);
      const tk = state.trucks.find(x => x.id === t.truckId);
      const route = c ? `${c.origin}→${c.destination}` : '';
      return [t.id, c ? c.title : '', route, tk ? tk.company : '', t.originalFreight, t.backhaulPrice, tripSaving(t), t.status]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    }));
    downloadFile('huitouche-trips.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
    toast('已匯出趟次 CSV');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.cargos) || !Array.isArray(data.trucks)) throw new Error('格式不正確');
        data.trips = data.trips || data.bookings || [];
        data.settings = data.settings || { ...D.DEFAULT_SETTINGS };
        data.activities = data.activities || [];
        data.notifications = data.notifications || [];
        data.version = 2;
        state = data;
        await persist();
        renderAll();
        toast('已匯入資料');
      } catch {
        toast('匯入失敗，請確認是本工具匯出的 JSON', 'error');
      }
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const go = e.target.closest('[data-go]');
      if (go) switchView(go.dataset.go);
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) switchView(viewBtn.dataset.view);
      const close = e.target.closest('[data-close]');
      if (close) closeModal(close.dataset.close);
      const editC = e.target.closest('[data-edit-cargo]');
      if (editC) openCargoForm(editC.dataset.editCargo);
      const delC = e.target.closest('[data-del-cargo]');
      if (delC) confirmAction('刪除貨物', '確定刪除這筆貨運需求？', async () => {
        state.cargos = state.cargos.filter(c => c.id !== delC.dataset.delCargo);
        await persist(); renderAll(); toast('已刪除貨物');
      });
      const matchC = e.target.closest('[data-match-cargo]');
      if (matchC) { switchView('matching'); $('#matchCargo').value = matchC.dataset.matchCargo; renderMatching(); }
      const editT = e.target.closest('[data-edit-truck]');
      if (editT) openTruckForm(editT.dataset.editTruck);
      const delT = e.target.closest('[data-del-truck]');
      if (delT) confirmAction('刪除回程車', '確定刪除這筆回程車源？', async () => {
        state.trucks = state.trucks.filter(t => t.id !== delT.dataset.delTruck);
        await persist(); renderAll(); toast('已刪除回程車');
      });
      const quote = e.target.closest('[data-quote]');
      if (quote) { const [c, t] = quote.dataset.quote.split('|'); openQuote(c, t); }
      const share = e.target.closest('[data-share]');
      if (share) { const [c, t] = share.dataset.share.split('|'); shareMatch(c, t); }
      const shareTripBtn = e.target.closest('[data-share-trip]');
      if (shareTripBtn) shareTrip(shareTripBtn.dataset.shareTrip);
      const adv = e.target.closest('[data-advance]');
      if (adv) {
        const t = state.trips.find(x => x.id === adv.dataset.advance);
        if (t && D.NEXT_STATUS[t.status]) {
          t.status = D.NEXT_STATUS[t.status];
          t.updatedAt = new Date().toISOString();
          addActivity('更新趟次狀態', `${t.id} → ${t.status}`);
          persist().then(renderAll);
        }
      }
      const delTrip = e.target.closest('[data-del-trip]');
      if (delTrip) confirmAction('刪除趟次', '確定刪除這筆趟次紀錄？', async () => {
        state.trips = state.trips.filter(t => t.id !== delTrip.dataset.delTrip);
        await persist(); renderAll(); toast('已刪除趟次');
      });
      if (e.target.closest('[data-action="exportJSON"]')) exportJSON();
      if (e.target.closest('[data-action="exportTrips"]')) exportTrips();
    });

    $('#newCargoBtn').addEventListener('click', () => openCargoForm());
    $('#newTruckBtn').addEventListener('click', () => openTruckForm());
    $('#cargoForm').addEventListener('submit', saveCargo);
    $('#truckForm').addEventListener('submit', saveTruck);
    $('#quoteForm').addEventListener('submit', saveQuote);
    $('#cargoSearch').addEventListener('input', renderCargos);
    $('#cargoFilter').addEventListener('change', renderCargos);
    $('#truckSearch').addEventListener('input', renderTrucks);
    $('#matchCargo').addEventListener('change', renderMatching);
    $('#cargoIsDangerous').addEventListener('change', liveDgPreview);
    $('#cargoState').addEventListener('change', liveDgPreview);
    $('#cargoWeight').addEventListener('input', liveDgPreview);
    $('#quoteOriginal').addEventListener('input', updateQuotePreview);
    $('#quotePrice').addEventListener('input', updateQuotePreview);
    $('#confirmActionBtn').addEventListener('click', () => {
      closeModal('confirmModal');
      const fn = confirmHandler; confirmHandler = null; if (fn) fn();
    });
    $$('.backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.backdrop.show').forEach(m => closeModal(m.id));
        $('#notifyDrawer').classList.remove('show');
      }
    });
    $('#notifyBtn').addEventListener('click', () => { renderNotifications(); $('#notifyDrawer').classList.add('show'); });
    $('#closeDrawer').addEventListener('click', () => $('#notifyDrawer').classList.remove('show'));
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
    $('#resetBtn').addEventListener('click', () => confirmAction('重設示範資料', '這會刪除目前瀏覽器中的自訂資料，並恢復為虛構示範內容。', async () => {
      state = D.defaultState();
      await persist();
      renderAll();
      toast('已恢復示範資料');
    }));
    $('#savePricingBtn').addEventListener('click', async () => {
      const rate = Number($('#baseRateInput').value), discount = Number($('#discountInput').value);
      if (rate < 10 || discount < 0.5 || discount > 1) { toast('請輸入合理的費率與折扣', 'error'); return; }
      state.settings = { baseRate: rate, backhaulDiscount: discount };
      addActivity('更新運價參數', `每公里 ${rate} 元，回程折扣 ${discount}`);
      await persist(); renderAll(); toast('運價參數已儲存');
    });
    $('#logoutBtn').addEventListener('click', () => {
      S.clearSession();
      $('#app').hidden = true;
      $('#loginScreen').hidden = false;
    });
    window.addEventListener('hashchange', () => {
      const name = (location.hash || '#/dashboard').replace(/^#\//, '');
      if (name && name !== currentView) switchView(name);
    });
  }

  function showApp() {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
    renderNav();
    if (!eventsBound) { bindEvents(); eventsBound = true; }
    fillStaticSelects();
    const name = (location.hash || '#/dashboard').replace(/^#\//, '');
    switchView(VIEWS[name] ? name : 'dashboard');
    renderAll();
  }

  function tryLogin(email, password, remember) {
    const user = D.DEMO_USERS.find(u => u.email === email.trim().toLowerCase());
    if (!user || password !== user.password) { toast('帳號或密碼不正確（示範密碼為 demo）', 'error'); return false; }
    session = { userId: user.id, role: user.role, at: new Date().toISOString() };
    S.saveSession(session, remember);
    state.role = user.role;
    state.userId = user.id;
    persist();
    showApp();
    toast(`已以「${D.ROLES[user.role].label}」示範身分進入`);
    return true;
  }

  function renderAccountButtons() {
    $('#accountButtons').innerHTML = D.DEMO_USERS.map(u =>
      `<button type="button" class="account" data-demo-login="${u.email}">
        <span><strong>${escapeHTML(u.name)}</strong><span>${escapeHTML(u.org)}・${escapeHTML(u.email)}</span></span>
        <span class="role-pill">${escapeHTML(D.ROLES[u.role].label)}</span>
      </button>`
    ).join('');
  }

  function bindLogin() {
    renderAccountButtons();
    $('#accountButtons').addEventListener('click', e => {
      const btn = e.target.closest('[data-demo-login]');
      if (!btn) return;
      $('#loginEmail').value = btn.dataset.demoLogin;
      $('#loginPassword').value = 'demo';
      tryLogin(btn.dataset.demoLogin, 'demo', $('#rememberMe').checked);
    });
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      tryLogin($('#loginEmail').value, $('#loginPassword').value, $('#rememberMe').checked);
    });
  }

  function setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      $('#installBtn').hidden = false;
      $('#installBar').classList.add('show');
    });
    const promptInstall = async () => {
      if (!deferredPrompt) { toast('若沒有安裝按鈕，請用瀏覽器的「加入主畫面」'); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('#installBtn').hidden = true;
      $('#installBar').classList.remove('show');
    };
    $('#installBtn').addEventListener('click', promptInstall);
    $('#installBarBtn').addEventListener('click', promptInstall);
    $('#dismissInstall').addEventListener('click', () => $('#installBar').classList.remove('show'));
  }

  async function init() {
    bindLogin();
    setupPWA();
    const saved = await store.load();
    state = saved && saved.version >= 2 ? saved : D.defaultState();
    if (!state.trips) state.trips = state.bookings || [];
    if (!state.settings) state.settings = { ...D.DEFAULT_SETTINGS };
    session = S.loadSession();
    if (session && D.DEMO_USERS.some(u => u.id === session.userId)) {
      state.role = session.role;
      state.userId = session.userId;
      showApp();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
