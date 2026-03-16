// ── Адаптация под мобильные ────────────────────────────────────────────────
function measureHeaderHeight() {
  const header  = document.querySelector('.app-header');
  const toolbar = document.querySelector('.toolbar');
  if (!header || !toolbar) return;
  document.documentElement.style.setProperty(
    '--header-offset',
    (header.offsetHeight + toolbar.offsetHeight) + 'px'
  );
}
measureHeaderHeight();
window.addEventListener('resize', measureHeaderHeight);

/* reports.js */
'use strict';

const _token = AppStorage.get('access_token');
const _role  = AppStorage.get('user_role');
if (!_token) { AppStorage.clear(); location.href = '/'; }
if (!['admin','editor'].includes(_role)) { location.href = '/dashboard'; }

const HDRS = { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' };

// Показываем имя пользователя
const _uname = AppStorage.get('user_name') || AppStorage.get('username') || '';
const _unEl = document.getElementById('userName');
if (_unEl) _unEl.textContent = _uname;
const _pill = document.getElementById('rolePill');
if (_pill) { _pill.textContent = _role; _pill.className = `role-pill ${_role}`; }
document.getElementById('logoutBtn').addEventListener('click', () => { AppStorage.clear(); location.href = '/'; });

async function api(url) {
  try {
    const r = await fetch(url, { headers: HDRS });
    if (r.status === 401) { AppStorage.clear(); location.href = '/'; return null; }
    if (!r.ok) { console.error('API error', r.status, url); return null; }
    return r.json();
  } catch(e) { console.error('Fetch error', url, e); return null; }
}

const PALETTE = ['#5c6bc0','#ef6c00','#43a047','#e53935','#00897b','#8e24aa','#1e88e5','#f9a825','#6d4c41','#039be5'];
function loading(el) { el.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div>Загрузка...</div>'; }
function empty(el, msg='Нет данных')  { el.innerHTML = `<div class="rp-empty">${msg}</div>`; }
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.rp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rp-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// ══════════════════════════════════════════════════════════
// OVERVIEW
// ══════════════════════════════════════════════════════════
async function loadOverview() {
  const d = await api('/api/reports/overview');
  const grid = document.getElementById('overviewGrid');
  if (!d) { grid.innerHTML = ''; return; }
  const origPct = d.total ? Math.round(d.with_original / d.total * 100) : 0;
  const dormPct = d.total ? Math.round(d.need_dorm    / d.total * 100) : 0;
  const items = [
    { label:'Всего абитуриентов', val: d.total,         sub: 'в базе данных' },
    { label:'С оригиналами',      val: d.with_original, sub: `${origPct}% от общего` },
    { label:'Средний балл',       val: d.avg_rating,    sub: 'рейтинговый балл' },
    { label:'Максимальный балл',  val: d.max_rating,    sub: `мин: ${d.min_rating}` },
    { label:'Нужно общежитие',    val: d.need_dorm,     sub: `${dormPct}% от общего` },
  ];
  grid.innerHTML = items.map(c => `
    <div class="rp-ov-card">
      <div class="rp-ov-label">${c.label}</div>
      <div class="rp-ov-val">${c.val ?? '—'}</div>
      <div class="rp-ov-sub">${c.sub}</div>
    </div>`).join('');
  // Показываем число записей в тулбаре
  const rc = document.getElementById('recordsCount');
  if (rc) rc.textContent = d.total ? `${d.total} абитуриентов` : '';
}

// ══════════════════════════════════════════════════════════
// ТАБ 1: АНАЛИЗ ПРОХОДНОГО БАЛЛА
// ══════════════════════════════════════════════════════════
document.getElementById('btnAnalyze').addEventListener('click', async () => {
  const scoreEl  = document.getElementById('psScore');
  const placesEl = document.getElementById('psPlaces');
  const score    = parseFloat(scoreEl.value);
  const places   = parseInt(placesEl.value);
  scoreEl.classList.toggle('err',  !score  || score  < 0);
  placesEl.classList.toggle('err', !places || places < 1);
  if (!score || !places || score < 0 || places < 1) return;

  const results = document.getElementById('psResults');
  loading(results);

  const d = await api(`/api/reports/passing-score?score=${score}&places=${places}`);
  if (!d) { empty(results, 'Ошибка загрузки'); return; }

  const s = d.summary;
  document.getElementById('psSummary').innerHTML = `
    <div class="rp-sum-card green"><div class="rp-sum-num">${s.passes}</div><div>Проходят</div></div>
    <div class="rp-sum-card yellow"><div class="rp-sum-num">${s.reserve}</div><div>В резерве</div></div>
    <div class="rp-sum-card red"><div class="rp-sum-num">${s.fails}</div><div>Не проходят</div></div>
    <div class="rp-sum-card gray"><div class="rp-sum-num">${s.without_original}</div><div>Без оригинала*</div></div>`;

  const TAG = { passes:'green', reserve:'yellow', fails:'red', no_orig_passes:'gray', no_orig_reserve:'gray', no_orig_fails:'gray' };
  const rows = d.rows.map(r => `
    <tr class="s-${TAG[r.status_key]||'gray'}">
      <td><span class="rp-badge ${TAG[r.status_key]||'gray'}">${esc(r.status)}</span></td>
      <td class="c">${r.position ?? '—'}</td>
      <td>${esc(r.fio)}</td>
      <td class="c">${esc(r.code||'—')}</td>
      <td class="c"><b>${r.rating}</b></td>
      <td>${esc(r.benefit)}</td>
      <td class="c">${r.has_original ? '✓' : '—'}</td>
    </tr>`).join('');

  results.innerHTML = `
    <div class="rp-table-wrap">
      <table class="rp-table">
        <thead><tr>
          <th>Статус</th><th class="c">№</th><th>ФИО</th>
          <th class="c">Код</th><th class="c">Балл</th><th>Льгота</th><th class="c">Оригинал</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="margin-top:8px;font-size:11px;color:#9ca3af">* — потенциальный статус при подаче оригинала</p>`;
});

// ══════════════════════════════════════════════════════════
// ТАБ 2: ДИАГРАММЫ
// ══════════════════════════════════════════════════════════
let _activeChart = null;

async function renderChart(type) {
  const area = document.getElementById('chartArea');
  loading(area);
  if (_activeChart) { _activeChart.destroy(); _activeChart = null; }
  if (type === 'sources')  await chartSources(area);
  if (type === 'cities')   await chartCities(area);
  if (type === 'regions')  await chartRegions(area);
  if (type === 'benefits') await chartBenefits(area);
  if (type === 'rating')   await chartRating(area);
}

function mkCanvas(area, tall) {
  area.innerHTML = `<div class="rp-chart-card"><div class="${tall?'rp-chart-wrap-sm':'rp-chart-wrap'}"><canvas id="mainChart"></canvas></div></div>`;
  return document.getElementById('mainChart');
}

async function chartSources(area) {
  const d = await api('/api/reports/chart/sources');
  if (!d?.length) { empty(area,'Нет данных'); return; }
  const cv = mkCanvas(area);
  _activeChart = new Chart(cv, {
    type:'bar',
    data:{ labels:d.map(r=>r.source), datasets:[{ label:'Абитуриентов', data:d.map(r=>r.total), backgroundColor:PALETTE, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{display:true,text:'Распределение по источникам информации',font:{size:13,weight:'bold'}} }, scales:{ x:{grid:{display:false},ticks:{maxRotation:35}}, y:{beginAtZero:true} } },
  });
}
async function chartCities(area) {
  const d = await api('/api/reports/chart/cities');
  if (!d?.length) { empty(area,'Нет данных'); return; }
  const cv = mkCanvas(area);
  _activeChart = new Chart(cv, {
    type:'bar', indexAxis:'y',
    data:{ labels:d.map(r=>r.city), datasets:[{ label:'Абитуриентов', data:d.map(r=>r.total), backgroundColor:PALETTE, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{display:true,text:'ТОП-10 городов',font:{size:13,weight:'bold'}} }, scales:{ x:{beginAtZero:true,grid:{color:'#eee'}}, y:{grid:{display:false}} } },
  });
}
async function chartRegions(area) {
  const d = await api('/api/reports/chart/regions');
  if (!d?.length) { empty(area,'Нет данных'); return; }
  const cv = mkCanvas(area);
  _activeChart = new Chart(cv, {
    type:'doughnut',
    data:{ labels:d.map(r=>r.region), datasets:[{ data:d.map(r=>r.total), backgroundColor:PALETTE, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'right',labels:{font:{size:11},boxWidth:12}}, title:{display:true,text:'Распределение по регионам',font:{size:13,weight:'bold'}},
        tooltip:{ callbacks:{ label:ctx=>{ const t=ctx.dataset.data.reduce((a,b)=>a+b,0); return ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/t*100)}%)`; } } } } },
  });
}
async function chartBenefits(area) {
  const d = await api('/api/reports/chart/benefits');
  if (!d?.length) { empty(area,'Нет данных'); return; }
  area.innerHTML = `<div class="rp-two-charts">
    <div class="rp-chart-card"><div class="rp-chart-title">Количество по льготам</div><div class="rp-chart-wrap-sm"><canvas id="bc1"></canvas></div></div>
    <div class="rp-chart-card"><div class="rp-chart-title">Бонусные баллы</div><div class="rp-chart-wrap-sm"><canvas id="bc2"></canvas></div></div>
  </div>`;
  const cols = PALETTE.slice(0, d.length);
  const mkOpts = (title,key) => ({ type:'bar', indexAxis:'y', data:{ labels:d.map(r=>r.benefit), datasets:[{ data:d.map(r=>r[key]), backgroundColor:cols, borderRadius:3 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{display:true,text:title,font:{size:12}} }, scales:{ x:{beginAtZero:true}, y:{grid:{display:false}} } } });
  _activeChart = new Chart(document.getElementById('bc1'), mkOpts('По количеству','total'));
  new Chart(document.getElementById('bc2'), mkOpts('Бонусные баллы','avg_bonus'));
}
async function chartRating(area) {
  const d = await api('/api/reports/chart/rating-distribution');
  if (!d?.buckets?.length) { empty(area,'Нет данных'); return; }
  const cv = mkCanvas(area);
  _activeChart = new Chart(cv, {
    type:'bar',
    data:{ labels:d.buckets.map(b=>`${b.bucket}–${b.bucket+10}`),
      datasets:[
        { label:'С оригиналом',  data:d.buckets.map(b=>b.with_original),   backgroundColor:'rgba(67,160,71,.8)',  borderRadius:3 },
        { label:'Без оригинала', data:d.buckets.map(b=>b.without_original), backgroundColor:'rgba(255,111,97,.7)', borderRadius:3 },
      ] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top'}, title:{display:true,text:'Распределение по баллам',font:{size:13,weight:'bold'}} },
      scales:{ x:{stacked:true,grid:{display:false}}, y:{stacked:true,beginAtZero:true} } },
  });
}

document.querySelectorAll('.rp-chart-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rp-chart-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderChart(btn.dataset.chart);
  });
});

// ══════════════════════════════════════════════════════════
// ТАБ 3: СТАТИСТИКА
// ══════════════════════════════════════════════════════════
function mkTable(area, cols, rows) {
  const ths = cols.map(c=>`<th class="${c.c?'c':''}">${c.label}</th>`).join('');
  const trs = rows.map(row=>`<tr>${cols.map(c=>`<td class="${c.c?'c':''}">${c.fmt?c.fmt(row[c.key],row):esc(row[c.key]??'—')}</td>`).join('')}</tr>`).join('');
  area.innerHTML = `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}
async function statsCities(area) {
  const d = await api('/api/reports/stats/cities');
  if (!d?.length) { empty(area); return; }
  mkTable(area,[
    {key:'region',label:'Регион'},{key:'city',label:'Город'},
    {key:'total',label:'Всего',c:true},{key:'with_original',label:'С оригиналами',c:true},
    {key:'avg_rating',label:'Средний балл',c:true,fmt:v=>v??'—'},
    {key:'max_rating',label:'Макс.',c:true,fmt:v=>v??'—'},
    {key:'min_rating',label:'Мин.',c:true,fmt:v=>v??'—'},
  ],d);
}
async function statsSources(area) {
  const d = await api('/api/reports/stats/sources');
  if (!d?.length) { empty(area); return; }
  mkTable(area,[
    {key:'source',label:'Источник информации'},{key:'total',label:'Всего',c:true},
    {key:'with_original',label:'С оригиналами',c:true},
    {key:'avg_rating',label:'Средний балл',c:true,fmt:v=>v??'—'},
    {key:'percentage',label:'%',c:true,fmt:v=>`${v}%`},
  ],d);
}
async function statsGeneral(area) {
  const d = await api('/api/reports/stats/general');
  if (!d) { empty(area); return; }
  const ov = d.overview;
  const params = [['Всего абитуриентов',ov.total],['С оригиналами',ov.with_original],['Средний балл',ov.avg_rating??'—'],['Максимальный балл',ov.max_rating??'—'],['Нуждаются в общежитии',ov.need_dorm]];
  const pRows = params.map(([p,v])=>`<tr><td>${p}</td><td class="c"><b>${v}</b></td></tr>`).join('');
  const sep = `<tr><td colspan="2" style="background:#f0f2f8;font-family:'Raleway',sans-serif;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;padding:7px 12px">Статистика по льготам</td></tr>`;
  const bRows = d.benefits.map(b=>`<tr><td>&nbsp;&nbsp;${esc(b.name_benefit)}</td><td class="c">${b.cnt}</td></tr>`).join('');
  area.innerHTML = `<div class="rp-table-wrap"><table class="rp-table"><thead><tr><th>Параметр</th><th class="c">Значение</th></tr></thead><tbody>${pRows}${sep}${bRows}</tbody></table></div>`;
}
async function renderStats(type) {
  const area = document.getElementById('statsArea');
  loading(area);
  if (type==='cities')  await statsCities(area);
  if (type==='sources') await statsSources(area);
  if (type==='general') await statsGeneral(area);
}
document.querySelectorAll('.rp-stats-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rp-stats-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderStats(btn.dataset.stats);
  });
});

// ══════════════════════════════════════════════════════════
// ТАБ 4: ПРОГНОЗИРОВАНИЕ
// ══════════════════════════════════════════════════════════
async function forecastPassing(area) {
  const d = await api('/api/reports/forecast/passing-score');
  if (!d || d.error) { empty(area, d?.error||'Нет данных'); return; }
  area.innerHTML = `
    <div class="rp-section-title">Прогноз проходного балла — статистический анализ</div>
    <div class="rp-summary">
      <div class="rp-sum-card gray"><div class="rp-sum-num">${d.count}</div><div>С оригиналами</div></div>
      <div class="rp-sum-card green"><div class="rp-sum-num">${d.forecast_conservative}</div><div>Консервативный (75-й %)</div></div>
      <div class="rp-sum-card yellow"><div class="rp-sum-num">${d.forecast_optimistic}</div><div>Оптимистичный (медиана)</div></div>
    </div>
    <div class="rp-report-box">
      <div class="rp-sec">Статистика по рейтинговым баллам</div>
      • Количество с оригиналами: <b>${d.count}</b><br>
      • Средний балл: <b>${d.avg}</b> &nbsp;·&nbsp; Медиана: <b>${d.median}</b> &nbsp;·&nbsp; Станд. отклонение: <b>${d.std}</b><br>
      • Диапазон: <b>${d.min} — ${d.max}</b>
      <div class="rp-sec">Квартильный анализ</div>
      • Q1 (25%): <b>${d.q1}</b> &nbsp;·&nbsp; Q2 (50%, медиана): <b>${d.median}</b> &nbsp;·&nbsp; Q3 (75%): <b>${d.q3}</b>
      <div class="rp-sec">Прогнозируемый проходной балл</div>
      • <span class="f-hi">Консервативный (75-й перцентиль): <b>${d.forecast_conservative}</b></span> — топ-25% с оригиналами<br>
      • <span class="f-med">Оптимистичный (медиана): <b>${d.forecast_optimistic}</b></span> — заполнение всех мест<br>
      • Безопасный (среднее + σ): <b>${d.forecast_safe}</b>
      <div class="rp-sec">Рекомендации</div>
      1. Рекомендуемый проходной балл: <span class="f-hi"><b>${d.forecast_conservative}</b></span><br>
      2. При высоком конкурсе повысить до: <b>${d.forecast_safe}</b><br>
      3. При низком конкурсе снизить до: <span class="f-med"><b>${d.forecast_optimistic}</b></span><br>
      4. <span class="f-low">Критический минимум: <b>${d.forecast_critical_min}</b></span>
    </div>`;
}
async function forecastDormitory(area) {
  const d = await api('/api/reports/forecast/dormitory');
  if (!d) { empty(area); return; }
  const pct = d.total ? Math.round(d.need_dorm/d.total*100) : 0;
  const cityRows = d.cities.map(c=>`<tr><td>${esc(c.city)}</td><td class="c">${c.total}</td><td class="c">${c.need_dorm}</td><td class="c">${c.total?Math.round(c.need_dorm/c.total*100):0}%</td></tr>`).join('');
  area.innerHTML = `
    <div class="rp-section-title">Прогноз потребности в общежитии</div>
    <div class="rp-summary">
      <div class="rp-sum-card gray"><div class="rp-sum-num">${d.need_dorm}</div><div>Нуждаются (${pct}%)</div></div>
      <div class="rp-sum-card green"><div class="rp-sum-num">${d.forecast_min}</div><div>Минимум (с оригиналами)</div></div>
      <div class="rp-sum-card yellow"><div class="rp-sum-num">${d.forecast_reserve}</div><div>Рекомендуем (+20%)</div></div>
      <div class="rp-sum-card red"><div class="rp-sum-num">${d.forecast_max}</div><div>Максимум</div></div>
    </div>
    <div class="rp-section-title rp-mt">Распределение по городам</div>
    <div class="rp-table-wrap">
      <table class="rp-table">
        <thead><tr><th>Город</th><th class="c">Всего</th><th class="c">Нужно общежитие</th><th class="c">%</th></tr></thead>
        <tbody>${cityRows}</tbody>
      </table>
    </div>`;
}
async function forecastSources(area) {
  const d = await api('/api/reports/forecast/sources');
  if (!d?.rows?.length) { empty(area); return; }
  const bars = d.rows.map(r=>{
    const cls = r.effectiveness==='ВЫСОКАЯ'?'high':r.effectiveness==='СРЕДНЯЯ'?'medium':'low';
    return `<div class="eff-row">
      <div class="eff-row-header"><span class="eff-label">${esc(r.source)}</span>
      <span class="eff-meta">${r.total} чел. (${r.market_share}%) · конверсия <b>${r.conversion}%</b> · ср.балл ${r.avg_rating} · скор <b>${r.score ?? '—'}</b> · <b>${r.effectiveness}</b></span></div>
      <div class="eff-track"><div class="eff-fill ${cls}" style="width:${r.conversion}%"></div></div>
    </div>`;
  }).join('');
  const bestRecs  = d.best.map((r,i) =>`<div class="rp-rec good"><span class="rp-rec-n">${i+1}</span><span><b>${esc(r.source)}</b> — конверсия ${r.conversion}%, абитуриентов: ${r.total}</span></div>`).join('');
  const worstRecs = d.worst.map((r,i)=>`<div class="rp-rec warn"><span class="rp-rec-n">${i+1}</span><span><b>${esc(r.source)}</b> — конверсия ${r.conversion}%, требует улучшения</span></div>`).join('');
  area.innerHTML = `
    <div class="rp-section-title">Эффективность источников</div>
    ${bars}
    <div class="rp-geo-grid rp-mt">
      <div><div class="rp-section-title">Лучшие — увеличить вложения</div>${bestRecs}</div>
      <div><div class="rp-section-title">Требуют улучшения</div>${worstRecs}</div>
    </div>`;
}
async function forecastGeographic(area) {
  const d = await api('/api/reports/forecast/geographic');
  if (!d?.regions?.length) { empty(area); return; }
  const regRows = d.regions.map(r=>`<tr><td>${esc(r.region)}</td><td class="c">${r.total}</td><td class="c">${r.share}%</td><td class="c">${r.with_original} (${r.conversion}%)</td><td class="c">${r.avg_rating??'—'}</td><td class="c">${r.need_dorm}</td></tr>`).join('');
  const cityRows = d.cities.map((c,i)=>`<tr><td class="c">${i+1}</td><td>${esc(c.city)}</td><td>${esc(c.region)}</td><td class="c">${c.total}</td><td class="c">${c.with_original}</td><td class="c">${c.avg_rating??'—'}</td></tr>`).join('');
  const top = d.top_region;
  const lowList = d.low_regions.map(r=>`<div class="rp-rec warn">• ${esc(r.region)} (${r.total} чел.)</div>`).join('') || '<div class="rp-empty" style="padding:12px">Все регионы представлены</div>';
  area.innerHTML = `
    <div class="rp-section-title">По регионам</div>
    <div class="rp-table-wrap">
      <table class="rp-table">
        <thead><tr><th>Регион</th><th class="c">Кол-во</th><th class="c">Доля</th><th class="c">С оригиналом</th><th class="c">Ср.балл</th><th class="c">Общежитие</th></tr></thead>
        <tbody>${regRows}</tbody>
      </table>
    </div>
    <div class="rp-section-title rp-mt">ТОП-10 городов</div>
    <div class="rp-table-wrap">
      <table class="rp-table">
        <thead><tr><th class="c">№</th><th>Город</th><th>Регион</th><th class="c">Всего</th><th class="c">С оригиналом</th><th class="c">Ср.балл</th></tr></thead>
        <tbody>${cityRows}</tbody>
      </table>
    </div>
    <div class="rp-geo-grid rp-mt">
      <div>
        <div class="rp-section-title">Стратегические выводы</div>
        <div class="rp-report-box" style="max-height:200px">
          <div class="rp-sec">Географическая концентрация</div>
          • Основной регион: <b>${esc(top?.region??'—')}</b> (${top?.share??0}%)<br>
          • Всего абитуриентов: <b>${d.total_all}</b>
          <div class="rp-sec">Прогноз на следующий год</div>
          Ожидаемый рост +10–15%: <span class="f-hi"><b>${d.forecast_next_year}</b> абитуриентов</span>
        </div>
      </div>
      <div>
        <div class="rp-section-title">Слабо представленные регионы</div>
        ${lowList}
      </div>
    </div>`;
}
async function renderForecast(type) {
  const area = document.getElementById('forecastArea');
  loading(area);
  if (type==='passing')    await forecastPassing(area);
  if (type==='dormitory')  await forecastDormitory(area);
  if (type==='sources')    await forecastSources(area);
  if (type==='geographic') await forecastGeographic(area);
}
document.querySelectorAll('.rp-forecast-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rp-forecast-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderForecast(btn.dataset.forecast);
  });
});

// ── Logo fallback ─────────────────────────────────────────
const _li = document.getElementById('logoImg');
if (_li) _li.addEventListener('error', function(){ this.style.display='none'; this.parentElement.textContent='А'; });

// ── Init ──────────────────────────────────────────────────
loadOverview();
renderChart('sources');
renderStats('cities');
renderForecast('passing');