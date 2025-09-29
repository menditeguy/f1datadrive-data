// gp-page-v2.1.js  ASCII_SAFE v20250929c-forix-en-fixed
(function(){
  'use strict';

  function qs(sel, root){ return (root||document).querySelector(sel); }
  function isNumeric(v){ return v !== null && v !== '' && !isNaN(v); }
  function getURLParam(k, d){ const u=new URL(window.location.href); const v=u.searchParams.get(k); return (v===null?d:v); }

  // --- ms -> mm:ss.mmm
  function fmtMs(v){
    if (v == null || isNaN(Number(v))) return v;
    const ms = Number(v);
    const s  = Math.floor(ms/1000);
    const mm = Math.floor(s/60);
    const ss = s % 60;
    const mmm= ms % 1000;
    return mm + ':' + String(ss).padStart(2,'0') + '.' + String(mmm).padStart(3,'0');
  }

  // --- drivers lookup
  let DRIVERS = null;
  function loadDrivers(base){
    return fetch(base + '/lookups/drivers.min.json',{cache:'no-store'})
      .then(r=>{ if(!r.ok) throw new Error('drivers.min.json HTTP '+r.status); return r.json(); })
      .then(j=>{ DRIVERS=j; });
  }
  function driverName(id){
    if (id==null) return '';
    const k=String(id);
    return (DRIVERS && DRIVERS[k]) ? DRIVERS[k] : String(id);
  }
  function withDriverNames(rows){
    if (!Array.isArray(rows)) return [];
    return rows.map(r=>{
      const out={}; for (const k in r) out[k]=r[k];
      const id = (r && (r.driver_id!=null ? r.driver_id : (r.DriverId!=null ? r.DriverId : (r.driverId!=null ? r.driverId : null))));
      const fromLookup = (id!=null && DRIVERS) ? DRIVERS[String(id)] : null;
      out.driver = fromLookup || r.driver_name || r.driver || r.name || (id!=null ? String(id) : '');
      return out;
    });
  }

  // --- helpers
  function pick(r, keys){
    for (let i=0;i<keys.length;i++){ const k=keys[i]; if (r && r[k]!=null && r[k]!=="") return r[k]; }
    return null;
  }
  function msFromRow(r){
    // couvre les variantes rencontrées dans tes JSON
    const m = pick(r, ['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds','bestTimeMs','bestTime_ms']);
    const n = Number(m);
    return Number.isFinite(n) ? n : null;
  }

  // --- time/reason discrimination
  const RE_TIME = /(\d+h|\d+m|\d+s|km\/h|\+\d)/i;  // temps de course typique
  function isFullRaceTimeString(s){ return typeof s==='string' && RE_TIME.test(s); }
  function isPlusGap(s){ return typeof s==='string' && s.trim().startsWith('+'); }

  // tiny FR->EN map for retirements (extendable)
  function translateReason(txt){
    if (!txt) return txt;
    const map = {
      "Boîte de vitesses":"Gearbox",
      "Accident":"Accident",
      "Accrochage":"Collision",
      "Aileron":"Wing",
      "Moteur":"Engine",
      "Transmission":"Transmission",
      "Suspension":"Suspension",
      "Hydraulique":"Hydraulics",
      "Essence":"Fuel",
      "Pneu":"Tyre",
      "Sortie de piste":"Off track",
      "Fixation de roue":"Wheel mounting",
      "Surchauffe":"Overheating",
      "Accélérateur":"Throttle",
      "Jante":"Wheel rim",
      "Pas parti":"Did not start",
      "Abandon":"Retired",
      "Disqualification":"Disqualified"
    };
    return map[txt] || txt;
  }

  // --- classement helpers (Forix-like)
  function toPos(row){ const v = (row.pos ?? row.position ?? 0); const n = Number(v); return Number.isFinite(n)?n:0; }
  function cmpPos(a,b){
    const pa=toPos(a), pb=toPos(b);
    if (pa>0 && pb>0) return pa - pb;               // classés d'abord (1..N)
    // DNF : tri laps desc
    const la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if (la!==lb) return lb - la;
    // égalité : position de piste/ordre en course si dispo
    const ra = Number(a.positionOrder) || Number(a.rank) || Number(a.driver_id) || 9999;
    const rb = Number(b.positionOrder) || Number(b.rank) || Number(b.driver_id) || 9999;
    return ra - rb;
  }

  // --- build rows (session-aware)
  function buildDisplayRows(rows, sessionCode){
    if (!Array.isArray(rows)) return [];

    // Pour EL1..Q4/MT : calcule bestMs pour gap
    let bestMs = null;
    rows.forEach(r=>{
      const ms = msFromRow(r);
      if (ms!=null) bestMs = (bestMs==null || ms<bestMs) ? ms : bestMs;
    });

    const isRace = (String(sessionCode||'').toUpperCase()==='COURSE');

    return rows.map(r=>{
      const pos    = pick(r,['position','pos','rank','rang']);       // position affichée
      const num    = pick(r,['num','num_car','number','no','car_no','car']);
      const team   = pick(r,['team','team_name','teams','teams_name']) || '';
      const motor  = pick(r,['motor_name','engine','moteur']);
      const lapsRaw= pick(r,['laps','laps_completed','nb_laps','nb_tours','tours']);
      const drvId  = pick(r,['driver_id','DriverId','driverId']);
      const name   = driverName(drvId);

      // Laps : afficher 0 si 0, sinon valeur, pas de '' forcé
      const laps = (lapsRaw==='' || lapsRaw==null) ? '' : Number(lapsRaw);

      let timeDisplay = '';     // colonne "Time"
      let gapReason   = '';     // colonne "Gap / Reason"
      let positionOrder = pick(r,['positionOrder']); // tie-breaker éventuel

      if (!isRace && bestMs!=null){
        // Essais/Qualifs/MT : utiliser ms si dispo
        const ms = msFromRow(r);
        const timeRw = pick(r,['best_lap_time_raw','best_time','time_raw','best_lap']);
        timeDisplay = timeRw || (ms!=null ? fmtMs(ms) : '');
        if (ms!=null && bestMs!=null && ms>bestMs){
          gapReason = '+' + fmtMs(ms - bestMs);
        } else {
          gapReason = '';
        }
      } else {
        // COURSE : séparer temps final vs raison d'abandon vs +gap
        const delta = pick(r,['delta','gap','race_gap']);            // si tes JSON fournissent un gap direct
        const timeLike = delta;               // temps ou motif, selon les cas

        if (isPlusGap(delta)) gapReason = delta;

        if (timeLike){
          if (isFullRaceTimeString(timeLike)){
            // vrai temps de course -> dans Time
            timeDisplay = timeLike;
          } else {
            // texte (raison) -> dans Gap/Reason, traduit
            gapReason = translateReason(timeLike);
          }
        }
      }

      return {
        pos: (pos!=null ? Number(pos) : null),
        no:  (num!=null ? String(num) : ''),
        driver: name,
        car_engine: team + (motor ? ('/' + motor) : ''),
        laps: laps,
        time: timeDisplay,
        gap_reason: gapReason,
        rank: pick(r,['rank']) || null,
        positionOrder: positionOrder || null,
        driver_id: drvId || null
      };
    });
  }

  // --- state & UI
  const app      = qs('#f1-gp-app');
  const titleEl  = qs('#gpTitle', app);
  const statusEl = qs('#status', app);
  const selEl    = qs('#sessionSelect', app);
  const tableBox = qs('#sessionTable', app);

  const state = { raceId:null, sessionCode:null, sessions:[], rows:[], columns:[], sort:{key:null,dir:1}, page:1, pageSize:25 };

  function showError(msg){ statusEl.textContent=msg; statusEl.style.color='#b00'; }
  function showInfo(msg){  statusEl.textContent=msg; statusEl.style.color='#666'; }

  function renderPager(){
    const total = state.rows.length;
    const totalPages = Math.max(1, Math.ceil(total/state.pageSize));
    state.page = Math.min(state.page, totalPages);

    const wrap=document.createElement('div');
    wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px'; wrap.style.margin='10px 0';

    const info=document.createElement('span');
    info.style.fontSize='12px';
    info.textContent='Total: ' + total + ' rows - Page ' + state.page + '/' + totalPages;
    wrap.appendChild(info);

    function mkBtn(text,on,dis){
      const b=document.createElement('button');
      b.textContent=text; b.disabled=!!dis;
      b.style.padding='6px 10px'; b.style.border='1px solid #ddd'; b.style.borderRadius='8px';
      b.style.background=dis?'#f5f5f5':'#fff'; b.style.cursor=dis?'not-allowed':'pointer';
      b.onclick=on; return b;
    }
    wrap.appendChild(mkBtn('<<', ()=>{state.page=1;drawTable();}, state.page===1));
    wrap.appendChild(mkBtn('<' , ()=>{state.page=Math.max(1,state.page-1);drawTable();}, state.page===1));
    wrap.appendChild(mkBtn('>' , ()=>{state.page=Math.min(totalPages,state.page+1);drawTable();}, state.page===totalPages));
    wrap.appendChild(mkBtn('>>', ()=>{state.page=totalPages;drawTable();}, state.page===totalPages));

    const sizeSel=document.createElement('select');
    [10,25,50,100].forEach(n=>{
      const o=document.createElement('option');
      o.value=n; o.textContent=n + '/page'; if(n===state.pageSize) o.selected=true; sizeSel.appendChild(o);
    });
    sizeSel.onchange=()=>{ state.pageSize=Number(sizeSel.value); state.page=1; drawTable(); };
    sizeSel.style.marginLeft='auto'; sizeSel.style.padding='6px'; sizeSel.style.borderRadius='8px';
    wrap.appendChild(sizeSel);
    return wrap;
  }

  function sortRows(){
    const key=state.sort.key, dir=state.sort.dir;
    if(!key) return;

    if (key==='pos'){
      state.rows.sort(dir===1 ? cmpPos : (a,b)=>cmpPos(b,a));
      return;
    }

    const numeric = state.rows.some(r=>isNumeric(r[key]));
    state.rows.sort((a,b)=>{
      const va=a[key], vb=b[key];
      if (numeric){
        const na=Number(va), nb=Number(vb);
        if (isNaN(na)&&isNaN(nb)) return 0;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return (na-nb)*dir;
      } else {
        const sa=(va==null?'':String(va)).toLowerCase();
        const sb=(vb==null?'':String(vb)).toLowerCase();
        return sa.localeCompare(sb)*dir;
      }
    });
  }

  function drawTable(){
    tableBox.innerHTML='';
    tableBox.appendChild(renderPager());

    const tbl=document.createElement('table');
    tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='14px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    const thead=document.createElement('thead');
    const trh=document.createElement('tr');
    state.columns.forEach(col=>{
      const th=document.createElement('th');
      const HEAD={ pos:"Pos", no:"No", driver:"Driver", car_engine:"Car / Engine", laps:"Laps", time:"Time", gap_reason:"Gap / Reason" };
      th.textContent = HEAD[col] || col;
      th.style.textAlign='left'; th.style.padding='10px'; th.style.borderBottom='1px solid #eee';
      th.style.cursor='pointer'; th.style.userSelect='none';
      th.onclick=()=>{ state.sort.key===col ? state.sort.dir*=-1 : (state.sort.key=col,state.sort.dir=1); sortRows(); drawTable(); };
      if (state.sort.key===col) th.textContent = th.textContent + ' ' + (state.sort.dir===1?'^':'v');
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    thead.style.position='sticky'; thead.style.top='0'; thead.style.background='#fafafa';
    tbl.appendChild(thead);

    sortRows();
    const start=(state.page-1)*state.pageSize, end=start+state.pageSize;
    const slice=state.rows.slice(start,end);

    const tbody=document.createElement('tbody');
    slice.forEach(r=>{
      const tr=document.createElement('tr');
      tr.onmouseenter=()=>{tr.style.background='#fcfcfd';};
      tr.onmouseleave=()=>{tr.style.background='';};
      state.columns.forEach(c=>{
        const td=document.createElement('td');
        let v = r[c];
        if (c==='pos'){ const n=Number(v); v=(Number.isFinite(n)&&n>0)?n:'—'; }
        td.textContent = (v==null ? '' : v);
        td.style.padding='8px 10px';
        td.style.borderBottom='1px solid #f3f3f3';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
    tableBox.appendChild(renderPager());
  }

  function populateSessionSelect(){
    selEl.innerHTML='';
    state.sessions.forEach(s=>{
      const o=document.createElement('option');
      o.value=s.code; o.textContent=s.code; if(s.code===state.sessionCode) o.selected=true;
      selEl.appendChild(o);
    });
    selEl.onchange=()=>{ state.sessionCode=selEl.value; loadSessionRows(); };
  }

  function formatGpName(name, round){
    if (name){ const m=String(name).trim().match(/^gp\s*0*(\d+)$/i); if(m) return 'Grand Prix ' + m[1]; return name; }
    if (round!=null) return 'Grand Prix ' + String(round);
    return null;
  }
  function buildGpTitle(meta){
    if (!meta) return null;
    const year=meta.year, round=meta.round;
    const name=formatGpName(meta.name||meta.gp_name, round);
    const left = name ? (year ? (name+' ('+year+')') : name)
                      : (round!=null && year ? ('Grand Prix '+round+' ('+year+')') : (year!=null ? String(year) : null));
    const circuit=meta.circuit||"", country=meta.country||"";
    const right = circuit ? (country ? (circuit+' ('+country+')') : circuit) : "";
    if (left && right) return left+' - '+right;
    if (left) return left;
    if (right) return right + (year ? ' ('+year+')' : '');
    return null;
  }

  function loadSessionRows(){
    const sess = state.sessions.find(x=>x.code===state.sessionCode) || state.sessions[0];
    if(!sess){
      state.rows=[]; state.columns=[];
      showInfo('No session available for this GP.');
      tableBox.innerHTML='';
      return;
    }
    const srcRows = Array.isArray(sess.rows) ? sess.rows : (Array.isArray(sess.data) ? sess.data : []);
    state.rows    = buildDisplayRows(withDriverNames(srcRows), state.sessionCode);
    state.columns = ['pos','no','driver','car_engine','laps','time','gap_reason'];
    state.sort    = { key:'pos', dir:1 };
    state.page    = 1;
    showInfo(`Session ${sess.code} • ${srcRows.length} rows`);
    drawTable();
  }

  function init(){
    state.raceId = Number(getURLParam('race', null));
    const s = getURLParam('session','') || '';
    state.sessionCode = s ? s.toUpperCase() : null;
    if(!state.raceId){ titleEl.textContent='Grand Prix — missing ?race=<race_id>'; showInfo('Example: ?race=501'); return; }
    titleEl.textContent = 'Grand Prix — race_id ' + state.raceId;

    const base = (app && app.dataset && app.dataset.base) ? app.dataset.base
      : 'https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main';

    loadDrivers(base).then(function(){
      const url = base + '/races/' + state.raceId + '/sessions.json';
      showInfo('Loading... ' + url);
      return fetch(url,{cache:'no-store'}).then(resp=>{
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        return resp.json();
      }).then(json=>{
        state.meta = (json && json.meta) ? json.meta : {};
        const titleTxt = buildGpTitle(state.meta) || ('Grand Prix ' + (state.meta.round||'') + (state.meta.year?(' ('+state.meta.year+')'):''));
        titleEl.textContent = titleTxt;

        let sessions=[];
        if (Array.isArray(json.sessions)){
          sessions = json.sessions.map(sx=>({ code:(sx.code||sx.session||'UNK').toUpperCase(), rows:sx.rows||sx.data||[] }));
        } else {
          Object.keys(json||{}).forEach(k=>{
            const v=json[k];
            if (Array.isArray(v) && v.length && typeof v[0]==='object'){
              sessions.push({ code:k.toUpperCase(), rows:v });
            }
          });
        }
        const order=['EL1','EL2','EL3','EL4','WUP','Q1','Q2','Q3','Q4','SPRINT_SHOOTOUT','SPRINT','GRILLE','MT','COURSE'];
        sessions.sort((a,b)=>order.indexOf(a.code)-order.indexOf(b.code));
        state.sessions=sessions;
        const exists=sessions.some(sx=>sx.code===state.sessionCode);
        if(!exists) state.sessionCode = (sessions[0]?sessions[0].code:null);
        populateSessionSelect();
        loadSessionRows();
      });
    }).catch(err=>{
      console.error(err);
      showError('Load error - ' + err.message);
      tableBox.innerHTML='';
    });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
