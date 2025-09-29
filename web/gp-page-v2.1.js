// gp-page-v2.1.js — version enrichie avec participants.json
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

  // --- lookups
  let DRIVERS = null;
  let PARTICIPANTS = null;
  let CURRENT_RACE = null;

  function loadDrivers(base){
    return fetch(base + '/lookups/drivers.min.json',{cache:'no-store'})
      .then(r=>r.json()).then(j=>{ DRIVERS=j; });
  }
  function loadParticipants(base){
    return fetch(base + '/lookups/participants.json',{cache:'no-store'})
      .then(r=>r.json()).then(j=>{ PARTICIPANTS=j; });
  }

  function driverName(id){
    if (id==null) return '';
    const k=String(id);
    return (DRIVERS && DRIVERS[k]) ? DRIVERS[k] : String(id);
  }

  function withDriverNames(rows){
    if (!Array.isArray(rows)) return [];
    return rows.map(r=>{
      const out={...r};
      const id = r.driver_id || r.DriverId || r.driverId || null;
      out.driver = driverName(id);
      return out;
    });
  }

  function pick(r, keys){
    for (let k of keys){ if (r && r[k]!=null && r[k]!=="") return r[k]; }
    return null;
  }
  function msFromRow(r){
    const m = pick(r, ['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds']);
    const n = Number(m);
    return Number.isFinite(n) ? n : null;
  }

  // --- classement helpers
  function toPos(row){ const v = (row.pos ?? row.position ?? 0); const n = Number(v); return Number.isFinite(n)?n:0; }
  function cmpPos(a,b){
    const pa=toPos(a), pb=toPos(b);
    if (pa>0 && pb>0) return pa - pb;
    const la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if (la!==lb) return lb - la;
    return (Number(a.positionOrder)||9999) - (Number(b.positionOrder)||9999);
  }

  // --- build rows
  function buildDisplayRows(rows, sessionCode){
    if (!Array.isArray(rows)) return [];
    const isRace = (String(sessionCode||'').toUpperCase()==='COURSE');

    // bestMs pour calcul des gaps
    let bestMs = null;
    rows.forEach(r=>{
      const ms = msFromRow(r);
      if (ms!=null) bestMs = (bestMs==null || ms<bestMs)? ms : bestMs;
    });

    // enrichissement participants
    function enrichFromParticipants(did){
      if (!PARTICIPANTS || !CURRENT_RACE) return {};
      const raceData = PARTICIPANTS[CURRENT_RACE] || {};
      return raceData[did] || {};
    }

    // construction
    let display = rows.map((r,i)=>{
      const drvId = pick(r,['driver_id','DriverId','driverId']);
      const name = driverName(drvId);
      const pinfo = enrichFromParticipants(drvId);

      let pos = pick(r,['position','pos','rank']);
      let laps = pick(r,['laps','laps_completed','nb_laps','tours']);
      let num  = pinfo.num_car || '';
      let car  = (pinfo.team||'') + (pinfo.motor?('/'+pinfo.motor):'');

      let timeDisplay = '';
      let gapReason   = '';

      if (!isRace){
        // Essais / qualifs
        const ms = msFromRow(r);
        const timeRw = pick(r,['best_lap_time_raw','best_time','time_raw']);
        timeDisplay = timeRw || (ms!=null ? fmtMs(ms) : '');
        if (ms!=null && bestMs!=null && ms>bestMs){
          gapReason = '+'+fmtMs(ms-bestMs);
        }
        // Pos calculée si absente
        if (!pos && ms!=null){
          // sera recalculé plus bas
        }
        // Laps -> uniquement pour EL/WUP
        if (/^Q[1-4]$/.test(sessionCode)) laps = '';
        else laps = pinfo.laps || laps || '';
      } else {
        // COURSE (corrigé déjà)
        const delta = pick(r,['delta','gap','race_gap']);
        const timeLike = delta;
        if (timeLike){
          if (/(\d+h|\d+m|\d+s|km\/h|:)/i.test(timeLike)){
            timeDisplay = timeLike;
          } else if (timeLike.trim().startsWith('+')){
            gapReason = timeLike;
          } else {
            gapReason = timeLike; // texte (raison)
          }
        }
      }

      return {
        pos: pos ? Number(pos) : null,
        no: num,
        driver: name,
        car_engine: car,
        laps: laps,
        time: timeDisplay,
        gap_reason: gapReason,
        driver_id: drvId
      };
    });

    // recalcul Pos si besoin (EL/WUP/Q)
    if (!isRace){
      display.sort((a,b)=>msFromRow(a)-msFromRow(b));
      display.forEach((r,i)=>{ if (!r.pos) r.pos=i+1; });
    }

    return display;
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

  function sortRows(){
    const key=state.sort.key, dir=state.sort.dir;
    if(!key) return;
    if (key==='pos'){ state.rows.sort(dir===1?cmpPos:(a,b)=>cmpPos(b,a)); return; }
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
        return String(va||'').localeCompare(String(vb||''))*dir;
      }
    });
  }

  function drawTable(){
    tableBox.innerHTML='';
    const tbl=document.createElement('table');
    const thead=document.createElement('thead');
    const trh=document.createElement('tr');
    state.columns.forEach(col=>{
      const th=document.createElement('th');
      const HEAD={ pos:"Pos", no:"No", driver:"Driver", car_engine:"Car / Engine", laps:"Laps", time:"Time", gap_reason:"Gap / Reason" };
      th.textContent = HEAD[col]||col;
      th.onclick=()=>{ state.sort.key===col ? state.sort.dir*=-1 : (state.sort.key=col,state.sort.dir=1); sortRows(); drawTable(); };
      trh.appendChild(th);
    });
    thead.appendChild(trh); tbl.appendChild(thead);

    sortRows();
    const tbody=document.createElement('tbody');
    state.rows.forEach(r=>{
      const tr=document.createElement('tr');
      state.columns.forEach(c=>{
        const td=document.createElement('td');
        let v = r[c]; if (c==='pos'){ v=(v && v>0)?v:'—'; }
        td.textContent = v==null?'':v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
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

  function loadSessionRows(){
    const sess=state.sessions.find(x=>x.code===state.sessionCode)||state.sessions[0];
    if(!sess){ state.rows=[]; state.columns=[]; showInfo('No session available'); return; }
    const srcRows=Array.isArray(sess.rows)?sess.rows:(Array.isArray(sess.data)?sess.data:[]);
    state.rows=buildDisplayRows(withDriverNames(srcRows), state.sessionCode);
    state.columns=['pos','no','driver','car_engine','laps','time','gap_reason'];
    state.sort={key:'pos',dir:1}; state.page=1;
    showInfo(`Session ${sess.code} • ${srcRows.length} rows`);
    drawTable();
  }

  function init(){
    state.raceId=Number(getURLParam('race',null));
    CURRENT_RACE=state.raceId;
    const s=getURLParam('session','')||''; state.sessionCode=s?s.toUpperCase():null;
    if(!state.raceId){ titleEl.textContent='Grand Prix — missing ?race=<race_id>'; return; }

    const base=(app&&app.dataset&&app.dataset.base)?app.dataset.base:'https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main';

    Promise.all([loadDrivers(base), loadParticipants(base)]).then(()=>{
      return fetch(base+'/races/'+state.raceId+'/sessions.json',{cache:'no-store'}).then(r=>r.json());
    }).then(json=>{
      state.meta=json.meta||{};
      let sessions=[];
      if(Array.isArray(json.sessions)){ sessions=json.sessions.map(sx=>({code:sx.code.toUpperCase(),rows:sx.rows||sx.data||[]})); }
      state.sessions=sessions;
      if(!sessions.some(sx=>sx.code===state.sessionCode)) state.sessionCode=sessions[0]?sessions[0].code:null;
      populateSessionSelect(); loadSessionRows();
    }).catch(err=>{ showError('Load error '+err.message); });
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);} else {init();}
})();
