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
  const CHART_COLORS = {teal:'#0f4f55', teal2:'#145b61', green:'#2f7d5c', gold:'#d8a238', amber:'#d98f45', red:'#b94b4b', cream:'#fffaf0', grid:'rgba(216,162,56,.22)'};
  const MAP_NO_DATA_COLOR = '#bfc2bd';
  const NO_DATA_TERRITORIES = new Set([
    'terr_donetskaya_narodnaya_respublika',
    'terr_luganskaya_narodnaya_respublika',
    'terr_zaporozhskaya_oblast',
    'terr_hersonskaya_oblast'
  ]);
  const REGION_SLUG_ALIASES = {
    terr_moskva:'moskva',
    terr_sankt_peterburg:'sankt_peterburg',
    terr_sevastopol:'sevastopol',
    terr_kabardino_balkarskaya_respublika:'kabardino_balkarskaya_respublika',
    terr_karachaevo_cherkesskaya_respublika:'karachaevo_cherkesskaya_respublika',
    terr_kemerovskaya_oblast_kuzbass:'kemerovskaya_oblast',
    terr_respublika_adygeya_adygeya:'respublika_adygeya',
    terr_respublika_severnaya_osetiya_alaniya:'respublika_severnaya_osetiya_alaniya',
    terr_respublika_tatarstan_tatarstan:'respublika_tatarstan',
    terr_udmurtskaya_respublika:'udmurtskaya_respublika',
    terr_hanty_mansiyskiy_avtonomnyy_okrug_yugra_tyumenskaya_oblast:'hanty_mansiyskiy_avtonomnyy_okrug_yugra',
    terr_chechenskaya_respublika:'chechenskaya_respublika',
    terr_chuvashskaya_respublika_chuvashiya:'chuvashskaya_respublika'
  };
  const state = {
    summary:void 0,
    geo:void 0,
    selectedRegion:void 0,
    regionData:void 0,
    filtered:[],
    selectedSettlement:void 0,
    rendered:[],
    renderedRegions:[],
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
  function classColor(code){
    return {A:CHART_COLORS.green, B:CHART_COLORS.gold, C:CHART_COLORS.amber, D:CHART_COLORS.red}[code] || CHART_COLORS.teal;
  }
  function chartColorForScore(v){
    v = Number(v) || 0;
    if(v < 45) return CHART_COLORS.red;
    if(v < 60) return CHART_COLORS.amber;
    if(v < 75) return CHART_COLORS.gold;
    if(v < 90) return CHART_COLORS.teal2;
    return CHART_COLORS.green;
  }
  function textColorForFill(color){
    return (color === CHART_COLORS.gold || color === CHART_COLORS.amber) ? '#111820' : CHART_COLORS.cream;
  }
  function classBadge(code){ return `<span class="class-badge class-${code}">${code} · ${CLASS_LABELS[code] || ''}</span>`; }
  function mixColor(a, b, t){
    return a.map((v, i)=>Math.round(v + (b[i]-v)*t));
  }
  function rgbText(rgb){ return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`; }
  function scoreDomain(){
    const values=(state.summary?.regions || []).map(r=>Number(r.avg_score)).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!values.length) return {min:0,max:100};
    const q = p => values[Math.min(values.length-1, Math.max(0, Math.round((values.length-1)*p)))];
    const min=q(.04), max=q(.96);
    return max > min ? {min,max} : {min:min-1,max:max+1};
  }
  function colorForRegionScore(score){
    if(!Number.isFinite(Number(score))) return MAP_NO_DATA_COLOR;
    const domain=scoreDomain();
    const t=Math.max(0, Math.min(1, (Number(score)-domain.min)/(domain.max-domain.min || 1)));
    const stops=[
      {t:0, rgb:[177,75,75]},
      {t:.32, rgb:[219,142,64]},
      {t:.62, rgb:[216,162,56]},
      {t:.82, rgb:[20,91,97]},
      {t:1, rgb:[47,125,92]}
    ];
    let left=stops[0], right=stops[stops.length-1];
    for(let i=1;i<stops.length;i+=1){
      if(t <= stops[i].t){ left=stops[i-1]; right=stops[i]; break; }
    }
    return rgbText(mixColor(left.rgb, right.rgb, (t-left.t)/(right.t-left.t || 1)));
  }
  function featureRegionSlug(props){
    if(!props || NO_DATA_TERRITORIES.has(props.territory_id)) return null;
    const direct=props.region_slug || REGION_SLUG_ALIASES[props.territory_id];
    if(direct && regionBySlug(direct)) return direct;
    const raw=String(props.territory_id || '').replace(/^terr_/, '');
    if(raw && regionBySlug(raw)) return raw;
    return null;
  }
  function regionForFeature(props){
    const slug=featureRegionSlug(props);
    return slug ? regionBySlug(slug) : null;
  }
  function topDeficit(region){
    return Object.entries(region?.top_deficits || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'нет данных';
  }
  function readyShare(region){
    const pop=Number(region?.population || 0);
    const ready=Number(region?.class_population?.A || 0) + Number(region?.class_population?.B || 0);
    return pop ? ready/pop*100 : null;
  }

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
      if(regionSlug && featureRegionSlug(p) !== regionSlug) continue;
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
    state.renderedRegions=[];
    for(const f of state.geo.features || []){
      const props=f.properties || {};
      const slug=featureRegionSlug(props);
      const region=regionForFeature(props);
      const score=Number(region?.avg_score);
      const hasData=region && Number.isFinite(score);
      const isActive=activeSlug && slug===activeSlug;
      const fill=hasData ? colorForRegionScore(score) : MAP_NO_DATA_COLOR;
      ctx.fillStyle = activeSlug
        ? (isActive ? 'rgba(216,162,56,.38)' : (hasData ? 'rgba(15,79,85,.08)' : 'rgba(191,194,189,.42)'))
        : (hasData ? colorToRgba(fill, .68) : colorToRgba(fill, .78));
      ctx.strokeStyle = isActive ? '#0f4f55' : 'rgba(255,255,255,.9)';
      ctx.lineWidth = isActive ? 2.0 : 0.7;
      const geom=f.geometry; if(!geom) continue;
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      const path = new Path2D();
      for(const poly of polys || []){
        for(const ring of poly){
          ring.forEach((pt,i)=>{ const [x,y]=projectPoint(pt[0],pt[1],transform); if(i===0) path.moveTo(x,y); else path.lineTo(x,y); });
          path.closePath();
        }
      }
      ctx.fill(path); ctx.stroke(path);
      let labelX=null, labelY=null;
      if(Number.isFinite(Number(props.label_lon)) && Number.isFinite(Number(props.label_lat))){
        [labelX,labelY]=projectPoint(props.label_lon, props.label_lat, transform);
      }
      state.renderedRegions.push({path, props, slug, region, score, hasData, x:labelX, y:labelY});
    }
  }
  function hexToRgba(hex, a){
    const n=parseInt(hex.replace('#',''),16); const r=(n>>16)&255, g=(n>>8)&255, b=n&255; return `rgba(${r},${g},${b},${a})`;
  }
  function colorToRgba(color, a){
    if(String(color).startsWith('#')) return hexToRgba(color, a);
    const m=String(color).match(/\d+/g);
    if(!m || m.length < 3) return color;
    return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
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
  function canvasPoint(evt){
    const canvas=$('infraMapCanvas'); const rect=canvas.getBoundingClientRect(); const ratio=canvas.width/rect.width;
    return {canvas, x:(evt.clientX-rect.left)*ratio, y:(evt.clientY-rect.top)*ratio, ratio};
  }
  function regionAt(evt){
    const {canvas, x, y}=canvasPoint(evt);
    const ctx=canvas.getContext('2d');
    for(let i=state.renderedRegions.length-1;i>=0;i-=1){
      const hit=state.renderedRegions[i];
      if(ctx.isPointInPath(hit.path, x, y)) return hit;
    }
    return null;
  }
  function regionTooltip(hit){
    const name=hit.region?.subject || hit.props?.territory_name || hit.props?.Name_full || 'Субъект РФ';
    if(!hit.region){
      return `<b>${esc(name)}</b><br>Инфраструктурные данные не загружены`;
    }
    return `<b>${esc(name)}</b><br>Индекс: <b>${fmt(hit.region.avg_score,1)}</b><br>Поселений: ${fmt(hit.region.settlements)}<br>Население: ${fmt(hit.region.population)}<br>Класс A+B: ${pct(readyShare(hit.region),1)}<br>Главный дефицит: ${esc(topDeficit(hit.region))}`;
  }
  function setupMapEvents(){
    const canvas=$('infraMapCanvas'), tip=$('infraTooltip');
    canvas.addEventListener('mousemove', evt=>{
      const hit=nearestRendered(evt);
      if(hit){
        canvas.style.cursor='pointer';
        tip.style.display='block'; tip.style.left=`${evt.offsetX+18}px`; tip.style.top=`${evt.offsetY+18}px`;
        tip.innerHTML=`<b>${esc(hit.r.n)}</b><br>${esc(hit.r.m)}<br>Индекс: <b>${fmt(hit.r.s,1)}</b> · ${esc(hit.r.cl)}<br>Население: ${fmt(hit.r.p)}`;
        return;
      }
      const regionHit=regionAt(evt);
      if(!regionHit){ canvas.style.cursor='crosshair'; tip.style.display='none'; return; }
      canvas.style.cursor=regionHit.region ? 'pointer' : 'not-allowed';
      tip.style.display='block'; tip.style.left=`${evt.offsetX+18}px`; tip.style.top=`${evt.offsetY+18}px`;
      tip.innerHTML=regionTooltip(regionHit);
    });
    canvas.addEventListener('mouseleave',()=>{tip.style.display='none'; canvas.style.cursor='crosshair';});
    canvas.addEventListener('click', evt=>{
      const hit=nearestRendered(evt);
      if(hit){ state.selectedSettlement=hit.r; renderPassport(); drawMap(); return; }
      const regionHit=regionAt(evt);
      if(regionHit?.region){
        $('infraSubject').value=regionHit.slug;
        onSubjectChange();
      }
    });
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
  function regionBySlug(slug){ return (state.summary?.regions || []).find(r=>r.region_slug===slug); }

  async function onSubjectChange(){
    const slug=$('infraSubject').value;
    state.selectedRegion=slug;
    state.selectedSettlement=void 0;
    if(slug==='all'){
      state.regionData=void 0; state.filtered=[]; fillMunicipalSelector([]);
    } else {
      state.regionData=void 0;
      state.filtered=[];
      fillMunicipalSelector([]);
      const nextRegionData=await loadJson(`${ROOT}/by_region/${slug}.json`);
      if(state.selectedRegion!==slug || $('infraSubject').value!==slug) return;
      state.regionData=nextRegionData;
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
    const layoutBase={
      paper_bgcolor:'rgba(0,0,0,0)',
      plot_bgcolor:'rgba(255,250,240,.72)',
      margin:{l:44,r:18,t:24,b:48},
      font:{family:'system-ui, sans-serif', color:'#172427'},
      dragmode:false,
      xaxis:{gridcolor:CHART_COLORS.grid, zerolinecolor:'rgba(15,79,85,.30)', linecolor:'rgba(15,79,85,.34)', tickfont:{color:'#334845'}, titlefont:{color:'#0f4f55'}, fixedrange:true},
      yaxis:{gridcolor:CHART_COLORS.grid, zerolinecolor:'rgba(15,79,85,.30)', linecolor:'rgba(15,79,85,.34)', tickfont:{color:'#334845'}, titlefont:{color:'#0f4f55'}, fixedrange:true}
    };
    const plotConfig={
      displayModeBar:false,
      displaylogo:false,
      responsive:true,
      scrollZoom:false,
      modeBarButtonsToRemove:['zoom2d','pan2d','select2d','lasso2d','zoomIn2d','zoomOut2d','autoScale2d','resetScale2d']
    };
    const classOrder=['A','B','C','D'];
    const classPop=state.regionData
      ? classOrder.map(c=>arr.filter(r=>r.cc===c).reduce((a,r)=>a+(r.p||0),0))
      : classOrder.map(c=>(state.summary?.regions||[]).reduce((a,r)=>a+((r.class_population||{})[c]||0),0));
    const classColors=classOrder.map(classColor);
    Plotly.newPlot('infraClassChart',[{
      type:'bar',
      x:classOrder,
      y:classPop,
      text:classPop.map(v=>fmt(v)),
      customdata:classOrder.map(c=>CLASS_LABELS[c]),
      marker:{color:classColors, line:{color:'rgba(255,250,240,.95)', width:1}},
      textposition:'auto',
      textfont:{color:classColors.map(textColorForFill)},
      hovertemplate:'Класс %{x}: %{customdata}<br>%{text} чел.<extra></extra>'
    }],{...layoutBase,yaxis:{...layoutBase.yaxis,title:'население'},xaxis:{...layoutBase.xaxis,title:'класс готовности'}}, plotConfig);
    state.renderedCharts.push('infraClassChart');
    const munis = state.regionData ? (state.regionData.municipalities||[]).slice() : (state.summary?.regions||[]).map(r=>({n:r.subject,p:r.population,s:r.avg_score}));
    const top = munis.sort((a,b)=>b.s-a.s).slice(0,10).reverse();
    const topColors=top.map(x=>chartColorForScore(x.s));
    Plotly.newPlot('infraMunicipalChart',[{
      type:'bar',
      orientation:'h',
      y:top.map(x=>x.n),
      x:top.map(x=>x.s),
      text:top.map(x=>fmt(x.s,1)),
      marker:{color:topColors, line:{color:'rgba(255,250,240,.95)', width:1}},
      textposition:'inside',
      insidetextanchor:'end',
      textfont:{color:topColors.map(textColorForFill)},
      hovertemplate:'%{y}<br>Индекс %{text}<extra></extra>'
    }],{...layoutBase,xaxis:{...layoutBase.xaxis,range:[0,100],title:'баллы'},yaxis:{...layoutBase.yaxis,automargin:true}}, plotConfig);
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
    const componentColors=avgComponents.slice().reverse().map(chartColorForScore);
    Plotly.newPlot('infraComponentsChart',[{
      type:'bar',
      orientation:'h',
      y:COMPONENTS.map(c=>c[1]).reverse(),
      x:avgComponents.slice().reverse(),
      text:avgComponents.slice().reverse().map(v=>fmt(v,1)),
      marker:{color:componentColors, line:{color:'rgba(255,250,240,.95)', width:1}},
      textposition:'inside',
      insidetextanchor:'end',
      textfont:{color:componentColors.map(textColorForFill)},
      hovertemplate:'%{y}<br>%{text} баллов<extra></extra>'
    }],{...layoutBase,margin:{l:118,r:18,t:24,b:42},xaxis:{...layoutBase.xaxis,range:[0,100],title:'баллы'},yaxis:{...layoutBase.yaxis,automargin:true}}, plotConfig);
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
    const canvas=$('infraMapCanvas');
    const rect=canvas?.getBoundingClientRect?.();
    const ratio=canvas && rect?.width ? canvas.width/rect.width : 1;
    const ctx=canvas?.getContext?.('2d');
    const firstHit=state.renderedRegions.find(r=>r.region && Number.isFinite(r.x) && Number.isFinite(r.y) && (!ctx || ctx.isPointInPath(r.path, r.x, r.y)));
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
      renderedRegions: state.renderedRegions.length,
      cartogramValueCount: state.renderedRegions.filter(r=>r.region && r.hasData).length,
      noDataRegionCount: state.renderedRegions.filter(r=>!r.region || !r.hasData).length,
      firstSelectableRegionHit: firstHit ? {
        slug: firstHit.slug,
        subject: firstHit.region.subject,
        x: firstHit.x/ratio,
        y: firstHit.y/ratio
      } : null,
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
