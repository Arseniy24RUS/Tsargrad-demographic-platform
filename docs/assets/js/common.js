'use strict';

function mergePlotObject(base, extra){
  const out = Object.assign({}, base);
  Object.entries(extra || {}).forEach(([key, value])=>{
    if(value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])){
      out[key] = mergePlotObject(base[key], value);
    } else {
      out[key] = value;
    }
  });
  return out;
}
function lockPlotAxes(layout){
  Object.keys(layout || {}).forEach((key)=>{
    if(/^xaxis\d*$/.test(key) || /^yaxis\d*$/.test(key)){
      layout[key] = mergePlotObject({ fixedrange: true }, layout[key] || {});
    }
  });
  return layout;
}
const TG = {
  colors: {
    teal: '#145b61', deep: '#0b3438', blue: '#173f78', gold: '#d4a537',
    goldSoft: '#efd39a', cream: '#f4efe4', ink: '#111514', muted: '#6f7775',
    red: '#a94b48', green: '#3c7a47', orange: '#c9762c', lightBlue: '#6aa7c7'
  },
  isNarrow(){
    return window.matchMedia('(max-width: 720px)').matches;
  },
  categoryAxis(extra = {}){
    const narrow = TG.isNarrow();
    return mergePlotObject({
      gridcolor: '#efe5d4',
      automargin: true,
      tickangle: narrow ? -45 : -20,
      tickfont: { size: narrow ? 10 : 13 }
    }, extra);
  },
  yearAxis(start, end, extra = {}){
    const narrow = TG.isNarrow();
    return mergePlotObject({
      gridcolor: '#efe5d4',
      range: start && end ? [start, end] : undefined,
      dtick: narrow ? 10 : 5,
      tickfont: { size: narrow ? 10 : 13 },
      automargin: true
    }, extra);
  },
  plotLayout(extra = {}) {
    const narrow = TG.isNarrow();
    const base = {
      paper_bgcolor: 'rgba(255,255,255,0)',
      plot_bgcolor: '#fffdf8',
      font: { family: "Roboto Condensed, Arial Narrow, Arial, sans-serif", size: narrow ? 13 : 15, color: '#111514' },
      margin: narrow ? { l: 48, r: 20, t: 36, b: 106 } : { l: 62, r: 36, t: 28, b: 70 },
      hovermode: 'x unified',
      legend: narrow
        ? { orientation: 'h', x: 0, y: -0.24, xanchor: 'left', yanchor: 'top', bgcolor: 'rgba(255,255,255,.90)', bordercolor: '#eadbbf', borderwidth: 1, font: { size: 11 } }
        : { orientation: 'h', x: 0, y: 1.10, bgcolor: 'rgba(255,255,255,.86)', bordercolor: '#eadbbf', borderwidth: 1, font: { size: 13 } },
      xaxis: { gridcolor: '#efe5d4', zeroline: false, tickfont: { size: narrow ? 10 : 13 }, automargin: true },
      yaxis: { gridcolor: '#efe5d4', zerolinecolor: '#cdbb9b', tickfont: { size: narrow ? 10 : 13 }, automargin: true },
      colorway: ['#145b61','#d4a537','#173f78','#a94b48','#3c7a47','#c9762c'],
      separators: ', '
    };
    const merged = mergePlotObject(base, extra);
    if(narrow){
      merged.margin = mergePlotObject(merged.margin || {}, { b: Math.max(merged.margin?.b || 0, 104) });
      merged.height = Math.max(merged.height || 0, 500);
    }
    merged.dragmode = false;
    return lockPlotAxes(merged);
  },
  plotConfig: {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,
    scrollZoom: false,
    modeBarButtonsToRemove: ['zoom2d','pan2d','select2d','lasso2d','zoomIn2d','zoomOut2d','autoScale2d','resetScale2d']
  }
};

