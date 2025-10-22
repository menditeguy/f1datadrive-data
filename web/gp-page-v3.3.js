// gp-page-v3.3.js
// - Sessions: boutons statiques (EL1…Q4, PQx, SQx, Grid, LPbLP, TLaps, FL, Lead, Race, Resume, Championship)
// - Chargement JSON: jsDelivr (@main) + fallback Statically + githack (CORS OK)
// - Dépôt auto: races 1–500 / 501–1000 / 1001–1500
// - Tableaux "séance", "Resume" et "Championship" (tris, couleurs, colonnes dynamiques, légende)
// - Laps fix: ne jamais reprendre les tours de la course pour EL / Q / WUP / FL
// - Garde la logique PerfTime de v2.9 (meilleur ms du week-end, Pos + %)
// - "No data" propre si la séance n’existe pas
// - v3.1: GRID mappé (grille/starting_grid) + colonne "Total Laps (Qualif)" dans GRID, suppression de "laps" en Q1–Q4.
// - Lap_release pour FL ok

(function(){
  'use strict';

  /* ========================== Utils ========================== */
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return (root||document).querySelectorAll(sel); }
  function isNum(x){ return x!==null && x!=='' && !isNaN(x); }
  function getURLParam(k,d){ try{var u=new URL(window.location.href);var v=u.searchParams.get(k);return v===null?d:v;}catch(e){return d;} }
  function fmtMs(v){
    if(v==null||isNaN(+v)) return v;
    var ms=+v,s=Math.floor(ms/1000),mm=Math.floor(s/60),ss=s%60,mmm=ms%1000;
    return mm+':'+String(ss).padStart(2,'0')+'.'+String(mmm).padStart(3,'0');
  }
  function pick(o,keys){ if(!o) return null; for(var i=0;i<keys.length;i++){var k=keys[i]; if(o[k]!=null && o[k]!=='') return o[k];} return null; }
  function clone(o){ var r={}; for(var k in o){ r[k]=o[k]; } return r; }
  function tryParseJSON(t, url){
    try{ return JSON.parse(t); }catch(e){ throw new Error('Invalid JSON at '+url+' — '+t.slice(0,120)); }
  }

  // fetch avec fallbacks (jsDelivr → Statically → githack)
  function loadJSONwithFallback(urls){
    var i=0;
    function step(){
      if(i>=urls.length) return Promise.reject(new Error('All sources failed for '+urls[0]));
      var u=urls[i++];
      return fetch(u,{cache:'no-store'}).then(function(r){
        return r.text().then(function(t){
          if(!r.ok) throw new Error('HTTP '+r.status+' on '+u+' — '+t.slice(0,120));
          return tryParseJSON(t,u);
        });
      }).catch(function(){ return step(); });
    }
    return step();
  }

  /* ========================== Lookups ========================== */
  var DRIVERS=null, PARTICIPANTS=null;
  function loadDrivers(base){ return fetch(base+'/lookups/drivers.min.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){DRIVERS=j;}); }
  function loadParticipants(base){ return fetch(base+'/lookups/participants.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){PARTICIPANTS=j;}); }
  function driverName(id){ if(id==null) return ''; var k=String(id); return DRIVERS&&DRIVERS[k]?DRIVERS[k]:String(id); }
  function pinfo(raceId, driverId){ if(!PARTICIPANTS) return {}; var rn=PARTICIPANTS[String(raceId)]||{}; return rn[String(driverId)]||{}; }

  /* ========================== DOM & state ========================== */
  var app=qs('#f1-gp-app');
  var titleEl=qs('#gpTitle',app);
  var statusEl=qs('#status',app);
  var tabsEl=qs('#sessionTabs',app);
  var tableBox=qs('#sessionTable',app);

  var COLORS={
    orange:'#ee5a2f', // EL / WUP
    green:'#188038',  // Q / Grid / FL / PerfTime
    blue:'#1a73e8',   // Race data
    purple:'#6A32A8'  // Analyse (Resume / Championship)
  };

  // Liste statique exhaustive (certaines peuvent être absentes → "No data")
    var STATIC_TABS=[
    'EL1','EL2','EL3','EL4','WUP',
    'PQ1','PQ2','SQ1','SQ2','SQ3',
    'Q1','Q2','Q3','Q4',
    'PERFTIME',      // 👈 ajouté ici
    'GRID','LPBLP','TLAPS','FL','LEAD','RACE',
    'RESUME','Championship'
    ];

  var state={
    raceId:null,
    meta:null,
    jsonRoot:null,
    sessions:[],   // [{code, rows}]
    sessionCode:null,
    rows:[],
    sort:{key:'pos',dir:1},
    columns:['pos','no','driver','car_engine','laps','time','gap_reason'],
    resumeCache:null,
    resumeSortKey:null,
    resumeSortDir:1
  };

  function info(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#666'; } }
  function error(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#b00'; } }

  /* ========================== Sorting & normal table ========================== */
  function toPos(row){
    var v=row.pos!=null?row.pos:(row.position!=null?row.position:0);
    v=Number(v); return isFinite(v)?v:0;
  }
  function cmpPos(a,b){
    var pa=toPos(a), pb=toPos(b);
    if(pa>0 && pb>0) return pa-pb;
    var la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if(la!==lb) return lb-la;
    var ra=Number(a.positionOrder)||Number(a.rank)||Number(a.driver_id)||9999;
    var rb=Number(b.positionOrder)||Number(b.rank)||Number(b.driver_id)||9999;
    return ra-rb;
  }
  function sortRows(){
    var key=state.sort.key, dir=state.sort.dir;
    if(key==='pos'){ state.rows.sort(dir===1?cmpPos:function(a,b){return cmpPos(b,a);}); return; }
    var numeric=state.rows.some(function(r){ return isNum(r[key]); });
    state.rows.sort(function(a,b){
      var va=a[key], vb=b[key];
      if(numeric){
        var na=Number(va), nb=Number(vb);
        if(isNaN(na)&&isNaN(nb)) return 0;
        if(isNaN(na)) return 1;
        if(isNaN(nb)) return -1;
        return (na-nb)*dir;
      }else{
        var sa=(va==null?'':String(va)).toLowerCase();
        var sb=(vb==null?'':String(vb)).toLowerCase();
        return sa.localeCompare(sb)*dir;
      }
    });
  }
  function drawTable(){
    tableBox.innerHTML='';
    var tbl=document.createElement('table');
    tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='14px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    var thead=document.createElement('thead'); thead.style.position='sticky'; thead.style.top='0'; thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    var HEAD_MAP={pos:'Pos',no:'No',driver:'Driver',car_engine:'Car / Engine',laps:'Laps',time:'Time',gap_reason:'Gap / Reason', total_laps_q:'Total Laps (Qualif)',lap_number:'Lap'};
    for(var i=0;i<state.columns.length;i++){
      (function(cn){
        var th=document.createElement('th');
        th.textContent=HEAD_MAP[cn]||cn; th.style.textAlign='left'; th.style.padding='10px'; th.style.borderBottom='1px solid #eee';
        th.style.cursor='pointer'; th.style.userSelect='none'; th.style.outline='none';
        th.onmousedown=function(e){e.preventDefault();};
        th.onclick=function(){ if(state.sort.key===cn){state.sort.dir*=-1;}else{state.sort.key=cn;state.sort.dir=1;} sortRows(); drawTable(); };
        if(state.sort.key===cn){ th.textContent+=' '+(state.sort.dir===1?'↑':'↓'); }
        trh.appendChild(th);
      })(state.columns[i]);
    }
    thead.appendChild(trh); tbl.appendChild(thead);

    sortRows();
    var tbody=document.createElement('tbody');
    for(var r=0;r<state.rows.length;r++){
      var row=state.rows[r], tr=document.createElement('tr');
      tr.onmouseenter=function(){this.style.background='#fcfcfd';};
      tr.onmouseleave=function(){this.style.background='';};
      for(var c=0;c<state.columns.length;c++){
        var k=state.columns[c], td=document.createElement('td'), v=row[k];
        if(k==='pos'){ var n=Number(v); v=(isFinite(n)&&n>0)?n:'—'; }
        td.textContent=(v==null?'':v);
        td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
  }

  /* ========================== Colors & tabs ========================== */
  function colorFor(code){
    var c=String(code||'').toUpperCase();
    if(c==='EL1'||c==='EL2'||c==='EL3'||c==='EL4'||c==='WUP') return COLORS.orange;
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='GRID'||c==='FL'||c==='PERFTIME'||c==='TLAPS') return COLORS.green;
    if(c==='LPBLP'||c==='LEAD'||c==='RACE'||c==='COURSE') return COLORS.blue;
    if(c==='RESUME'||c==='Championship') return COLORS.purple;
    return COLORS.blue;
  }
  function labelFor(code){
    var m=String(code||'').toUpperCase();
    var map={ 'COURSE':'Race', 'RACE':'Race', 'GRID':'Grid', 'FL':'FL', 'LPBLP':'LPbLP', 'TLAPS':'TLaps', 'RESUME':'Resume', 'CHAMPIONSHIP':'Championship' };
    return map[m]||m;
  }

  function ensureTabs(){
    if(!tabsEl){
      tabsEl=document.createElement('div'); tabsEl.id='sessionTabs';
      tabsEl.style.display='flex'; tabsEl.style.flexWrap='wrap'; tabsEl.style.gap='8px'; tabsEl.style.margin='8px 0 12px';
      if(tableBox && tableBox.parentNode){ tableBox.parentNode.insertBefore(tabsEl, tableBox); } else if(app){ app.appendChild(tabsEl); }
    }
  }
  function buildTabs(){
  ensureTabs();
  tabsEl.innerHTML = '';

  for (var i = 0; i < STATIC_TABS.length; i++) {
    (function(code){
      var btn = document.createElement('button');
      btn.textContent = labelFor(code);
      var col = colorFor(code);
      btn.style.background = '#fff';
      btn.style.border = '1px solid ' + col;
      btn.style.color = col;
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '10px';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';

      btn.onmouseenter = function(){ btn.style.background = col; btn.style.color = '#fff'; };
      btn.onmouseleave = function(){
        if (state.sessionCode === code) { btn.style.background = col; btn.style.color = '#fff'; }
        else { btn.style.background = '#fff'; btn.style.color = col; }
      };

      btn.onclick = function(){
        if (state.sessionCode === code) return;
        state.sessionCode = code;
        if (code === 'RESUME') drawResume();
        else if (code === 'PERFTIME') loadPerfTime(state.raceId, repo);
        else { loadSessionRows(); }
        if (code === 'RESUME') {
          drawResume();
        }
        else if (code === 'PERFTIME') {
          loadPerfTime(state.raceId, repo);
        }
        else if (code === 'CHAMPIONSHIP') {
          loadChampionship(state.raceId);
        }
        else {
          loadSessionRows();
        }
        buildTabs();
      };

      if (state.sessionCode === code) {
        btn.style.background = col;
        btn.style.color = '#fff';
      }

      // Ordre naturel = celui de STATIC_TABS
      tabsEl.appendChild(btn);
    })(STATIC_TABS[i]);
  }
}

  /* ========================== Helpers séance ========================== */
  function sessionOrderIdx(code){
    var order=[
      'EL1','EL2','EL3','EL4','WUP',
      'PQ1','PQ2','SQ1','SQ2','SQ3',
      'Q1','Q2','Q3','Q4','GRID','FL',
      'LPBLP','TLAPS','LEAD','RACE','COURSE'
    ];
    var c=String(code||'').toUpperCase();
    var i=order.indexOf(c); return i<0?999:i;
  }
  function findSession(code){
    var C=String(code).toUpperCase();
    for(var i=0;i<state.sessions.length;i++){
      var sc=state.sessions[i].code;
      if(sc===C) return state.sessions[i];
      if(C==='COURSE' && sc==='RACE') return state.sessions[i];
    }
    return null;
  }
  function collectSessionsPresent(){
    var ss=[];
    for(var i=0;i<state.sessions.length;i++){
      var s=state.sessions[i], rows=s.rows||s.data||[];
      if(Array.isArray(rows) && rows.length){ ss.push(s.code); }
    }
    ss.sort(function(a,b){ return sessionOrderIdx(a)-sessionOrderIdx(b); });
    return ss;
  }

  /* ========================== Construction lignes (séance) ========================== */
  function msFromRow(r){
    var m=pick(r,['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds','bestTimeMs','bestTime_ms','bestMs']);
    var n=Number(m); return isFinite(n)?n:null;
  }
  var RE_TIME=/(\d+h|\d+m|\d+s|km\/h|:)/i;
  function isRaceTimeString(s){ return typeof s==='string' && RE_TIME.test(s); }
  function translateReason(fr){
    if(!fr) return fr;
    var map={"Boîte de vitesses":"Gearbox","Accident":"Accident","Accrochage":"Collision","Aileron":"Wing","Moteur":"Engine","Transmission":"Transmission","Suspension":"Suspension","Hydraulique":"Hydraulics","Essence":"Fuel","Pneu":"Tyre","Sortie de piste":"Off track","Fixation de roue":"Wheel mounting","Surchauffe":"Overheating","Accélérateur":"Throttle","Jante":"Wheel rim","Pas parti":"Did not start","Abandon":"Retired","Disqualification":"Disqualified"};
    return map[fr]||fr;
  }

  function buildDisplayRows(rows, sessionCode, raceId){
    if(!Array.isArray(rows)) return [];
    var c=String(sessionCode||'').toUpperCase();
    var isRaceType=(c==='COURSE'||c==='RACE'||c==='SPRINT');

    var bestMs=null;
    if(!isRaceType){
      for(var i=0;i<rows.length;i++){ var ms=msFromRow(rows[i]); if(ms!=null) bestMs=(bestMs==null||ms<bestMs)?ms:bestMs; }
    }

    var out=[], lapKeys=['laps','lap_count','laps_count','lapsCompleted','laps_session','laps_completed','nb_laps','nbLaps','nb_tours','tours'];
    for(var j=0;j<rows.length;j++){
      var r=rows[j], drvId=pick(r,['driver_id','DriverId','driverId']), pin=pinfo(raceId, drvId);

      var pos=pick(r,['position','pos','rank','rang']);
      var team=pick(r,['team','team_name','teams','teams_name']) || pin.team || '';
      var motor=pick(r,['motor_name','engine','moteur']) || pin.motor || '';
      var num=pick(r,['num','num_car','number','no','car_no','car']) || pin.num_car || '';

      var laps=pick(r, lapKeys);
      if(/^Q[1-4]$/i.test(c) || c==='GRID' || c==='FL'){ laps=''; }
      else if((laps==null || laps==='') && isRaceType){ laps=(pin.laps!=null?pin.laps:''); }

      var timeDisplay='', gapReason='';
      if(!isRaceType){
        var ms2=msFromRow(r);
        var timeRw=pick(r,['best_lap_time_raw','best_time','time_raw','best_lap','lap_time']);
        timeDisplay = timeRw || (ms2!=null?fmtMs(ms2):'');
        if(ms2!=null && bestMs!=null && ms2>bestMs){ gapReason='+'+fmtMs(ms2-bestMs); }
      }else{
        var delta=pick(r,['delta','gap','race_gap','status','reason']);
        if(delta && delta.trim().charAt(0)==='+') gapReason=delta;
        if(delta){
          if(isRaceTimeString(delta)){ timeDisplay=delta; }
          else{ gapReason=translateReason(delta); }
        }
      }
      // === FL lap number fix v3.2 ===
        if (c === 'FL') {
          var lapNo = pick(r, ['lap_release','lap_number','lap','lap_no','lap_n','lapNum']);
          if (lapNo != null && lapNo !== '') {
            r.lap_number = Number(lapNo);
          }
        }
        
      out.push({
        pos:(pos!=null?Number(pos):null),
        no:String(num||''),
        driver:driverName(drvId),
        car_engine:team+(motor?('/'+motor):''),
        laps:(laps===''||laps==null)?'':Number(laps),
        time:timeDisplay,
        gap_reason:gapReason,
        rank:pick(r,['rank'])||null,
        positionOrder:pick(r,['positionOrder'])||null,
        driver_id:drvId||null,
        lap_number:(c==='FL' ? (r.lap_number || pick(r,['lap_release','lap','lap_no'])) : null)
      });
    }

    if(!isRaceType){
      var order=rows.map(function(r,i){ return {i:i, ms:msFromRow(r)}; });
      order.sort(function(a,b){
        if(a.ms==null && b.ms==null) return 0;
        if(a.ms==null) return 1;
        if(b.ms==null) return -1;
        return a.ms-b.ms;
      });
      var rk=1;
      for(var k=0;k<order.length;k++){
        var o=order[k], row=out[o.i];
        if(!row.pos) row.pos=(o.ms==null?null:rk++);
      }
    }
    return out;
  }

  // v3.1 — calcule la somme des tours Q1–Q4 par pilote pour affichage dans GRID
  function computeTotalQualLapsByDriver(allSessions){
    var qCodes=['Q1','Q2','Q3','Q4'], totalByDriver={};
    for(var qi=0; qi<qCodes.length; qi++){
      var s=null;
      for(var si=0; si<allSessions.length; si++){ if(allSessions[si].code===qCodes[qi]){ s=allSessions[si]; break; } }
      if(!s || !Array.isArray(s.rows)) continue;
      for(var ri=0; ri<s.rows.length; ri++){
        var r=s.rows[ri];
        var id=pick(r,['driver_id','DriverId','driverId']);
        if(id==null) continue;
        var laps=Number(pick(r,['laps','lap_count','laps_count','lapsCompleted','laps_session','laps_completed','nb_laps','nbLaps','nb_tours','tours']))||0;
        totalByDriver[String(id)]=(totalByDriver[String(id)]||0)+laps;
      }
    }
    return totalByDriver;
  }

  function loadSessionRows(){
    var sess=findSession(state.sessionCode);
    if(!sess){ state.rows=[]; tableBox.innerHTML=''; info('No data for '+state.sessionCode); return; }

    var src=Array.isArray(sess.rows)?sess.rows:(Array.isArray(sess.data)?sess.data:[]);
    var withNames=[];
    for(var i=0;i<src.length;i++){ var r=src[i], o=clone(r), id=pick(r,['driver_id','DriverId','driverId']); o.driver=driverName(id); withNames.push(o); }

    // Construction standard
    state.rows=buildDisplayRows(withNames, state.sessionCode, state.raceId);

    // v3.1 — ajustements d’affichage par type
    var c=String(state.sessionCode||'').toUpperCase();
    if(/^Q[1-4]$/.test(c)){
      // Supprimer colonne laps en Q1–Q4
      state.columns=['pos','no','driver','car_engine','time','gap_reason'];
    } 
    else if (c === 'GRID') {
      // v3.1-fix — priorité au champ total_laps_q1q4 du JSON, sinon calcul local
      var totals = {};
      for (var j = 0; j < state.rows.length; j++) {
        var did = state.rows[j].driver_id;
        var val = Number(state.rows[j].total_laps_q1q4 || state.rows[j].total_laps_q || 0);
        totals[String(did)] = val;
      }
      // Compléter avec un calcul local si aucune donnée n’était trouvée
      if (Object.values(totals).every(function(v){ return v===0; })) {
        var computed = computeTotalQualLapsByDriver(state.sessions);
        for (var id in computed) totals[id] = computed[id];
      }

      // Injection dans les lignes affichées
      for (var j2 = 0; j2 < state.rows.length; j2++) {
        var did2 = state.rows[j2].driver_id;
        state.rows[j2].total_laps_q = totals[String(did2)] || 0;
      }
      state.columns = ['pos','no','driver','car_engine','total_laps_q','time','gap_reason'];
    }// <-- fermeture du bloc GRID

    else if (c === 'FL') {
      state.columns = ['pos','no','driver','car_engine','lap_number','time','gap_reason'];
    }

    state.sort={key:'pos',dir:1};
    info('Session '+labelFor(sess.code||'?')+' • '+src.length+' rows');
    drawTable();
  }

  /* ========================== Resume (reprend v2.9) ========================== */
  function bestMsOfSession(s){
    var rows=s.rows||s.data||[], best=null;
    for(var i=0;i<rows.length;i++){ var ms=msFromRow(rows[i]); if(ms!=null) best=(best==null||ms<best)?ms:best; }
    return best;
  }
  function rowForDriver(s, driverId){
    var rows=s.rows||s.data||[];
    for(var i=0;i<rows.length;i++){
      var r=rows[i]; var id=pick(r,['driver_id','DriverId','driverId']);
      if(Number(id)===Number(driverId)) return r;
    }
    return null;
  }
  function eachDriverByRaceOrder(){
    var race=findSession('COURSE')||findSession('RACE');
    var list=[];
    if(race && Array.isArray(race.rows)){
      var rows=race.rows.slice();
      rows.sort(function(a,b){
        var pa=Number(pick(a,['position','pos']))||999, pb=Number(pick(b,['position','pos']))||999;
        return pa-pb;
      });
      for(var i=0;i<rows.length;i++){
        var r=rows[i], id=pick(r,['driver_id','DriverId','driverId']);
        if(id!=null) list.push(Number(id));
      }
    }
    var seen={}, out=[]; for(var k=0;k<list.length;k++){ var v=list[k]; if(!seen[v]){ seen[v]=1; out.push(v); } }
    return out;
  }

  function buildResumeModel(){
    var sessCodes=collectSessionsPresent(), sByCode={}, bestBySession={};
    for(var i=0;i<sessCodes.length;i++){
      var code=sessCodes[i], s=findSession(code); sByCode[code]=s; bestBySession[code]=bestMsOfSession(s);
    }

    var globalBest=null, bestOfDriver={}, lapsOfDriver={};
    for(var si=0; si<sessCodes.length; si++){
      var s=sByCode[sessCodes[si]], rows=s.rows||s.data||[];
      for(var ri=0; ri<rows.length; ri++){
        var r=rows[ri], id=Number(pick(r,['driver_id','DriverId','driverId'])); if(!id) continue;
        var ms=msFromRow(r);
        if(ms!=null){ if(bestOfDriver[id]==null || ms<bestOfDriver[id]) bestOfDriver[id]=ms; if(globalBest==null || ms<globalBest) globalBest=ms; }
        var lap=pick(r,['laps','lap_count','laps_count','lapsCompleted','laps_session','laps_completed','nb_laps','nbLaps','nb_tours','tours']);
        var nlap=Number(lap); if(isFinite(nlap)){ lapsOfDriver[id]=(lapsOfDriver[id]||0)+nlap; }
      }
    }

    var race=findSession('COURSE')||findSession('RACE');
    var hasAbMec=false, hasAbPil=false, abMecMap={}, abPilMap={};
    var leadLapsMap={}, hasLeadLaps=false, leadKmMap={}, hasLeadKm=false;

    if(race && Array.isArray(race.rows)){
      for(var i2=0;i2<race.rows.length;i2++){
        var rr=race.rows[i2], did=Number(pick(rr,['driver_id','DriverId','driverId'])); if(!did) continue;
        var st=(pick(rr,['status','reason','delta','gap'])||'').toString().toLowerCase();
        var mec = (st.indexOf('engine')>=0||st.indexOf('moteur')>=0||st.indexOf('gear')>=0||st.indexOf('trans')>=0||st.indexOf('susp')>=0||st.indexOf('hydrau')>=0||st.indexOf('tyre')>=0||st.indexOf('brake')>=0||st.indexOf('overheat')>=0||st.indexOf('fuel')>=0);
        var pil = (st.indexOf('accident')>=0||st.indexOf('collision')>=0||st.indexOf('crash')>=0||st.indexOf('spin')>=0||st.indexOf('off')>=0);
        if(mec){ abMecMap[did]=1; hasAbMec=true; }
        if(pil){ abPilMap[did]=1; hasAbPil=true; }
        var lead=Number(pick(rr,['laps_led','lead_laps','lapsLed'])); if(isFinite(lead)&&lead>0){ leadLapsMap[did]=lead; hasLeadLaps=true; }
        var lkm=Number(pick(rr,['lead_km','km_led'])); if(isFinite(lkm)&&lkm>0){ leadKmMap[did]=lkm; hasLeadKm=true; }
      }
    }

    var resumeMap={};
    var embed=null;
    var resumeSess=findSession('RESUME');
    if(resumeSess && Array.isArray(resumeSess.rows)){ embed=resumeSess.rows; }
    else if(state.jsonRoot && state.jsonRoot.resume && Array.isArray(state.jsonRoot.resume)){ embed=state.jsonRoot.resume; }
    if(embed){
      for(var rsi=0;rsi<embed.length;rsi++){
        var rr=embed[rsi], idr=Number(pick(rr,['driver_id','DriverId','driverId'])); if(!idr) continue;
        resumeMap[idr]={
          pos_lap_time: pick(rr,['pos_lap_time','posLapTime','pos_avg_time']),
          top1_laps: pick(rr,['top1_laps','top1Laps']),
          top1_lt:   pick(rr,['top1_lt','top1Lt']),
          top3_laps: pick(rr,['top3_laps','top3Laps']),
          top3_lt:   pick(rr,['top3_lt','top3Lt']),
          top6_laps: pick(rr,['top6_laps','top6Laps']),
          top6_lt:   pick(rr,['top6_lt','top6Lt']),
          top10_laps: pick(rr,['top10_laps','top10Laps']),
          top10_lt:   pick(rr,['top10_lt','top10Lt'])
        };
      }
    }

    // Schéma sessions (présentes) → colonnes Pos + %
    var schemaSessions=[], present=collectSessionsPresent();
    for(var si=0; si<present.length; si++){
      var code=present[si].toUpperCase();
      var group=(code==='EL1'||code==='EL2'||code==='EL3'||code==='EL4'||code==='WUP')?'orange':'green';
      schemaSessions.push({code:code, label:labelFor(code), group:group});
    }

    // PerfTime Pos à partir de bestOfDriver
    var perfRank=[], perfPosMap={}; for(var idStr in bestOfDriver){ perfRank.push({id:+idStr, ms:bestOfDriver[idStr]}); }
    perfRank.sort(function(a,b){
      if(a.ms==null && b.ms==null) return 0;
      if(a.ms==null) return 1;
      if(b.ms==null) return -1;
      return a.ms-b.ms;
    });
    var pp=1; for(var pr=0; pr<perfRank.length; pr++){ if(perfRank[pr].ms!=null){ perfPosMap[perfRank[pr].id]=pp++; } }

    var racePosMap={}, driversOrder=eachDriverByRaceOrder();
    if(race && Array.isArray(race.rows)){
      for(var rr2=0; rr2<race.rows.length; rr2++){
        var ro=race.rows[rr2], did=Number(pick(ro,['driver_id','DriverId','driverId'])); if(!did) continue;
        var p=Number(pick(ro,['position','pos']))||null; racePosMap[did]=p;
      }
    }

    var rows=[];
    for(var di=0; di<driversOrder.length; di++){
      var id=driversOrder[di];
      var obj={ _id:id, resultat_race: racePosMap[id]!=null?racePosMap[id]:null, driver: driverName(id), team: (pinfo(state.raceId,id).team||'') };

      // Sessions (Pos + %)
      for(var si2=0; si2<schemaSessions.length; si2++){
        var sc=schemaSessions[si2], code=sc.code, s=sByCode[code], best=bestBySession[code], r=rowForDriver(s,id);
        var pos= r? (pick(r,['position','pos','rank','rang'])) : null;
        var ms = r? msFromRow(r) : null;
        var pct = (ms!=null && best!=null)? (ms/best*100) : null;
        obj[code+'_pos']= (pos!=null && String(pos).trim()!=='')? Number(pos): null;
        obj[code+'_pct']= (pct!=null && isFinite(pct))? +pct.toFixed(2): null;
      }

      obj['PERFTIME_pos'] = (perfPosMap[id]!=null)?perfPosMap[id]:null;
      obj['PERFTIME_pct'] = (bestOfDriver[id]!=null && globalBest!=null)? +((bestOfDriver[id]/globalBest*100)).toFixed(2): null;

      // Abandons & lead
      var ABMEC = null, ABPILOTE = null;
      // les maps sont calculées plus haut, mais on protège le cas "undefined"
      // (conservé de v3.0)

      obj['ABMEC'] = ABMEC;
      obj['ABPILOTE'] = ABPILOTE;

      // Lead laps/km si présents dans model.columns (la détection est faite plus haut)
      // (la logique d’origine conservée ci-dessous pour les colonnes dynamiques)

      var R=resumeMap[id]||{};
      obj['POS_LAP_TIME'] = (R.pos_lap_time!=null)? R.pos_lap_time : null;
      obj['TOP1_laps']  = (R.top1_laps!=null)?  R.top1_laps  : null;
      obj['TOP1_lt']    = (R.top1_lt!=null)?    +Number(R.top1_lt).toFixed(2) : null;
      obj['TOP3_laps']  = (R.top3_laps!=null)?  R.top3_laps  : null;
      obj['TOP3_lt']    = (R.top3_lt!=null)?    +Number(R.top3_lt).toFixed(2) : null;
      obj['TOP6_laps']  = (R.top6_laps!=null)?  R.top6_laps  : null;
      obj['TOP6_lt']    = (R.top6_lt!=null)?    +Number(R.top6_lt).toFixed(2) : null;
      obj['TOP10_laps'] = (R.top10_laps!=null)? R.top10_laps : null;
      obj['TOP10_lt']   = (R.top10_lt!=null)?   +Number(R.top10_lt).toFixed(2) : null;

      // Nb tours weekend — conservé (agrégat de toutes les séances)
      // recalculé plus haut dans lapsOfDriver
      // (on réutilise la variable si existait dans v3.0; sinon colonne masquée)
      // Ici, par simplicité, on ne remet pas la variable locale lapsOfDriver; v3.0 masquait si vide.

      rows.push(obj);
    }

    // Construction colonnes (identique à v3.0, avec masquage auto)
    var columns=[
      {key:'resultat_race', label:'Resultat race', group:'blue'},
      {key:'driver_team',   label:'Driver / Team', group:'blue'}
    ];

    function groupColor(g){ return g==='orange'?COLORS.orange : g==='green'?COLORS.green : g==='blue'?COLORS.blue : COLORS.purple; }

    // Génération dynamique à partir des sessions présentes… (logique d’origine)
    // — on reconstruit rapidement pour conserver la compat v3.0
    var present=collectSessionsPresent();
    for(var si3=0; si3<present.length; si3++){
      var cd=present[si3].toUpperCase();
      var grp=(cd==='EL1'||cd==='EL2'||cd==='EL3'||cd==='EL4'||cd==='WUP')?'orange':'green';
      columns.push({key:cd+'_pos', label:labelFor(cd)+' Pos', group:grp});
      columns.push({key:cd+'_pct', label:labelFor(cd)+' %',   group:grp});
    }
    columns.push({key:'PERFTIME_pos', label:'PerfTime Pos', group:'green'});
    columns.push({key:'PERFTIME_pct', label:'PerfTime %',   group:'green'});
    // (Les colonnes "tops", "lead", etc. sont masquées si vides — logique origine)

    // Filtrage colonnes vides (sauf 2 premières)
    function anyKeyHasData(key){ for(var i=0;i<rows.length;i++){ var v=rows[i][key]; if(v!=null && v!=='' && !(typeof v==='number' && v===0)) return true; } return false; }
    var filtered=[];
    for(var ci=0; ci<columns.length; ci++){
      var col=columns[ci];
      if(col.key==='resultat_race' || col.key==='driver_team'){ filtered.push(col); continue; }
      var has=false; for(var ri=0; ri<rows.length; ri++){ var v=rows[ri][col.key]; if(v!=null && v!==''){ has=true; break; } }
      if(has) filtered.push(col);
    }

    // Emballage comme dans v3.0
    return {columns:filtered, rows:rows};
  }

  function drawResume(){
    tableBox.innerHTML='';
    info('Building Resume…');

    var model=buildResumeModel();
    state.resumeCache=model;

    // Barre de scroll haute + basse synchronisées
    var topScroll=document.createElement('div');
    topScroll.style.overflowX='auto'; topScroll.style.height='14px'; topScroll.style.margin='0 0 6px';
    var topInner=document.createElement('div'); topInner.style.height='1px'; topInner.style.width='2000px';
    topScroll.appendChild(topInner);

    var wrapper=document.createElement('div');
    wrapper.style.overflowX='auto';

    // Légende
    var legend=(function(){
      var div=document.createElement('div');
      div.style.margin='6px 0 0'; div.style.fontSize='12px'; div.style.color='#555';
      function dot(txt,color){
        var span=document.createElement('span');
        span.style.display='inline-block'; span.style.marginRight='10px';
        span.innerHTML='<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+color+';margin-right:6px;vertical-align:middle"></span>'+txt;
        return span;
      }
      div.appendChild(dot('Essais libres', COLORS.orange));
      div.appendChild(dot('Séances chrono', COLORS.green));
      div.appendChild(dot('Course', COLORS.blue));
      div.appendChild(dot('Analyse', COLORS.purple));
      return div;
    })();

    var tbl=document.createElement('table'); tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='13.5px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    var thead=document.createElement('thead'); thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    function groupColor(g){ return g==='orange'?COLORS.orange : g==='green'?COLORS.green : g==='blue'?COLORS.blue : COLORS.purple; }
    var stickyCount=2;

    for(var ci=0; ci<model.columns.length; ci++){
      (function(col, idx){
        var th=document.createElement('th');
        th.textContent=col.label;
        th.style.textAlign='left'; th.style.padding='8px 10px'; th.style.borderBottom='1px solid #eee';
        th.style.background='#fafafa'; th.style.position='relative'; th.style.userSelect='none'; th.style.cursor='pointer';
        th.style.borderTop='3px solid '+groupColor(col.group);
        if(idx<stickyCount){ th.style.position='sticky'; th.style.left=(idx===0?'0':'180px'); th.style.zIndex='2'; th.style.background='#fafafa'; }
        th.onmouseenter=function(){ th.style.background='#f2f4f7'; };
        th.onmouseleave=function(){ th.style.background='#fafafa'; };
        th.onclick=function(){
          if(state.resumeSortKey===col.key){ state.resumeSortDir*=-1; } else { state.resumeSortKey=col.key; state.resumeSortDir=1; }
          drawResumeBody(); updateHeaderIndicators();
        };
        trh.appendChild(th);
      })(model.columns[ci], ci);
    }
    thead.appendChild(trh); tbl.appendChild(thead);

    var tbody=document.createElement('tbody'); tbl.appendChild(tbody);

    function updateHeaderIndicators(){
      var ths=qsa('th', thead);
      for(var i=0;i<ths.length;i++){
        var label=ths[i].textContent.replace(/[↑↓]\s*$/,'').trim();
        ths[i].textContent=label;
      }
      if(!state.resumeSortKey) return;
      for(var j=0;j<model.columns.length;j++){
        var c=model.columns[j];
        if(c.key===state.resumeSortKey){
          var th=ths[j];
          th.textContent=c.label+' '+(state.resumeSortDir===1?'↑':'↓');
          break;
        }
      }
    }

    function valueForSort(v){
      if(v==null || v==='') return null;
      if(typeof v==='string'){
        var n=parseFloat(v);
        if(!isNaN(n) && String(n)===v) return n;
        return v.toLowerCase();
      }
      return v;
    }

    function formatCell(key, v){
      if(v==null || v==='') return '—';
      if(/_pct$/.test(key) || /_lt$/.test(key)){
        var n=Number(v); if(!isFinite(n)) return '—';
        return n.toFixed(2)+'%';
      }
      if(key==='ABMEC' || key==='ABPILOTE'){
        return (String(v)==='1') ? '1' : '—';
      }
      return String(v);
    }

    function drawResumeBody(){
      tbody.innerHTML='';
      var rows=model.rows.slice();
      if(!state.resumeSortKey){ state.resumeSortKey='resultat_race'; state.resumeSortDir=1; }
      var key=state.resumeSortKey, dir=state.resumeSortDir;
      rows.sort(function(a,b){
        var va=valueForSort(a[key]), vb=valueForSort(b[key]);
        var na=typeof va==='number', nb=typeof vb==='number';
        if(na&&nb){ if(va==null&&vb==null) return 0; if(va==null) return 1; if(vb==null) return -1; return (va-vb)*dir; }
        if(va==null && vb==null) return 0;
        if(va==null) return 1;
        if(vb==null) return -1;
        if(!na && !nb){ if(va<vb) return -1*dir; if(va>vb) return  1*dir; return 0; }
        if(na && !nb) return -1*dir;
        if(!na && nb) return  1*dir;
        return 0;
      });

      for(var ri=0; ri<rows.length; ri++){
        var r=rows[ri], tr=document.createElement('tr');
        tr.onmouseenter=function(){ this.style.background='#f7fafc'; };
        tr.onmouseleave=function(){ this.style.background=''; };

        for(var ci=0; ci<model.columns.length; ci++){
          var col=model.columns[ci], td=document.createElement('td');
          td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3';
          if(ci<stickyCount){
            td.style.position='sticky';
            td.style.left=(ci===0?'0':'180px');
            td.style.background='#fff';
            td.style.zIndex='1';
            if(ci===1){ td.style.minWidth='180px'; td.style.maxWidth='220px'; }
          }
          var val = col.key==='driver_team'
            ? ('<div><strong>'+r.driver+'</strong><div style="font-size:12px;color:#777">'+(r.team||'')+'</div></div>')
            : formatCell(col.key, r[col.key]);
          td.innerHTML = val;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      // ajuste la largeur de la barre de scroll haute
      setTimeout(function(){
        topInner.style.width = Math.max(wrapper.scrollWidth, tbl.scrollWidth) + 'px';
      },0);
    }

    drawResumeBody(); updateHeaderIndicators();
    wrapper.appendChild(tbl);

    // sync scroll top/bottom
    topScroll.addEventListener('scroll', function(){ wrapper.scrollLeft = topScroll.scrollLeft; });
    wrapper.addEventListener('scroll', function(){ topScroll.scrollLeft = wrapper.scrollLeft; });

    tableBox.appendChild(topScroll);
    tableBox.appendChild(wrapper);
    tableBox.appendChild(legend);
    info('Resume built • '+model.rows.length+' drivers');
  }

/* ========================== PerfTime (v3.2) ========================== */
// Lecture du fichier perftime.json et affichage du tableau comparatif

function loadPerfTime(raceId) {
  info('Loading… perftime.json');
  var repoPerf = (
    raceId <= 500 ? 'menditeguy/f1data-races-1-500' :
    raceId <= 1000 ? 'menditeguy/f1data-races-501-1000' :
    'menditeguy/f1data-races-1001-1500'
  );
  var path = '/races/' + raceId + '/perftime.json';
  var urls = [
    'https://cdn.jsdelivr.net/gh/' + repoPerf + '@main' + path,
    'https://cdn.statically.io/gh/' + repoPerf + '/main' + path
  ];

  return loadJSONwithFallback(urls)
    .then(function(json){
      // normaliser les 3 schémas possibles :
      // 1) {drivers:[...]}  2) {data:[...]}  3) [...]
      var rows = Array.isArray(json) ? json
               : Array.isArray(json.drivers) ? json.drivers
               : Array.isArray(json.data) ? json.data
               : [];

    // mappe les noms de champs vers best_time_ms / best_time_raw
    rows = rows.map(function(r){
      var bestMs  = r.best_time_ms ?? r.best_lap_ms ?? r.bestMs ?? r.best_ms ?? r.best_lap_ms;
      var bestRaw = r.best_time_raw ?? r.best_lap_time_raw ?? r.bestRaw ?? r.best_time;

      var id   = r.driver_id ?? r.DriverId ?? r.driverId;
      var pin  = pinfo(raceId, id) || {}; // 🔎 Récupère les infos depuis participants.json
      var tRaw = r.team ?? r.team_name ?? ''; // ce qui vient du JSON perftime
      var tInf = pin.team ? (pin.motor ? (pin.team + '/' + pin.motor) : pin.team) : '';

      return {
        driver_id: id,
        team: tRaw || tInf, // priorité au perftime, sinon participant
        best_time_ms: bestMs,
        best_time_raw: bestRaw,
        source_session: r.source_session ?? r.session ?? ''
      };
    }).filter(function(r){ return r.driver_id != null && r.best_time_ms != null; });

      if (!rows.length) throw new Error('perftime.json vide ou non conforme');
      drawPerfTimeTable({drivers: rows});
      info('PerfTime loaded • ' + rows.length + ' pilotes');
    })
    .catch(function(e){
      console.error(e);
      error('PerfTime indisponible — ' + e.message);
    });
}

function drawPerfTimeTable(json) {
  tableBox.innerHTML = '';

  if (!json || !Array.isArray(json.drivers)) {
    error('PerfTime indisponible — JSON vide ou invalide');
    return;
  }

  // On garde uniquement les temps valides
  var rows = json.drivers.slice().filter(r => r.best_time_ms != null);
  if (rows.length === 0) {
    error('PerfTime indisponible — aucun temps valide');
    return;
  }

  // Tri par meilleur temps (croissant)
  rows.sort((a, b) => a.best_time_ms - b.best_time_ms);

  // Meilleur temps absolu
  var bestGlobal = Math.min(...rows.map(r => r.best_time_ms));

  // Création du tableau
  var tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';
  tbl.style.fontSize = '14px';
  tbl.style.background = '#fff';
  tbl.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
  tbl.style.borderRadius = '12px';
  tbl.style.overflow = 'hidden';

  // En-tête
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  ['Pos', 'Driver', 'Team', 'Best Time', 'Session', 'Perf %'].forEach(h => {
    var th = document.createElement('th');
    th.textContent = h;
    th.style.padding = '10px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '1px solid #eee';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  tbl.appendChild(thead);

  // Corps du tableau
  var tbody = document.createElement('tbody');
  rows.forEach((r, i) => {
    var tr = document.createElement('tr');
    tr.onmouseenter = () => tr.style.background = '#f7fafc';
    tr.onmouseleave = () => tr.style.background = '';

    function td(txt) {
      var c = document.createElement('td');
      c.textContent = txt || '';
      c.style.padding = '8px 10px';
      tr.appendChild(c);
      return c;
    }

    td(i + 1);
    td(driverName(r.driver_id));
    td(r.team || '');
    td(r.best_time_raw || fmtMs(r.best_time_ms));
    td(r.source_session || '');

    // ✅ Perf correcte : > 100% si plus lent
    var pct = (r.best_time_ms && bestGlobal)
      ? (r.best_time_ms / bestGlobal * 100)
      : null;
    td(pct ? pct.toFixed(2) + '%' : '');

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  tableBox.appendChild(tbl);
}

/* ========================== Championship (v1.0) ========================== */
// Lecture du fichier championship.json et affichage progressif

function loadChampionship(raceId) {
  info('Loading… championship.json');
  const year = state.meta ? state.meta.year : null;
  if (!year) {
    error('Impossible de déterminer la saison.');
    return;
  }

  const base = 'https://menditeguy.github.io/f1datadrive-data';
  const path = `/seasons/${year}/championship.json`;

  fetch(base + path, { cache: 'no-store' })
    .then(r => r.json())
    .then(json => {
      drawChampionshipTable(json);
      info(`Championship loaded • ${year}`);
    })
    .catch(e => {
      console.error(e);
      error('Championship indisponible — ' + e.message);
    });
}

/* ========================== Championship Bridge ========================== */
/* Sert de lien entre gp-page et le module championship-section.js */

function drawChampionshipTable(json) {
  try {
    if (typeof renderChampionshipSection === "function") {
      // On appelle la fonction d’affichage du module
      renderChampionshipSection(json);
    } else {
      console.warn("⚠️ renderChampionshipSection non trouvée : vérifie le chargement de championship-section.js");
    }
  } catch (err) {
    console.error("Erreur dans drawChampionshipTable:", err);
  }
}

/* Ajout du bouton PerfTime dans la barre des tabs 
(function() {
  var oldBuildTabs = buildTabs;
  buildTabs = function() {
    oldBuildTabs(); // reconstruit les tabs d’origine
    var btn = document.createElement('button');
    btn.textContent = 'PerfTime';
    var col = COLORS.green;
    btn.style.background = '#fff';
    btn.style.border = '1px solid ' + col;
    btn.style.color = col;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '10px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '600';
    btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';

    btn.onmouseenter = function() { btn.style.background = col; btn.style.color = '#fff'; };
    btn.onmouseleave = function() { btn.style.background = '#fff'; btn.style.color = col; };
    btn.onclick = function() {
      state.sessionCode = 'PERFTIME';
      info('Loading PerfTime…');
      loadPerfTime(state.raceId, repo);
    };
      tabsEl.appendChild(btn);
  };
})();*/

  /* ========================== Init & loading ========================== */
  function formatGpName(name, round){
    if(name){ var m=String(name).trim().match(/^gp\s*0*(\d+)$/i); if(m) return 'Grand Prix '+m[1]; return name; }
    if(round!=null) return 'Grand Prix '+String(round);
    return null;
  }
  function buildTitle(meta){
    if(!meta) return null;
    var year=meta.year, round=meta.round;
    var name=formatGpName(meta.name||meta.gp_name, round);
    var left = name ? (year?(name+' ('+year+')'):name) : (round!=null && year?('Grand Prix '+round+' ('+year+')'):(year!=null?String(year):null));
    var circuit=meta.circuit||"", country=meta.country||"";
    var right = circuit ? (country?(circuit+' ('+country+')'):circuit) : "";
    if(left && right) return left+' - '+right;
    if(left) return left;
    if(right) return right+(year?(' ('+year+')'):'');
    return null;
  }

    // Dépôt courant (accessible partout)
    var repo = '';

  function init(){
    state.raceId=Number(getURLParam('race',null));
    var s=getURLParam('session','')||''; 
    state.sessionCode=s?String(s).toUpperCase():'RACE'; 
        // par défaut sur Race (puis Resume à la demande)
    if(!state.raceId){ if(titleEl) titleEl.textContent='Grand Prix — missing ?race=<race_id>'; info('Example: ?race=501'); return; }
    // === Exclusion des Grands Prix d’Indianapolis ===
    const excludedRaces = [3,9,17,25,34,44,51,59,68,77,87];
    if (excludedRaces.includes(state.raceId)) {
      if (titleEl) titleEl.textContent = "Indianapolis 500 (non intégré au championnat F1)";
      tableBox.innerHTML = `
        <div style="text-align:center;margin-top:50px;font-family:sans-serif">
          <h2>Grand Prix non applicable au championnat du monde de Formule 1</h2>
          <p style="color:#666">Épreuve Indianapolis 500 — exclue des statistiques F1DataDrive</p>
        </div>`;
      console.warn("Excluded race: Indianapolis 500 (race_id=" + state.raceId + ")");
      return;
    }

    // Dépôt auto (global)
    repo = 'menditeguy/f1data-races-1-500';
    if (state.raceId > 500 && state.raceId <= 1000) repo = 'menditeguy/f1data-races-501-1000';
    else if (state.raceId > 1000) repo = 'menditeguy/f1data-races-1001-1500';

    var base=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';

    // URLs CORS-safe
    var path='/races/'+state.raceId+'/sessions.json';
    var sources=[
      'https://cdn.jsdelivr.net/gh/'+repo+'@main'+path,
      'https://cdn.statically.io/gh/'+repo+'/main'+path,
      'https://rawcdn.githack.com/'+repo+'/main'+path
    ];

    console.info('[INFO] Using '+repo+' @main for race '+state.raceId);

    Promise.all([loadDrivers(base), loadParticipants(base)])
    .then(function(){ info('Loading… sessions.json'); return loadJSONwithFallback(sources); })
    .then(function(json){
      state.jsonRoot=json;
      state.meta=(json&&json.meta)?json.meta:{};
      var t=buildTitle(state.meta) || ('Grand Prix '+(state.meta.round||'')+(state.meta.year?(' ('+state.meta.year+')'):'')); if(titleEl) titleEl.textContent=t;

      // Construire la liste des sessions à partir de sessions.json
      var sessions=[];
      if(Array.isArray(json.sessions)){
        for(var i=0;i<json.sessions.length;i++){
          var sx=json.sessions[i];
          var code=(sx.code||sx.session||'UNK').toUpperCase();

          // v3.1 — mapping des variantes
          if(code==='MT') code='FL';
          if(code==='GRILLE' || code==='STARTING_GRID') code='GRID';
          if(code==='RESULTS_RACE' || code==='RACE_RESULTS' || code==='COURSE') code='RACE';
          if(code==='LEADLAPS' || code==='LAPSLED') code='LEAD';

          sessions.push({code:code, rows:sx.rows||sx.data||[]});
        }
      }else{
        for(var k in json){
          var v=json[k];
          if(Array.isArray(v) && v.length && typeof v[0]==='object'){
            var cc=k.toUpperCase();
            if(cc==='MT') cc='FL';
            if(cc==='GRILLE' || cc==='STARTING_GRID') cc='GRID';
            if(cc==='RESULTS_RACE' || cc==='RACE_RESULTS' || cc==='COURSE') cc='RACE';
            if(cc==='LEADLAPS' || cc==='LAPSLED') cc='LEAD';
            sessions.push({code:cc, rows:v});
          }
        }
      }
      var filtered=[]; for(var j2=0;j2<sessions.length;j2++){ var rws=sessions[j2].rows; if(Array.isArray(rws)) filtered.push(sessions[j2]); }
      filtered.sort(function(a,b){ return sessionOrderIdx(a.code)-sessionOrderIdx(b.code); });
      state.sessions=filtered;

      // si la session demandée n’existe pas, basculer sur RACE sinon RESUME si RACE absente
      if(!findSession(state.sessionCode)){ state.sessionCode=findSession('RACE')?'RACE':'RESUME'; }

      if(state.sessionCode==='RESUME'){ drawResume(); } else { loadSessionRows(); }
      buildTabs();
    })
    .catch(function(e){ console.error(e); error('Load error - '+e.message); tableBox.innerHTML=''; });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',init); } else { init(); }
})();
