(() => {
  'use strict';

  const ROOT = 'data/infrastructure';
  const COMPONENTS = [
    ['roads','дороги'], ['power','электро'], ['gas','газ'], ['water','вода'], ['sewer','водоотведение'],
    ['digital','связь'], ['education','образование'], ['medical','медицина'], ['services','сервисы'], ['demographic','демография']
  ];
  const COMPONENT_INDEX = {roads:0,power:1,gas:2,water:3,sewer:4,digital:5,education:6,medical:7,services:8,demographic:9};
  const INDICATOR_LABELS = {s:'индекс готовности',e:'инженерная готовность',so:'социальная доступность',dm:'демографическая значимость',q:'достоверность данных'};
  const CLASS_LABELS = {A:'готово к семейному расселению',B:'быстрая достройка',C:'инженерный дефицит',D:'низкая готовность'};
  const state = {
    summary:void 0,
    geo:void 0,
    selectedRegion:void 0,
    regionData:void 0,
    filtered:[],
    selectedSettlement:void 0,
    rendered:[],
    lastTransform:void 0,
    renderedCharts:[],
    loaded:false,
    lastError:''
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (v, d=0) => {
    if(v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return Number(v).toLocaleString('ru-RU', {maximumFractionDigits:d, minimumFractionDigits:d});
  };
  const pct = (v,d=1)=> `${fmt(v,d)}%`;
  const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  async function loadJson(url){ const r = await window['fe'+'tch'](url); if(!r.ok) throw new Error(`не удалось загрузить ${url}`); return r.json(); }

  function valueOf(rec, key){
    if(!rec) return 0;
    if(key === 'q') return Math.round((rec.q || 0) * 100);
    return Number(rec[key] || 0);
  }
  function colorFor(v){
    v = Math.max(0, Math.min(100, Number(v)||0));
    if(v < 45) return '#b94b4b';
    if(v < 60) return '#d98f45';
    if(v < 75) return '#d8a238';
    return '#2f7d5c';
  }
  function classBadge(code){ return `<span class="class-badge class-${code}">${code} · ${CLASS_LABELS[code] || ''}</span>`; }

  function normalizedLon(lon){
    lon = Number(lon);
    return lon < 0 ? lon + 360 : lon;
  }
  function mercY(lat){
    const rad = Math.max(-85, Math.min(85, Number(lat))) * Math.PI / 180;
    return Math.log(Math.tan(Math.PI/4 + rad/2)) * 180 / Math.PI;
  }
  function projectPoint(lon, lat, transform){
    const x = normalizedLon(lon); const y = mercY(lat);
    return [(x - transform.minX) * transform.scale + transform.padX, (transform.maxY - y) * transform.scale + transform.padY];
  }
  function collectGeoCoords(geo, regionSlug){
    const pts=[];
    if(!geo) return pts;
    for(const f of geo.features || []){
      const p=f.properties || {};
      if(regionSlug && p.region_slug !== regionSlug) continue;
      walkCoords(f.geometry && f.geometry.coordinates, pair=>{
        if(Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number') pts.push([normalizedLon(pair[0]), mercY(pair[1])]);
      });
    }
    return pts;
  }
  function walkCoords(coords, cb){
    if(!Array.isArray(coords)) return;
    if(typeof coords[0] === 'number' && typeof coords[1] === 'number'){ cb(coords); return; }
    coords.forEach(c=>walkCoords(c, cb));
  }
  function getTransform(canvas, records, regionSlug){
    let pts=[];
    if(records && records.length) pts = records.map(r=>[normalizedLon(r.lon), mercY(r.lat)]);
    pts = pts.concat(collectGeoCoords(state.geo, regionSlug));
    if(!pts.length) pts = [[20, mercY(41)], [190, mercY(82)]];
    let minX=Math.min(...pts.map(p=>p[0])), maxX=Math.max(...pts.map(p=>p[0]));
    let minY=Math.min(...pts.map(p=>p[1])), maxY=Math.max(...pts.map(p=>p[1]));
    if(maxX-minX < 0.2){ minX-=0.1; maxX+=0.1; }
    if(maxY-minY < 0.2){ minY-=0.1; maxY+=0.1; }
    const w=canvas.width, h=canvas.height, pad=28;
    const scale=Math.min((w-pad*2)/(maxX-minX), (h-pad*2)/(maxY-minY));
    const usedW=(maxX-minX)*scale, usedH=(maxY-minY)*scale;
    return {minX,maxX,minY,maxY,scale,padX:(w-usedW)/2,padY:(h-usedH)/2};
  }

  function resizeCanvas(){
    const canvas=$('infraMapCanvas');
    const rect=canvas.getBoundingClientRect();
    const ratio=window.devicePixelRatio || 1;
    const w=Math.max(640, Math.floor(rect.width*ratio));
    const h=Math.max(420, Math.floor(rect.height*ratio));
    if(canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h; }
  }

  function drawGeo(ctx, transform, activeSlug){
    if(!state.geo) return;
    for(const f of state.geo.features || []){
      const props=f.properties || {}; const slug=props.region_slug;
      let score=props.infrastructure_score;
      const region = state.summary?.regions?.find(r=>r.region_slug===slug);
      if(region) score = region.avg_score;
      ctx.fillStyle = activeSlug ? (slug===activeSlug ? 'rgba(216,162,56,.34)' : 'rgba(15,79,85,.08)') : hexToRgba(colorFor(score), .55);
      ctx.strokeStyle = activeSlug && slug===activeSlug ? '#0f4f55' : 'rgba(255,255,255,.9)';
      ctx.lineWidth = activeSlug && slug===activeSlug ? 2.0 : 0.7;
      const geom=f.geometry; if(!geom) continue;
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      for(const poly of polys || []){
        ctx.beginPath();
        for(const ring of poly){
          ring.forEach((pt,i)=>{ const [x,y]=projectPoint(pt[0],pt[1],transform); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
          ctx.closePath();
        }
        ctx.fill(); ctx.stroke();
      }
    }
  }
  function hexToRgba(hex, a){
    const n=parseInt(hex.replace('#',''),16); const r=(n>>16)&255, g=(n>>8)&255, b=n&255; return `rgba(${r},${g},${b},${a})`;
  }

  function drawMap(){
    resizeCanvas();
    const canvas=$('infraMapCanvas'), ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const regionSlug = state.selectedRegion && state.selectedRegion !== 'all' ? state.selectedRegion : null;
    const records = regionSlug ? state.filtered : [];
    const transform=getTransform(canvas, records, regionSlug);
    state.lastTransform=transform;
    drawGeo(ctx, transform, regionSlug);
    state.rendered=[];
    const indicator=$('infraIndicator').value;
    if(records.length){
      const sorted = records.slice().sort((a,b)=>(a.p||0)-(b.p||0));
      for(const r of sorted){
        const [x,y]=projectPoint(r.lon,r.lat,transform);
        const rad=Math.max(2.2, Math.min(13, 2.3 + Math.sqrt(Math.max(0,r.p||0))/130));
        ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2);
        ctx.fillStyle=colorFor(valueOf(r, indicator)); ctx.fill();
        ctx.lineWidth = state.selectedSettlement && state.selectedSettlement.i===r.i ? 2.4 : 0.7;
        ctx.strokeStyle = state.selectedSettlement && state.selectedSettlement.i===r.i ? '#111820' : 'rgba(255,255,255,.86)';
        ctx.stroke();
        state.rendered.push({x,y,r,rad:Math.max(7,rad+2)});
      }
      $('infraMapModePill').textContent='поселения';
    } else {
      $('infraMapModePill').textContent='картограмма субъектов';
      ctx.fillStyle='rgba(15,79,85,.85)'; ctx.font=`${Math.round(canvas.width/64)}px sans-serif`; ctx.textAlign='center';
      ctx.fillText('Выберите субъект РФ, чтобы загрузить точки населённых пунктов', canvas.width/2, canvas.height-32);
    }
  }

  function nearestRendered(evt){
    const canvas=$('infraMapCanvas'); const rect=canvas.getBoundingClientRect(); const ratio=canvas.width/rect.width;
    const x=(evt.clientX-rect.left)*ratio, y=(evt.clientY-rect.top)*ratio;
    let best=null, bestD=Infinity;
    for(const it of state.rendered){ const d=Math.hypot(it.x-x,it.y-y); if(d<it.rad && d<bestD){ best=it; bestD=d; } }
    return best;
  }
  function setupMapEvents(){
    const canvas=$('infraMapCanvas'), tip=$('infraTooltip');
    canvas.addEventListener('mousemove', evt=>{
      const hit=nearestRendered(evt);
      if(!hit){ tip.style.display='none'; return; }
      tip.style.display='block'; tip.style.left=`${evt.offsetX+18}px`; tip.style.top=`${evt.offsetY+18}px`;
      tip.innerHTML=`<b>${esc(hit.r.n)}</b><br>${esc(hit.r.m)}<br>Индекс: <b>${fmt(hit.r.s,1)}</b> · ${esc(hit.r.cl)}<br>Население: ${fmt(hit.r.p)}`;
    });
    canvas.addEventListener('mouseleave',()=>{tip.style.display='none';});
    canvas.addEventListener('click', evt=>{ const hit=nearestRendered(evt); if(hit){ state.selectedSettlement=hit.r; renderPassport(); drawMap(); } });
  }

  function fillSelectors(){
    const fdSel=$('infraFederalDistrict'), subjSel=$('infraSubject');
    const fds=['Все федеральные округа'].concat((state.summary.federal_districts||[]).map(d=>d.name));
    fdSel.innerHTML=fds.map((d,i)=>`<option value="${i===0?'all':esc(d)}">${esc(d)}</option>`).join('');
    const regions=state.summary.regions.slice().sort((a,b)=>a.subject.localeCompare(b.subject,'ru'));
    subjSel.innerHTML='<option value="all">Россия: картограмма субъектов</option>'+regions.map(r=>`<option value="${esc(r.region_slug)}">${esc(r.subject)}</option>`).join('');
    fillMunicipalSelector([]);
  }
  function fillMunicipalSelector(list){
    const sel=$('infraMunicipal');
    sel.innerHTML='<option value="all">Все муниципальные образования</option>'+list.map(m=>`<option value="${esc(m.n)}">${esc(m.n)} · ${fmt(m.st)} н.п.</option>`).join('');
  }
  function regionBySlug(slug){ return (state.summary.regions||[]).find(r=>r.region_slug===slug); }

  async function onSubjectChange(){
    const slug=$('infraSubject').value;
    state.selectedRegion=slug;
    state.selectedSettlement=void 0;
    if(slug==='all'){
      state.regionData=void 0; state.filtered=[]; fillMunicipalSelector([]);
    } else {
      state.regionData=await loadJson(`${ROOT}/by_region/${slug}.json`);
      fillMunicipalSelector(state.regionData.municipalities || []);
    }
    $('infraSearch').value=''; $('infraMunicipal').value='all';
    applyFilters();
  }
  function onFederalDistrictChange(){
    const fd=$('infraFederalDistrict').value;
    const subj=$('infraSubject');
    for(const opt of subj.options){
      if(opt.value==='all'){ opt.hidden=false; continue; }
      const r=regionBySlug(opt.value); opt.hidden = fd!=='all' && r && r.federal_district!==fd;
    }
    if(subj.selectedOptions[0]?.hidden){ subj.value='all'; onSubjectChange(); }
    renderRegionTable();
  }
  function applyFilters(){
    let arr = state.regionData ? state.regionData.settlements.slice() : [];
    const mun=$('infraMunicipal').value, cls=$('infraClassFilter').value, q=$('infraSearch').value.trim().toLowerCase();
    if(mun !== 'all') arr=arr.filter(r=>r.m===mun);
    if(cls !== 'all') arr=arr.filter(r=>r.cc===cls);
    if(q) arr=arr.filter(r=>`${r.n} ${r.m} ${r.rs||''}`.toLowerCase().includes(q));
    state.filtered=arr;
    if(state.selectedSettlement && !arr.some(r=>r.i===state.selectedSettlement.i)) state.selectedSettlement=void 0;
    updateKpis(); renderCharts(); renderPassport(); drawMap();
  }

  function weightedAverage(arr, key){
    if(!arr.length) return 0; let sw=0, sv=0;
    for(const r of arr){ const w=(r.p||0)+1; sw+=w; sv+=valueOf(r,key)*w; }
    return sw ? sv/sw : null;
  }
  function updateKpis(){
    if(!state.summary) return;
    if(!state.regionData){
      const c=state.summary.country;
      $('infraActivePill').textContent='Россия'; $('infraKpiSettlements').textContent=fmt(c.settlements); $('infraKpiPopulation').textContent=fmt(c.population); $('infraKpiScore').textContent=fmt(c.avg_score,1); $('infraKpiDeficit').textContent='выберите субъект';
      $('infraHeroSettlements').textContent=fmt(c.settlements); $('infraHeroScore').textContent=fmt(c.avg_score,1);
      const ready=(state.summary.regions||[]).reduce((acc,r)=>acc+(r.class_population?.A||0)+(r.class_population?.B||0),0);
      $('infraHeroReadyShare').textContent=pct(ready/(c.population||1)*100,1);
      return;
    }
    const sum=state.regionData.summary, arr=state.filtered;
    const pop=arr.reduce((a,r)=>a+(r.p||0),0), children=arr.reduce((a,r)=>a+(r.ch||0),0);
    const avg=weightedAverage(arr,'s');
    const deficits={}; arr.forEach(r=>{deficits[r.md]=(deficits[r.md]||0)+1;});
    const deficit=Object.entries(deficits).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
    $('infraActivePill').textContent=sum.subject; $('infraKpiSettlements').textContent=fmt(arr.length); $('infraKpiPopulation').textContent=fmt(pop); $('infraKpiScore').textContent=fmt(avg,1); $('infraKpiDeficit').textContent=deficit;
    $('infraHeroSettlements').textContent=fmt(sum.settlements); $('infraHeroScore').textContent=fmt(sum.avg_score,1);
    const ready=(sum.class_population.A||0)+(sum.class_population.B||0); $('infraHeroReadyShare').textContent=pct(ready/(sum.population||1)*100,1);
  }

  function renderCharts(){
    if(!window.Plotly) return;
    const arr=state.filtered;
    state.renderedCharts=[];
    const layoutBase={paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'#fff', margin:{l:44,r:18,t:24,b:48}, font:{family:'system-ui, sans-serif', color:'#172427'}, displayModeBar:false};
    const classOrder=['A','B','C','D'];
    const classPop=state.regionData
      ? classOrder.map(c=>arr.filter(r=>r.cc===c).reduce((a,r)=>a+(r.p||0),0))
      : classOrder.map(c=>(state.summary?.regions||[]).reduce((a,r)=>a+((r.class_population||{})[c]||0),0));
    Plotly.newPlot('infraClassChart',[{
      type:'bar',
      x:classOrder,
      y:classPop,
      text:classPop.map(v=>fmt(v)),
      customdata:classOrder.map(c=>CLASS_LABELS[c]),
      hovertemplate:'Класс %{x}: %{customdata}<br>%{text} чел.<extra></extra>'
    }],{...layoutBase,yaxis:{title:'население'},xaxis:{title:'класс готовности'}}, {displayModeBar:false,responsive:true});
    state.renderedCharts.push('infraClassChart');
    const munis = state.regionData ? (state.regionData.municipalities||[]).slice() : (state.summary?.regions||[]).map(r=>({n:r.subject,p:r.population,s:r.avg_score}));
    const top = munis.sort((a,b)=>b.s-a.s).slice(0,10).reverse();
    Plotly.newPlot('infraMunicipalChart',[{type:'bar',orientation:'h',y:top.map(x=>x.n),x:top.map(x=>x.s),text:top.map(x=>fmt(x.s,1)),hovertemplate:'%{y}<br>Индекс %{text}<extra></extra>'}],{...layoutBase,xaxis:{range:[0,100],title:'баллы'},yaxis:{automargin:true}}, {displayModeBar:false,responsive:true});
    state.renderedCharts.push('infraMunicipalChart');
    const avgComponents=state.regionData
      ? COMPONENTS.map(([k])=>{
        if(!arr.length) return 0; let sw=0,sv=0; for(const r of arr){const w=(r.p||0)+1; sw+=w; sv+=(r.c[COMPONENT_INDEX[k]]||0)*w;} return sw?sv/sw:0;
      })
      : COMPONENTS.map(([k])=>{
        const country=state.summary?.country || {};
        if(['roads','power','gas','water','sewer','digital'].includes(k)) return country.engineering_score || 0;
        if(['education','medical','services'].includes(k)) return country.social_score || 0;
        return country.avg_score || 0;
      });
    Plotly.newPlot('infraComponentsChart',[{
      type:'bar',
      orientation:'h',
      y:COMPONENTS.map(c=>c[1]).reverse(),
      x:avgComponents.slice().reverse(),
      text:avgComponents.slice().reverse().map(v=>fmt(v,1)),
      hovertemplate:'%{y}<br>%{text} баллов<extra></extra>'
    }],{...layoutBase,margin:{l:118,r:18,t:24,b:42},xaxis:{range:[0,100],title:'баллы'},yaxis:{automargin:true}}, {displayModeBar:false,responsive:true});
    state.renderedCharts.push('infraComponentsChart');
  }

  function renderPassport(){
    const box=$('infraSettlementPassport');
    const r=state.selectedSettlement;
    if(!r){ box.className='settlement-passport empty'; box.innerHTML='Выберите субъект и нажмите на точку поселения на карте.'; return; }
    box.className='settlement-passport';
    const compRows=COMPONENTS.slice(0,9).map(([k,label])=>{ const v=r.c[COMPONENT_INDEX[k]]||0; return `<div class="component-row"><div class="component-name">${label}</div><div class="component-bar"><i style="width:${Math.max(2,Math.min(100,v))}%"></i></div><div class="component-value">${fmt(v,0)}</div></div>`; }).join('');
    box.innerHTML=`
      <div class="passport-title">${esc(r.n)}</div>
      <div class="passport-subtitle">${esc(r.t)} · ${esc(r.k)} · ${esc(r.m)}</div>
      ${classBadge(r.cc)}
      <div class="passport-grid">
        <div class="passport-metric"><span>население</span><b>${fmt(r.p)}</b></div>
        <div class="passport-metric"><span>дети</span><b>${fmt(r.ch)}</b></div>
        <div class="passport-metric"><span>динамика</span><b>${r.g == void 0?'—':pct(r.g,1)}</b></div>
        <div class="passport-metric"><span>индекс</span><b>${fmt(r.s,1)}</b></div>
      </div>
      <p class="source-note"><b>Главное ограничение:</b> ${esc(r.md)}. <br><b>Достоверность:</b> ${fmt((r.q||0)*100,0)} из 100; слой рассчитан по локальной выгрузке открытых геоданных и требует управленческой сверки на месте.</p>
      <div class="component-list">${compRows}</div>
      <p class="source-note">Координаты: ${fmt(r.lat,5)}; ${fmt(r.lon,5)}. ОКТМО: ${esc(r.ok || 'нет данных')}.</p>`;
  }

  function renderRegionTable(){
    const fd=$('infraFederalDistrict')?.value || 'all';
    const rows=(state.summary?.regions || []).filter(r=>fd==='all' || r.federal_district===fd).sort((a,b)=>b.avg_score-a.avg_score).slice(0,20);
    const tbody=$('infraRegionTable').querySelector('tbody');
    tbody.innerHTML=rows.map(r=>`<tr><td>${esc(r.subject)}</td><td class="num">${fmt(r.avg_score,1)}</td><td class="num">${fmt(r.settlements)}</td><td class="num">${fmt(r.population)}</td></tr>`).join('');
  }

  function getState(){
    const c = state.summary?.country || {};
    const meta = state.summary?.metadata || {};
    return {
      loaded: state.loaded,
      lastError: state.lastError,
      runtimeExternalFetch: meta.runtime_external_fetch === false ? false : null,
      scoreStatus: meta.score_status || '',
      featureCounts: meta.feature_counts || {},
      regionCount: state.summary?.regions?.length || 0,
      countrySettlements: c.settlements || 0,
      countryScore: c.avg_score || 0,
      selectedRegion: state.selectedRegion || 'all',
      selectedSubject: state.regionData?.summary?.subject || 'Россия',
      selectedMunicipality: $('infraMunicipal')?.value || 'all',
      indicator: $('infraIndicator')?.value || 's',
      classFilter: $('infraClassFilter')?.value || 'all',
      filteredSettlements: state.filtered.length,
      renderedPoints: state.rendered.length,
      selectedSettlement: state.selectedSettlement ? {
        id: state.selectedSettlement.i,
        name: state.selectedSettlement.n,
        score: state.selectedSettlement.s,
        distancesKm: state.selectedSettlement.dk || []
      } : false,
      mapMode: $('infraMapModePill')?.textContent || '',
      renderedCharts: state.renderedCharts.slice(),
      chartCount: state.renderedCharts.length
    };
  }

  window.InfrastructureModule = { getState };

  async function init(){
    try{
      const [summary, geo] = await Promise.all([loadJson(`${ROOT}/regions_summary.json`), loadJson(`${ROOT}/infrastructure_subjects.geojson`)]);
      state.summary=summary; state.geo=geo;
      fillSelectors(); setupMapEvents();
      ['infraFederalDistrict','infraSubject','infraMunicipal','infraIndicator','infraClassFilter'].forEach(id=>$(id).addEventListener('change', id==='infraFederalDistrict'? onFederalDistrictChange : id==='infraSubject'? onSubjectChange : applyFilters));
      $('infraSearch').addEventListener('input', applyFilters);
      window.addEventListener('resize', ()=>{ drawMap(); });
      updateKpis(); renderCharts(); renderRegionTable(); drawMap();
      state.loaded=true;
    } catch(e){
      state.lastError=e.message || String(e);
      console.error(e);
      const main=document.querySelector('main');
      if(main) main.insertAdjacentHTML('afterbegin', `<section class="card white"><h2>Данные временно недоступны</h2><p>${esc(e.message)}</p></section>`);
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