function setupMobileNav(){
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById(toggle?.getAttribute('aria-controls') || 'siteNav');
  if(!toggle || !nav) return;
  const navHost = nav.parentElement || document.body;
  let backdrop = navHost.querySelector('.nav-backdrop');
  if(!backdrop){
    backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    navHost.insertBefore(backdrop, nav);
  }
  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    backdrop.hidden = !open;
  };
  toggle.addEventListener('click', ()=>setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop.addEventListener('click', ()=>setOpen(false));
  nav.querySelectorAll('a').forEach(link=>link.addEventListener('click', ()=>setOpen(false)));
  document.addEventListener('keydown', ev=>{
    if(ev.key === 'Escape') setOpen(false);
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupMobileNav);
else setupMobileNav();

async function loadJSON(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`Данные временно недоступны`);
  return await r.json();
}
function fmtNum(x, digits = 0){
  if(x === null || x === undefined || Number.isNaN(x)) return '—';
  return Number(x).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtRub(x, digits = 0){
  if(x === null || x === undefined || Number.isNaN(x)) return '—';
  if(Math.abs(x) >= 1e12) return `${fmtNum(x/1e12, 2)} трлн ₽`;
  if(Math.abs(x) >= 1e9) return `${fmtNum(x/1e9, 2)} млрд ₽`;
  if(Math.abs(x) >= 1e6) return `${fmtNum(x/1e6, 2)} млн ₽`;
  return `${fmtNum(x, digits)} ₽`;
}
function fmtPct(x, digits = 1){
  if(x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${fmtNum(x, digits)}%`;
}
function fmtTfr(x, digits = 3){
  if(x === null || x === undefined || Number.isNaN(x)) return '—';
  return fmtNum(x, digits);
}
function parseDate(s){ return new Date(`${s.slice(0,10)}T00:00:00`); }
function monthId(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function addMonths(date, n){ const d = new Date(date.getTime()); d.setMonth(d.getMonth()+n); return d; }
function monthsBetween(a,b){ return (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()); }
function monthRange(start, end){
  const out=[]; let d=parseDate(start.length===7 ? `${start}-01` : start); const e=parseDate(end.length===7 ? `${end}-01` : end);
  while(d<=e){ out.push(new Date(d)); d=addMonths(d,1); }
  return out;
}
function linearRegression(xs, ys){
  const n=xs.length; const xbar=xs.reduce((a,b)=>a+b,0)/n; const ybar=ys.reduce((a,b)=>a+b,0)/n;
  let sxx=0, sxy=0; for(let i=0;i<n;i++){ sxx += (xs[i]-xbar)**2; sxy += (xs[i]-xbar)*(ys[i]-ybar); }
  const slope = sxx===0 ? 0 : sxy/sxx; const intercept = ybar - slope*xbar;
  let rss=0; for(let i=0;i<n;i++){ const e=ys[i]-(intercept+slope*xs[i]); rss+=e*e; }
  const sigma = Math.sqrt(rss/Math.max(1,n-2));
  return {intercept, slope, xbar, sxx, sigma, n};
}
function downloadCsv(filename, rows){
  if(!rows || !rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = v => {
    if(v === null || v === undefined) return '';
    const s = String(v).replace(/"/g,'""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [cols.join(';')].concat(rows.map(r => cols.map(c => esc(r[c])).join(';'))).join('\n');
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function tableHTML(rows, cols){
  if(!rows || !rows.length) return '<div class="text-note" style="padding:14px">Нет данных</div>';
  const columns = cols || Object.keys(rows[0]).map(k => ({key:k,label:k}));
  const head = `<thead><tr>${columns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table>${head}${body}</table>`;
}


function normalizeRuName(value){
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/\([^)]*\)/g,'')
    .replace(/[«»\"'`]/g,'')
    .replace(/\bг\.?\s+/g,'')
    .replace(/[-–—]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function parseCsvSimple(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(ch==='"'){
      if(q && nx==='"'){ cell+='"'; i++; }
      else q=!q;
    } else if(ch===',' && !q){ row.push(cell); cell=''; }
    else if((ch==='\n' || ch==='\r') && !q){
      if(ch==='\r' && nx==='\n') i++;
      row.push(cell); cell='';
      if(row.some(v=>String(v).trim()!=='')) rows.push(row);
      row=[];
    } else cell+=ch;
  }
  if(cell || row.length){ row.push(cell); if(row.some(v=>String(v).trim()!=='')) rows.push(row); }
  if(!rows.length) return [];
  const headers=rows[0].map(h=>String(h).trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h, r[i] ?? ''])));
}
async function loadText(url, timeoutMs=8000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {cache:'force-cache', signal:controller.signal});
    if(!res.ok) throw new Error('Данные временно недоступны');
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
function showDataUnavailable(containerId){
  const node=document.getElementById(containerId);
  if(node) node.innerHTML='<div class="text-note" style="padding:18px">Данные временно недоступны. Попробуйте обновить страницу.</div>';
}
