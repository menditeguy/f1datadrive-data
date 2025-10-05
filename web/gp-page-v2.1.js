// gp-page-v2.1.js — FULL VERBOSE v20250930
// Base: ancien script "long" (style verbeux conservé) + ajouts Participants + fixes COURSE
(function(){
  'use strict';

/* ======================================================================================
 *  Utilitaires de base (DOM, formats, helpers)
 * ====================================================================================*/

  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function isNumeric(v){ return v !== null && v !== '' && !isNaN(v); }

  function getURLParam(k, d){
    try{
      const u = new URL(window.location.href);
      const v = u.searchParams.get(k);
      return (v===null?d:v);
    }catch(e){ return d; }
  }

  function fmtMs(v){
    if (v == null || isNaN(Number(v))) return v;
    const ms = Number(v);
    const s  = Math.floor(ms/1000);
    const mm = Math.floor(s/60);
    const ss = s % 60;
    const mmm= ms % 1000;
    return mm + ':' + String(ss).padStart(2,'0') + '.' + String(mmm).padStart(3,'0');
  }

  function pad2(n){ return String(n).padStart(2,'0'); }
  function pad3(n){ return String(n).padStart(3,'0'); }

  function pick(o, keys){
    for (let i=0; i<keys.length; i++){
      const k = keys[i];
      if (o && o[k]!=null && o[k]!== '') return o[k];
    }
    return null;
  }

  function cloneRow(r){
    const out={};
    for (const k in r) out[k]=r[k];
    return out;
  }

  function msFromRow(r){
    // Variantes vues dans les exports
    const m = pick(r, ['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds','bestTimeMs','bestTime_ms']);
    const n = Number(m);
    return Number.isFinite(n) ? n : null;
  }

/* ======================================================================================
 *  Lookups (drivers + participants) + chargement JSON robuste
 * ====================================================================================*/

  let DRIVERS = null;        // { driver_id: "Firstname LASTNAME" }
  let PARTICIPANTS = null;   // { race_id: { driver_id: {num_car, team, motor, laps} } }
  let CURRENT_RACE = null;

  function loadText(url){
    return fetch(url, {cache:'no-store'}).then(async resp=>{
      const txt = await resp.text();
      if (!resp.ok){
        // Inclure le début du corps pour aider au debug (404, etc.)
        throw new Error('HTTP '+resp.status+' on '+url+' — '+txt.slice(0,120));
      }
      return txt;
    });
  }

  function loadJSON(url){
    return loadText(url).then(txt=>{
      try { return JSON.parse(txt); }
      catch(e){ throw new Error('Invalid JSON at '+url+' — '+txt.slice(0,120)); }
    });
  }

  function loadDrivers(base){
    const url = base + '/lookups/drivers.min.json';
    return loadJSON(url).then(j=>{ DRIVERS=j; });
  }

  function loadParticipants(base){
    const url = base + '/lookups/participants.json';
    return loadJSON(url).then(j=>{ PARTICIPANTS=j; });
  }

  function driverName(id){
    if (id==null) return '';
    const k = String(id);
    return (DRIVERS && DRIVERS[k]) ? DRIVERS[k] : String(id);
  }

  function participantsInfo(raceId, driverId){
    if (!PARTICIPANTS) return {};
    const raceNode = PARTICIPANTS[String(raceId)] || PARTICIPANTS[raceId] || {};
    return raceNode[String(driverId)] || raceNode[driverId] || {};
  }

/* ======================================================================================
 *  Discrimination Time / Gap / Reason (COURSE)
 * ====================================================================================*/

  // Détection « temps final de course » (contient h/m/s, km/h, ou format h:mm:ss.mmm)
  const RE_TIME = /(\d+h|\d+m|\d+s|km\/h|:)/i;
  function isFullRaceTimeString(s){ return typeof s==='string' && RE_TIME.test(s); }
  function isPlusGap(s){ return typeof s==='string' && s.trim().startsWith('+'); }

  // Mini table de traduction FR -> EN (extensible)
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

/* ======================================================================================
 *  Classement « Forix-like »
 * ====================================================================================*/

  function toPos(row){
    const v = (row.pos ?? row.position ?? 0);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function cmpPos(a,b){
    const pa=toPos(a), pb=toPos(b);
    if (pa>0 && pb>0) return pa - pb;                // classés d'abord (1..N)
    // DNF : trier par tours effectués (laps) décroissant
    const la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if (la!==lb) return lb - la;
    // Si égalité : position en piste / ordre de course
    const ra = Number(a.positionOrder) || Number(a.rank) || Number(a.driver_id) || 9999;
    const rb = Number(b.positionOrder) || Number(b.rank) || Number(b.driver_id) || 9999;
    return ra - rb;
  }

/* ======================================================================================
 *  Construction des lignes d'affichage (sessions)
 * ====================================================================================*/

  function buildDisplayRows(rows, sessionCode, raceId){
    if (!Array.isArray(rows)) return [];

    const sessionUpper = String(sessionCode||'').toUpperCase();
    const isRace = (sessionUpper === 'COURSE');

    // Meilleur ms de la session (pour calcul du +Δ en EL/Q/WUP)
    let bestMs = null;
    for (let i=0; i<rows.length; i++){
      const ms = msFromRow(rows[i]);
      if (ms!=null) bestMs = (bestMs==null || ms<bestMs) ? ms : bestMs;
    }

    const out = [];
    for (let i=0; i<rows.length; i++){
      const r = rows[i];
      const drvId = pick(r, ['driver_id','DriverId','driverId']);
      const name  = driverName(drvId);

      // Enrichissement via participants
      const pinfo = participantsInfo(raceId, drvId);

      // Champs issus des données (avec fallback participants)
      const pos   = pick(r, ['position','pos','rank','rang']);
      const team  = pick(r, ['team','team_name','teams','teams_name']) || pinfo.team || '';
      const motor = pick(r, ['motor_name','engine','moteur']) || pinfo.motor || '';
      const num   = pick(r, ['num','num_car','number','no','car_no','car']) || pinfo.num_car || '';

      // laps : visible pour EL/WUP, vide pour Q1..Q4
      let laps    = pick(r, ['laps','laps_completed','nb_laps','nb_tours','tours']);
      if (/^Q[1-4]$/i.test(sessionUpper)) laps = '';
      else if (laps==null || laps==='')   laps = (pinfo.laps ?? '');

      // Time / Gap / Reason
      let timeDisplay = '';
      let gapReason   = '';

      if (!isRace){
        // EL/WUP/Q : utiliser ms si dispo, sinon raw
        const ms = msFromRow(r);
        const timeRw = pick(r, ['best_lap_time_raw','best_time','time_raw','best_lap']);
        timeDisplay = timeRw || (ms!=null ? fmtMs(ms) : '');
        if (ms!=null && bestMs!=null && ms>bestMs){
          gapReason = '+' + fmtMs(ms - bestMs);
        }
      } else {
        // COURSE : tout est dans delta (temps ou raison ou +gap)
        const delta = pick(r, ['delta','gap','race_gap']);
        const timeLike = delta;
        if (isPlusGap(delta)) gapReason = delta;
        if (timeLike){
          if (isFullRaceTimeString(timeLike)){
            timeDisplay = timeLike;
          } else {
            gapReason = translateReason(timeLike);
          }
        }
      }

      out.push({
        pos: (pos!=null ? Number(pos) : null),
        no:  String(num||''),
        driver: name,
        car_engine: team + (motor ? ('/' + motor) : ''),
        laps: (laps==='' || laps==null) ? '' : Number(laps),
        time: timeDisplay,
        gap_reason: gapReason,
        rank: pick(r, ['rank']) || null,
        positionOrder: pick(r, ['positionOrder']) || null,
        driver_id: drvId || null
      });
    }

    // Recalcul de Pos si absente (EL/WUP/Q) : tri par meilleur temps croissant
    if (!isRace){
      const order = rows.map((r,i)=>({i, ms: msFromRow(r)}));
      order.sort((a,b)=>{
        if (a.ms==null && b.ms==null) return 0;
        if (a.ms==null) return 1;
        if (b.ms==null) return -1;
        return a.ms - b.ms;
      });
      let rank=1;
      for (let k=0; k<order.length; k++){
        const o = order[k];
        const row = out[o.i];
        if (!row.pos) row.pos = (o.ms==null ? null : rank++);
      }
    }

    return out;
  }

/* ======================================================================================
 *  État & UI (style « gros script » conservé)
 * ====================================================================================*/

  const app      = qs('#f1-gp-app');
  const titleEl  = qs('#gpTitle', app);
  const statusEl = qs('#status', app);
  const selEl    = qs('#sessionSelect', app);
  const tableBox = qs('#sessionTable', app);

  const state = {
    raceId: null,
    sessionCode: null,
    sessions: [],
    rows: [],
    columns: [],
    sort: { key: null, dir: 1 },
    page: 1,
    pageSize: 25
  };

  function showError(msg){
    if (statusEl){ statusEl.textContent = msg; statusEl.style.color = '#b00'; }
  }
  function showInfo(msg){
    if (statusEl){ statusEl.textContent = msg; statusEl.style.color = '#666'; }
  }

/* ======================================================================================
 *  Pagination (haut + bas) — style verbeux conservé
 * ====================================================================================*/

  function makePager(total, totalPages){
    const wrap=document.createElement('div');
    wrap.style.display='flex';
    wrap.style.alignItems='center';
    wrap.style.gap='8px';
    wrap.style.margin='10px 0';

    const info=document.createElement('span');
    info.style.fontSize='12px';
    info.textContent='Total: ' + total + ' rows - Page ' + state.page + '/' + totalPages;
    wrap.appendChild(info);

    function mkBtn(text,on,dis){
      const b=document.createElement('button');
      b.textContent=text; b.disabled=!!dis;
      b.style.padding='6px 10px';
      b.style.border='1px solid #ddd';
      b.style.borderRadius='8px';
      b.style.background=dis?'#f5f5f5':'#fff';
      b.style.cursor=dis?'not-allowed':'pointer';
      b.onclick=on;
      return b;
    }

    const atFirst = (state.page===1);
    const atLast  = false; // calculé plus bas

    // boutons
    wrap.appendChild(mkBtn('<<', ()=>{state.page=1; drawTable();}, atFirst));
    wrap.appendChild(mkBtn('<' , ()=>{state.page=Math.max(1,state.page-1); drawTable();}, atFirst));

    // page suivante / fin
    const _atLast = (state.page===totalPages);
    wrap.appendChild(mkBtn('>' , ()=>{state.page=Math.min(totalPages,state.page+1); drawTable();}, _atLast));
    wrap.appendChild(mkBtn('>>', ()=>{state.page=totalPages; drawTable();}, _atLast));

    // Sélecteur pageSize
    const sizeSel=document.createElement('select');
    [10,25,50,100].forEach(n=>{
      const o=document.createElement('option');
      o.value=n; o.textContent=n + '/page';
      if(n===state.pageSize) o.selected=true;
      sizeSel.appendChild(o);
    });
    sizeSel.onchange=()=>{ state.pageSize=Number(sizeSel.value); state.page=1; drawTable(); };
    sizeSel.style.marginLeft='auto';
    sizeSel.style.padding='6px';
    sizeSel.style.borderRadius='8px';
    wrap.appendChild(sizeSel);

    return wrap;
  }

/* ======================================================================================
 *  Tri
 * ====================================================================================*/

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

/* ======================================================================================
 *  Rendu du tableau (avec pager haut + bas)
 * ====================================================================================*/

  function drawTable(){
    tableBox.innerHTML='';

    // pagination (haut)
    const total = state.rows.length;
    const totalPages = Math.max(1, Math.ceil(total/state.pageSize));
    state.page = Math.min(state.page, totalPages);
    tableBox.appendChild(makePager(total, totalPages));

    // table
    const tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.style.borderCollapse='collapse';
    tbl.style.fontSize='14px';
    tbl.style.background='#fff';
    tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';
    tbl.style.borderRadius='12px';
    tbl.style.overflow='hidden';

    const thead=document.createElement('thead');
    thead.style.position='sticky';
    thead.style.top='0';
    thead.style.background='#fafafa';

    const trh=document.createElement('tr');

    const HEAD_MAP = {
      pos:"Pos",
      no:"No",
      driver:"Driver",
      car_engine:"Car / Engine",
      laps:"Laps",
      time:"Time",
      gap_reason:"Gap / Reason"
    };

    for (let i=0;i<state.columns.length;i++){
      const col = state.columns[i];
      const th=document.createElement('th');
      th.textContent = HEAD_MAP[col] || col;
      th.style.textAlign='left';
      th.style.padding='10px';
      th.style.borderBottom='1px solid #eee';
      th.style.cursor='pointer';
      th.style.userSelect='none';

      th.onclick = (function(cname){
        return function(){
          if (state.sort.key===cname){ state.sort.dir *= -1; }
          else { state.sort.key=cname; state.sort.dir=1; }
          sortRows();
          drawTable();
        };
      })(col);

      if (state.sort.key===col){
        th.textContent = th.textContent + ' ' + (state.sort.dir===1?'^':'v');
      }

      trh.appendChild(th);
    }
    thead.appendChild(trh);
    tbl.appendChild(thead);

    // corps
    sortRows();
    const start=(state.page-1)*state.pageSize;
    const end  = start+state.pageSize;
    const slice=state.rows.slice(start,end);

    const tbody=document.createElement('tbody');

    for (let i=0;i<slice.length;i++){
      const r = slice[i];
      const tr=document.createElement('tr');
      tr.onmouseenter=()=>{tr.style.background='#fcfcfd';};
      tr.onmouseleave=()=>{tr.style.background='';};

      for (let j=0;j<state.columns.length;j++){
        const c=state.columns[j];
        const td=document.createElement('td');
        let v = r[c];

        if (c==='pos'){
          const n=Number(v);
          v=(Number.isFinite(n)&&n>0)?n:'—';
        }

        td.textContent = (v==null ? '' : v);
        td.style.padding='8px 10px';
        td.style.borderBottom='1px solid #f3f3f3';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);

    // pagination (bas)
    tableBox.appendChild(makePager(total, totalPages));
  }

/* ======================================================================================
 *  Sélecteur de session, titre GP, chargement sessions
 * ====================================================================================*/

  function populateSessionSelect(){
    selEl.innerHTML='';
    for (let i=0;i<state.sessions.length;i++){
      const s = state.sessions[i];
      const o=document.createElement('option');
      o.value=s.code;
      o.textContent=s.code;
      if (s.code===state.sessionCode) o.selected=true;
      selEl.appendChild(o);
    }
    selEl.onchange = function(){
      state.sessionCode = selEl.value;
      loadSessionRows();
    };
  }

  function formatGpName(name, round){
    if (name){
      const m=String(name).trim().match(/^gp\s*0*(\d+)$/i);
      if (m) return 'Grand Prix ' + m[1];
      return name;
    }
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
    // Trouver la session sélectionnée
    const sess = state.sessions.find(x=>x.code===state.sessionCode) || state.sessions[0];

    if(!sess){
      state.rows=[]; state.columns=[];
      showInfo('No session available for this GP.');
      tableBox.innerHTML='';
      return;
    }

    // Récupérer les lignes source (selon structure)
    const srcRows = Array.isArray(sess.rows) ? sess.rows
                   : (Array.isArray(sess.data) ? sess.data : []);

    // Ajouter noms de pilotes (via drivers.min.json)
    const withNames = [];
    for (let i=0;i<srcRows.length;i++){
      const r = srcRows[i];
      const out = cloneRow(r);
      const id  = pick(r, ['driver_id','DriverId','driverId']);
      out.driver = driverName(id);
      withNames.push(out);
    }

    // Construire lignes d'affichage
    state.rows    = buildDisplayRows(withNames, state.sessionCode, state.raceId);
    state.columns = ['pos','no','driver','car_engine','laps','time','gap_reason'];
    state.sort    = { key:'pos', dir:1 };
    state.page    = 1;

    showInfo('Session ' + (sess.code||'?') + ' • ' + srcRows.length + ' rows');
    drawTable();
  }

/* ======================================================================================
 *  Initialisation
 * ====================================================================================*/

  function init(){
    // race_id depuis URL
    state.raceId = Number(getURLParam('race', null));
    CURRENT_RACE = state.raceId;

    // session depuis URL
    const s = getURLParam('session','') || '';
    state.sessionCode = s ? s.toUpperCase() : null;

    if(!state.raceId){
      if (titleEl) titleEl.textContent='Grand Prix — missing ?race=<race_id>';
      showInfo('Example: ?race=501');
      return;
    }

    // Base CDN / data
    const base = (app && app.dataset && app.dataset.base)
      ? app.dataset.base
      : 'https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main';

    // Charger lookups puis sessions
    Promise.all([ loadDrivers(base), loadParticipants(base) ])
      .then(function(){
        const url = base + '/races/' + state.raceId + '/sessions.json';
        showInfo('Loading... ' + url);
        return loadJSON(url);
      })
      .then(function(json){
        state.meta = (json && json.meta) ? json.meta : {};

        const titleTxt = buildGpTitle(state.meta)
          || ('Grand Prix ' + (state.meta.round||'') + (state.meta.year?(' ('+state.meta.year+')'):''));
        if (titleEl) titleEl.textContent = titleTxt;

        // Normaliser les sessions
        let sessions=[];
        if (Array.isArray(json.sessions)){
          for (let i=0;i<json.sessions.length;i++){
            const sx = json.sessions[i];
            sessions.push({
              code: (sx.code||sx.session||'UNK').toUpperCase(),
              rows: sx.rows || sx.data || []
            });
          }
        } else {
          // format alternatif { EL1: [...], Q1: [...], ... }
          for (const k in json){
            const v = json[k];
            if (Array.isArray(v) && v.length && typeof v[0]==='object'){
              sessions.push({ code:k.toUpperCase(), rows:v });
            }
          }
        }

        // Ordre d'affichage
        // Ordre voulu + prise en charge Pré-qualifications et Sprint
        const order=[
          'PREQUAL','PREQUAL1','PREQUAL2',
          'EL1','EL2','EL3','EL4',
          'Q1','Q2','Q3','Q4',
          'SPRINT_SHOOTOUT','SPRINT',
          'WUP','GRILLE','MT','COURSE'
        ];
        const idx = c => { const i=order.indexOf(c.code); return i<0 ? 999 : i; };
        sessions.sort((a,b)=>idx(a)-idx(b));

        // Session par défaut si inconnue
        const exists=sessions.some(sx=>sx.code===state.sessionCode);
        if(!exists) state.sessionCode = (sessions[0]?sessions[0].code:null);

        populateSessionSelect();
        loadSessionRows();
      })
      .catch(function(err){
        console.error(err);
        showError('Load error - ' + err.message);
        tableBox.innerHTML='';
      });
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
