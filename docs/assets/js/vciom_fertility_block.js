(function(){
  'use strict';
  const FALLBACK = {
    actual:{year:2025,territory:'Российская Федерация без новых субъектов',tfr_total:1.361,label:'Фактический СКР, 2025'},
    vciom_2025:{
      all:{expected_children:2.4,desired_children:3.2,desired_expected_gap:0.8,expected_actual_gap:1.039,desired_actual_gap:1.839},
      sex:[{group:'Мужчины',expected_children:2.6,desired_children:3.6,desired_expected_gap:1.0},{group:'Женщины',expected_children:2.3,desired_children:2.8,desired_expected_gap:0.5}],
      age:[{group:'18–24 года',expected_children:2.4,desired_children:3.1},{group:'25–34 года',expected_children:2.3,desired_children:3.0},{group:'35–44 года',expected_children:2.5,desired_children:3.4},{group:'45–59 лет',expected_children:2.4,desired_children:3.3},{group:'60 лет и старше',expected_children:2.5,desired_children:3.0}]
    },
    tsargrad_targets:{target_2036_low:2.10,target_2036_high:2.15,target_2050_low:2.50,target_2050_high:3.00}
  };
  let lastState = {
    loaded: false,
    mountId: 'vciom2025Mount',
    source: 'pending'
  };
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  function n(x, digits){
    if(!Number.isFinite(Number(x))) return 'нет данных';
    return Number(x).toLocaleString('ru-RU', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]); });
  }
  function css(){
    if(document.getElementById('vciom-2025-style')) return;
    const style = document.createElement('style');
    style.id = 'vciom-2025-style';
    style.textContent = `
      #vciom-2025-intentions{margin:38px 0;padding:0;position:relative;z-index:1}
      .vciom-card{border:1px solid rgba(216,162,56,.38);border-radius:28px;background:#fff9ee;box-shadow:0 20px 44px rgba(8,45,50,.14);padding:26px;color:#111;overflow:hidden}
      .vciom-card *{box-sizing:border-box}.vciom-eyebrow{color:#d8a238;text-transform:uppercase;letter-spacing:.13em;font-weight:900;font-size:12px;margin-bottom:10px}.vciom-title{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:20px}.vciom-title h2{margin:0;font-size:clamp(28px,3.5vw,48px);line-height:1;text-transform:uppercase;letter-spacing:-.03em}.vciom-title p{margin:0;color:#666052;font-weight:700;max-width:620px}.vciom-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.vciom-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.vciom-kpi{background:#fff;border:1px solid rgba(216,162,56,.28);border-radius:20px;padding:16px;min-height:112px}.vciom-kpi .num{font-size:34px;line-height:1;font-weight:950;color:#0f4f55}.vciom-kpi.gold .num{color:#d8a238}.vciom-kpi .lab{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#615b50;font-weight:850;margin-top:9px}.vciom-chart{background:#fff;border:1px solid rgba(216,162,56,.28);border-radius:22px;padding:18px;min-height:310px}.vciom-side{display:grid;gap:14px}.vciom-note{background:#0f4f55;color:#f3ead6;border-radius:22px;padding:20px;font-weight:750}.vciom-note strong{color:#fff}.vciom-table{background:#fff;border:1px solid rgba(216,162,56,.28);border-radius:22px;overflow:hidden}.vciom-row{display:grid;grid-template-columns:1fr .7fr .7fr .7fr;border-bottom:1px solid #eee}.vciom-row:last-child{border-bottom:0}.vciom-row div{padding:12px 14px;font-weight:800}.vciom-row.head div{font-size:11px;text-transform:uppercase;letter-spacing:.08em;background:#f4ead4;color:#0f4f55}.vciom-row div:not(:first-child){text-align:right}.vciom-source{font-size:12px;color:#7a7468;margin-top:14px;font-weight:700}.vciom-age{margin-top:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.vciom-age div{background:#fff;border:1px solid rgba(216,162,56,.23);border-radius:16px;padding:12px}.vciom-age b{display:block;color:#0f4f55;font-size:18px;margin-top:5px}
      @media(max-width:1100px){.vciom-grid{grid-template-columns:1fr}.vciom-kpis{grid-template-columns:1fr 1fr}.vciom-age{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.vciom-card{padding:18px}.vciom-title{display:block}.vciom-title h2{font-size:30px;line-height:1.04}.vciom-kpis,.vciom-age{grid-template-columns:1fr}.vciom-row{grid-template-columns:1fr}.vciom-row div:not(:first-child){text-align:left}.vciom-chart{overflow:hidden;padding:12px;min-height:250px}.vciom-chart svg{width:100%;height:auto;max-width:100%;display:block}.vciom-chart text{font-size:18px}.vciom-chart text[font-size="15"]{font-size:16px}.vciom-chart text[font-size="13"]{font-size:14px}}
    `;
    document.head.appendChild(style);
  }
  function barChart(data){
    const fact = data.actual.tfr_total;
    const exp = data.vciom_2025.all.expected_children;
    const des = data.vciom_2025.all.desired_children;
    const t2036 = (data.tsargrad_targets.target_2036_low + data.tsargrad_targets.target_2036_high)/2;
    const vals = [fact, exp, des, t2036];
    const labels = ['Факт СКР 2025','Ожидаемое','Желаемое','Цель 2036'];
    const colors = ['#0f4f55','#d8a238','#b98721','#3b7d86'];
    const max = 3.4, w = 720, h = 300, left=74, right=28, bottom=54, top=25;
    const innerW = w-left-right, innerH = h-top-bottom;
    const bw = innerW/vals.length*0.54;
    let grid = '';
    for(let g=0; g<=3; g+=0.5){
      const y = top + innerH - innerH*g/max;
      grid += `<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e7ddc9" stroke-width="1"/><text x="${left-10}" y="${y+4}" text-anchor="end" font-size="11" fill="#756f62">${String(g).replace('.',',')}</text>`;
    }
    let bars = '';
    vals.forEach(function(v,i){
      const x = left + (i+0.5)*innerW/vals.length - bw/2;
      const y = top + innerH - innerH*v/max;
      const bh = innerH*v/max;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="${colors[i]}" opacity=".96"/><text x="${x+bw/2}" y="${y-8}" text-anchor="middle" font-size="18" font-weight="900" fill="${colors[i]}">${n(v, i===0?3:1)}</text><text x="${x+bw/2}" y="${h-22}" text-anchor="middle" font-size="12" font-weight="800" fill="#453f34">${labels[i]}</text>`;
    });
    const gapY1 = top + innerH - innerH*fact/max;
    const gapY2 = top + innerH - innerH*exp/max;
    const gapY3 = top + innerH - innerH*des/max;
    const replacement = 2.15;
    const replacementY = top + innerH - innerH*replacement/max;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Сопоставление фактического СКР, ожидаемого и желаемого числа детей"><rect x="0" y="0" width="${w}" height="${h}" rx="20" fill="#fff"/>${grid}<line x1="${left}" y1="${replacementY}" x2="${w-right}" y2="${replacementY}" stroke="#0f4f55" stroke-width="2" stroke-dasharray="5 5" opacity=".65"/><text x="${left+10}" y="${replacementY-8}" font-size="12" font-weight="900" fill="#0f4f55">уровень простого воспроизводства: 2,15</text><path d="M${w-120},${gapY2} L${w-120},${gapY1}" stroke="#d8a238" stroke-width="3" marker-end="url(#arrow)"/><path d="M${w-82},${gapY3} L${w-82},${gapY1}" stroke="#b98721" stroke-width="3" marker-end="url(#arrow)"/><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#b98721"/></marker></defs>${bars}<text x="${w-126}" y="${(gapY1+gapY2)/2-8}" text-anchor="end" font-size="12" font-weight="800" fill="#d8a238">разрыв с ожидаемым: +${n(exp-fact,3)}</text><text x="${w-88}" y="${(gapY1+gapY3)/2+18}" text-anchor="end" font-size="12" font-weight="800" fill="#b98721">разрыв с желаемым: +${n(des-fact,3)}</text></svg>`;
  }
  function sectionHTML(data){
    const all = data.vciom_2025.all;
    const sexRows = data.vciom_2025.sex.map(function(r){
      return `<div class="vciom-row"><div>${esc(r.group)}</div><div>${n(r.expected_children,1)}</div><div>${n(r.desired_children,1)}</div><div>+${n(r.desired_expected_gap,1)}</div></div>`;
    }).join('');
    const age = data.vciom_2025.age.map(function(r){
      return `<div>${esc(r.group)}<b>${n(r.expected_children,1)} / ${n(r.desired_children,1)}</b></div>`;
    }).join('');
    return `<section id="vciom-2025-intentions" aria-labelledby="vciom-title"><div class="vciom-card"><div class="vciom-eyebrow">ВЦИОМ · 2025 · актуальный социологический слой</div><div class="vciom-title"><h2 id="vciom-title">Желаемое — ожидаемое — фактическое</h2><p>Этот блок сопоставляет фактический СКР 2025 года с актуальными установками россиян по данным ВЦИОМ. Он показывает не формальный СКР, а разрыв между фактической рождаемостью, ожидаемым числом детей и желаемой семейной нормой.</p></div><div class="vciom-kpis"><div class="vciom-kpi"><div class="num">${n(data.actual.tfr_total,3)}</div><div class="lab">фактический СКР, 2025</div></div><div class="vciom-kpi gold"><div class="num">${n(all.expected_children,1)}</div><div class="lab">ожидаемое число детей</div></div><div class="vciom-kpi gold"><div class="num">${n(all.desired_children,1)}</div><div class="lab">желаемое число детей</div></div><div class="vciom-kpi"><div class="num">+${n(all.desired_actual_gap,3)}</div><div class="lab">разрыв желаемого с фактом</div></div></div><div class="vciom-grid"><div><div class="vciom-chart">${barChart(data)}</div><div class="vciom-age">${age}</div></div><div class="vciom-side"><div class="vciom-note"><strong>Смысл для политики:</strong> по ВЦИОМ, репродуктивные идеалы остаются выше простого воспроизводства, но фактический СКР значительно ниже даже ожидаемого числа детей. Следовательно, ключевая задача мер — сокращать барьеры между желаемым, ожидаемым и реально рождённым числом детей.</div><div class="vciom-table"><div class="vciom-row head"><div>Группа</div><div>Ожидаемое</div><div>Желаемое</div><div>Разрыв</div></div><div class="vciom-row"><div>Все опрошенные</div><div>${n(all.expected_children,1)}</div><div>${n(all.desired_children,1)}</div><div>+${n(all.desired_expected_gap,1)}</div></div>${sexRows}</div></div></div><div class="vciom-source">Источник: ВЦИОМ, аналитический обзор «Семья и брак в России XXI века», 2025. Метод: телефонный опрос «ВЦИОМ-Спутник», 1600 респондентов 18+. Фактический СКР 2025 — локальный статистический слой платформы.</div></div></section>`;
  }
  function render(data){
    if(document.getElementById('vciom-2025-intentions')) return;
    const mount = document.getElementById('vciom2025Mount');
    if(!mount) return;
    css();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = sectionHTML(data).trim();
    mount.replaceChildren(wrapper.firstElementChild);
    lastState = {
      loaded: true,
      mountId: 'vciom2025Mount',
      source: data === FALLBACK ? 'fallback' : 'local-json',
      runtimeExternalFetch: data.metadata?.runtime_external_fetch,
      actualTfr: Number(data.actual?.tfr_total),
      expectedChildren: Number(data.vciom_2025?.all?.expected_children),
      desiredChildren: Number(data.vciom_2025?.all?.desired_children),
      target2036Low: Number(data.tsargrad_targets?.target_2036_low),
      target2050High: Number(data.tsargrad_targets?.target_2050_high)
    };
  }
  window.VciomFertilityBlock = {
    getState: function(){ return Object.assign({}, lastState); }
  };
  ready(function(){
    fetch('data/vciom_reproductive_intentions_2025.json', {cache:'no-cache'})
      .then(function(r){ return r.ok ? r.json() : FALLBACK; })
      .then(render)
      .catch(function(){ render(FALLBACK); });
  });
})();
