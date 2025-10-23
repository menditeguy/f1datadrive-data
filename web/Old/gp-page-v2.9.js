// gp-page-v2.9.js — ES5 compatible
// - Dynamic session ribbon (EL, Q, WUP, GRID, FL, Race, + Resume)
// - Resume view: 2 columns (Pos + %) per session, PerfTime (Pos + %), TopX (Laps + Lt), Ab*, Lead*
// - Sortable headers, sticky first columns, color bands per group, mini-hover, legend
// - Auto-hide empty columns (no data across all drivers)
// - Laps fix: never use race fallback for practices/qual/wup/fl

(function(){
  'use strict';

  /* ========================== Small utils ========================== */
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return (root||document).querySelectorAll(sel); }
  function isNum(x){ return x!==null && x!=='' && !isNaN(x); }
  function getURLParam(k,d){ try{var u=new URL(window.location.href);var v=u.searchParams.get(k);return v===null?d:v;}catch(e){return d;} }
  function fmtMs(v){ if(v==null||isNaN(+v)) return v; var ms=+v,s=Math.floor(ms/1000),mm=Math.floor(s/60),ss=s%60,mmm=ms%1000; return mm+':'+String(ss).padStart(2,'0')+'.'+String(mmm).padStart(3,'0'); }
  function pick(o,keys){ if(!o) return null; for(var i=0;i<keys.length;i++){var k=keys[i]; if(o[k]!=null && o[k]!=='') return o[k];} return null; }
  function clone(o){ var r={}; for(var k in o){ r[k]=o[k]; } return r; }
  function loadText(url){
    return fetch(url,{cache:'no-store'}).then(function(r){
      return r.text().then(function(t){
        if(!r.ok) throw new Error('HTTP '+r.status+' on '+url+' — '+t.slice(0,120));
        return t;
      });
    });
  }
  function loadJSON(url){ return loadText(url).then(function(t){ try{return JSON.parse(t);}catch(e){ throw new Error('Invalid JSON at '+url+' — '+t.slice(0,120)); } }); }

  /* ========================== Lookups ========================== */
  var DRIVERS=null, PARTICIPANTS=null;
  function loadDrivers(base){ return loadJSON(base+'/lookups/drivers.min.json').then(function(j){DRIVERS=j;}); }
  function loadParticipants(base){ return loadJSON(base+'/lookups/participants.json').then(function(j){PARTICIPANTS=j;}); }
  function driverName(id){ if(id==null) return ''; var k=String(id); return DRIVERS&&DRIVERS[k]?DRIVERS[k]:String(id); }
  function pinfo(raceId, driverId){ if(!PARTICIPANTS) return {}; var rn=PARTICIPANTS[String(raceId)]||{}; return rn[String(driverId)]||{}; }

  /* ========================== Time helpers ========================== */
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

  /* ========================== DOM refs & state ========================== */
  var app=qs('#f1-gp-app');
  var titleEl=qs('#gpTitle',app);
  var statusEl=qs('#status',app);
  var tabsEl=qs('#sessionTabs',app);
  var tableBox=qs('#sessionTable',app);

  var COLORS={
    orange:'#ee5a2f', // EL / WUP
    green:'#188038',  // Q / Grid / FL / PerfTime
    blue:'#1a73e8',   // Race data (Resultat race, Ab*, Lead*)
    purple:'#6A32A8'  // Analysis (TopX, Pos lap/time, Nb tours weekend)
  };

  var state={
    raceId:null,
    meta:null,
    jsonRoot:null,
    sessions:[],   // [{code, rows}]
    sessionCode:null,
    rows:[],       // for normal session table
    sort:{key:'pos',dir:1},
    columns:['pos','no','driver','car_engine','laps','time','gap_reason'],
    resumeCache:null,  // computed object for Resume view
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
    var HEAD_MAP={pos:'Pos',no:'No',driver:'Driver',car_engine:'Car / Engine',laps:'Laps',time:'Time',gap_reason:'Gap / Reason'};
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
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='SPRINT_SHOOTOUT'||c==='GRID'||c==='GRILLE'||c==='FL'||c==='PERFTIME') return COLORS.green;
    if(c==='COURSE'||c==='RACE'||c==='RESULTRACE'||c==='ABMEC'||c==='ABPILOTE'||c==='LEAD'||c==='LEADKM') return COLORS.blue;
    if(c==='RESUME'||c==='ANALYSE'||c==='POS_LAP_TIME'||c.indexOf('TOP')===0||c==='NBTOTLAPS'||c==='NBTWKND') return COLORS.purple;
    return COLORS.blue;
  }
  function labelFor(code){
    var m=String(code||'').toUpperCase();
    var map={ 'COURSE':'Race', 'RACE':'Race', 'GRILLE':'Grid', 'GRID':'Grid', 'SPRINT_SHOOTOUT':'SQ', 'MT':'FL', 'RESUME':'Resume' };
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
    ensureTabs(); tabsEl.innerHTML='';
    if(!state.sessions || !state.sessions.length) return;

    var hasRace=state.sessions.some(function(s){ return s.code==='COURSE' || s.code==='RACE'; });
    var list=state.sessions.slice();
    if(hasRace){ list.push({code:'RESUME',rows:[]}); }

    for(var i=0;i<list.length;i++){
      (function(sx){
        var code=sx.code.toUpperCase();
        var btn=document.createElement('button');
        btn.textContent=labelFor(code);
        var col=colorFor(code);
        btn.style.background='#fff'; btn.style.border='1px solid '+col; btn.style.color=col;
        btn.style.padding='6px 10px'; btn.style.borderRadius='10px'; btn.style.cursor='pointer'; btn.style.fontWeight='600';
        btn.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';
        btn.onmouseenter=function(){ btn.style.background=col; btn.style.color='#fff'; };
        btn.onmouseleave=function(){ if(state.sessionCode===code){ btn.style.background=col; btn.style.color='#fff'; } else { btn.style.background='#fff'; btn.style.color=col; } };
        btn.onclick=function(){
          if(state.sessionCode===code) return;
          state.sessionCode=code;
          if(code==='RESUME'){ drawResume(); }
          else{ loadSessionRows(); buildTabs(); }
        };
        if(state.sessionCode===code){ btn.style.background=col; btn.style.color='#fff'; }
        tabsEl.appendChild(btn);
      })(list[i]);
    }
  }

  /* ========================== Build display rows (normal session) ========================== */
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
      if(/^Q[1-4]$/i.test(c) || c==='GRILLE' || c==='GRID' || c==='FL'){ laps=''; }
      else if((laps==null || laps==='') && isRaceType){ laps=(pin.laps!=null?pin.laps:''); }

      var timeDisplay='', gapReason='';
      if(!isRaceType){
        var ms2=msFromRow(r);
        var timeRw=pick(r,['best_lap_time_raw','best_time','time_raw','best_lap','lap_time']);
        timeDisplay = timeRw || (ms2!=null?fmtMs(ms2):'');
        if(ms2!=null && bestMs!=null && ms2>bestMs){ gapReason='+'+fmtMs(ms2-bestMs); }
      }else{
        var delta=pick(r,['delta','gap','race_gap']);
        if(delta && delta.trim().charAt(0)==='+') gapReason=delta;
        if(delta){
          if(isRaceTimeString(delta)){ timeDisplay=delta; }
          else{ gapReason=translateReason(delta); }
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
        driver_id:drvId||null
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

  function loadSessionRows(){
    var sess=null;
    for(var i=0;i<state.sessions.length;i++){ if(state.sessions[i].code===state.sessionCode){ sess=state.sessions[i]; break; } }
    if(!sess && state.sessions.length){ sess=state.sessions[0]; state.sessionCode=sess.code; }
    if(!sess){ state.rows=[]; tableBox.innerHTML=''; info('No session'); return; }

    var src=Array.isArray(sess.rows)?sess.rows:(Array.isArray(sess.data)?sess.data:[]);
    var withNames=[];
    for(var i=0;i<src.length;i++){ var r=src[i], o=clone(r), id=pick(r,['driver_id','DriverId','driverId']); o.driver=driverName(id); withNames.push(o); }
    state.rows=buildDisplayRows(withNames, state.sessionCode, state.raceId);
    state.sort={key:'pos',dir:1};
    info('Session '+labelFor(sess.code||'?')+' • '+src.length+' rows');
    drawTable();
  }

  /* ========================== Resume view ========================== */

  // Order for sessions/grouping
  function sessionOrderIdx(code){
    var order=['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','SPRINT_SHOOTOUT','GRILLE','GRID','FL','PERFTIME','COURSE','RACE'];
    var c=String(code||'').toUpperCase();
    var i=order.indexOf(c); return i<0?999:i;
  }
  function findSession(code){
    var C=String(code).toUpperCase();
    for(var i=0;i<state.sessions.length;i++){
      var sc=state.sessions[i].code;
      if(sc===C) return state.sessions[i];
      if(C==='COURSE' && sc==='RACE') return state.sessions[i];
      if(C==='GRILLE' && sc==='GRID') return state.sessions[i];
      if(C==='FL' && sc==='MT') return state.sessions[i];
      if(C==='PERFTIME' && sc==='PERFTIME') return state.sessions[i];
    }
    return null;
  }
  function collectSessionsPresent(){
    var ss=[];
    for(var i=0;i<state.sessions.length;i++){
      var s=state.sessions[i]; if(s.code==='RESUME') continue;
      var rows=s.rows||s.data||[];
      if(Array.isArray(rows) && rows.length){
        ss.push(s.code);
      }
    }
    ss.sort(function(a,b){ return sessionOrderIdx(a)-sessionOrderIdx(b); });
    return ss;
  }
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
    // unique
    var seen={}, out=[]; for(var k=0;k<list.length;k++){ var v=list[k]; if(!seen[v]){ seen[v]=1; out.push(v); } }
    return out;
  }

  function buildResumeModel(){
    // sessions present
    var sessCodes=collectSessionsPresent();

    // Prepare best per session
    var bestBySession={}, sByCode={};
    for(var i=0;i<sessCodes.length;i++){
      var code=sessCodes[i], s=findSession(code); sByCode[code]=s; bestBySession[code]=bestMsOfSession(s);
    }

    // Compute global best (for PerfTime) & laps weekend per driver
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

    // Abandons & Lead (from Race)
    var race=findSession('COURSE')||findSession('RACE');
    var hasAbMec=false, hasAbPil=false;
    var leadLapsMap={}, hasLeadLaps=false;
    var leadKmMap={}, hasLeadKm=false;

    var abMecMap={}, abPilMap={};
    if(race && Array.isArray(race.rows)){
      for(var i2=0;i2<race.rows.length;i2++){
        var rr=race.rows[i2], did=Number(pick(rr,['driver_id','DriverId','driverId'])); if(!did) continue;
        var st=(pick(rr,['status','reason','delta','gap'])||'').toString().toLowerCase();
        // Heuristics: mechanical vs driver
        var mec = (st.indexOf('moteur')>=0||st.indexOf('engine')>=0||st.indexOf('gear')>=0||st.indexOf('trans')>=0||st.indexOf('susp')>=0||st.indexOf('hydrau')>=0||st.indexOf('tyre')>=0||st.indexOf('brake')>=0||st.indexOf('overheat')>=0||st.indexOf('fuel')>=0);
        var pil = (st.indexOf('accident')>=0||st.indexOf('collision')>=0||st.indexOf('crash')>=0||st.indexOf('spin')>=0||st.indexOf('off')>=0);
        if(mec){ abMecMap[did]=1; hasAbMec=true; }
        if(pil){ abPilMap[did]=1; hasAbPil=true; }
        // Lead laps (if present)
        var lead=Number(pick(rr,['laps_led','lead_laps','lapsLed']));
        if(isFinite(lead) && lead>0){ leadLapsMap[did]=lead; hasLeadLaps=true; }
        var lkm=Number(pick(rr,['lead_km','km_led']));
        if(isFinite(lkm) && lkm>0){ leadKmMap[did]=lkm; hasLeadKm=true; }
      }
    }

    // Optional embedded resume metrics from JSON
    // expected per row: { driver_id, pos_lap_time, top1_laps, top1_lt, top3_laps, top3_lt, top6_laps, top6_lt, top10_laps, top10_lt }
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

    // Compute session columns schema: for each present session -> [Pos, %]
    var schemaSessions=[];
    for(var si=0; si<sessCodes.length; si++){
      var code=sessCodes[si].toUpperCase();
      schemaSessions.push({code:code, label:labelFor(code), group: (code==='EL1'||code==='EL2'||code==='EL3'||code==='EL4'||code==='WUP')?'orange':'green'});
    }

    // Determine optional columns visibility
    var showAbMec=hasAbMec, showAbPil=hasAbPil;
    var showLeadLaps=hasLeadLaps, showLeadKm=hasLeadKm;

    // PerfTime position: we can compute position by ranking bestOfDriver ascending
    var perfRank=[];
    for(var idStr in bestOfDriver){ perfRank.push({id:+idStr, ms:bestOfDriver[idStr]}); }
    perfRank.sort(function(a,b){
      if(a.ms==null && b.ms==null) return 0;
      if(a.ms==null) return 1;
      if(b.ms==null) return -1;
      return a.ms-b.ms;
    });
    var perfPosMap={}; var pp=1;
    for(var pr=0; pr<perfRank.length; pr++){
      if(perfRank[pr].ms!=null){ perfPosMap[perfRank[pr].id]=pp++; }
    }

    // Build rows for drivers ordered by race result
    var driversOrder=eachDriverByRaceOrder();
    var racePosMap={};
    if(race && Array.isArray(race.rows)){
      for(var rr2=0; rr2<race.rows.length; rr2++){
        var ro=race.rows[rr2], did=Number(pick(ro,['driver_id','DriverId','driverId'])); if(!did) continue;
        var p=Number(pick(ro,['position','pos']))||null; racePosMap[did]=p;
      }
    }

    var rows=[];
    for(var di=0; di<driversOrder.length; di++){
      var id=driversOrder[di];
      var obj={
        _id:id,
        resultat_race: racePosMap[id]!=null?racePosMap[id]:null,
        driver: driverName(id),
        team: (pinfo(state.raceId,id).team||'')
      };

      // Sessions (Pos + %)
      for(var si2=0; si2<schemaSessions.length; si2++){
        var sc=schemaSessions[si2], code=sc.code, s=sByCode[code], best=bestBySession[code], r=rowForDriver(s,id);
        var pos= r? (pick(r,['position','pos','rank','rang'])) : null;
        var ms = r? msFromRow(r) : null;
        var pct = (ms!=null && best!=null)? (ms/best*100) : null;
        var pKey=code+'_pos', qKey=code+'_pct';
        obj[pKey]= (pos!=null && String(pos).trim()!=='')? Number(pos): null;
        obj[qKey]= (pct!=null && isFinite(pct))? +pct.toFixed(2): null;
      }

      // PerfTime (Pos + %)
      obj['PERFTIME_pos'] = (perfPosMap[id]!=null)?perfPosMap[id]:null;
      obj['PERFTIME_pct'] = (bestOfDriver[id]!=null && globalBest!=null)? +((bestOfDriver[id]/globalBest*100)).toFixed(2): null;

      // Abandons (1 only)
      obj['ABMEC'] = abMecMap[id] ? 1 : null;
      obj['ABPILOTE'] = abPilMap[id] ? 1 : null;

      // Lead
      obj['LEAD_laps'] = showLeadLaps && leadLapsMap[id]? leadLapsMap[id] : null;
      obj['LEAD_km']   = showLeadKm && leadKmMap[id]? leadKmMap[id] : null;

      // Analysis from resumeMap
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

      // Nb tours weekend
      obj['NB_TOURS_WKND'] = lapsOfDriver[id]!=null? lapsOfDriver[id]: null;

      rows.push(obj);
    }

    // Columns schema with groups & colors
    var columns=[
      {key:'resultat_race', label:'Resultat race', group:'blue'},
      {key:'driver_team',   label:'Driver / Team', group:'blue'}
    ];

    // add sessions (Pos + %)
    for(var si3=0; si3<schemaSessions.length; si3++){
      var sc2=schemaSessions[si3], code2=sc2.code, lab=sc2.label, grp=sc2.group;
      columns.push({key:code2+'_pos', label:lab+' Pos', group:grp});
      columns.push({key:code2+'_pct', label:lab+' %',   group:grp});
    }

    // PerfTime (Pos + %)
    columns.push({key:'PERFTIME_pos', label:'PerfTime Pos', group:'green'});
    columns.push({key:'PERFTIME_pct', label:'PerfTime %',   group:'green'});

    // Race data (only columns with any data)
    if(showAbMec) columns.push({key:'ABMEC', label:'Ab mec', group:'blue'});
    if(showAbPil) columns.push({key:'ABPILOTE', label:'Ab pilote', group:'blue'});
    if(showLeadLaps) columns.push({key:'LEAD_laps', label:'Lead laps', group:'blue'});
    if(showLeadKm)   columns.push({key:'LEAD_km',   label:'Lead km',   group:'blue'});

    // Analysis (Pos lap/time, TopX, Nb tours weekend)
    columns.push({key:'POS_LAP_TIME', label:'Pos lap/time', group:'purple'});

    // TopX (Laps then Lt)
    function anyKeyHasData(key){
      for(var i=0;i<rows.length;i++){ if(rows[i][key]!=null && rows[i][key]!=='' && rows[i][key]!==0) return true; }
      return false;
    }
    var topGroups=[
      ['TOP1_laps','TOP1 Lt','TOP1_lt','Top1 Laps'],
      ['TOP3_laps','TOP3 Lt','TOP3_lt','Top3 Laps'],
      ['TOP6_laps','TOP6 Lt','TOP6_lt','Top6 Laps'],
      ['TOP10_laps','TOP10 Lt','TOP10_lt','Top10 Laps']
    ];
    for(var tg=0; tg<topGroups.length; tg++){
      var lapsKey=topGroups[tg][0], ltKey=topGroups[tg][2], lapsLabel=topGroups[tg][3], ltLabel=topGroups[tg][1];
      var hasAny = anyKeyHasData(lapsKey) || anyKeyHasData(ltKey);
      if(hasAny){
        columns.push({key:lapsKey, label:lapsLabel, group:'purple'});
        columns.push({key:ltKey,   label:ltLabel,   group:'purple'});
      }
    }

    // Nb tours weekend
    if(anyKeyHasData('NB_TOURS_WKND')){
      columns.push({key:'NB_TOURS_WKND', label:'Nb tours weekend', group:'purple'});
    }

    // Filter out columns with no data at all (except driver_team & resultat_race)
    var filteredCols=[];
    for(var ci=0; ci<columns.length; ci++){
      var col=columns[ci];
      if(col.key==='resultat_race' || col.key==='driver_team'){ filteredCols.push(col); continue; }
      var has=false;
      for(var ri=0; ri<rows.length; ri++){
        var v=rows[ri][col.key];
        if(v!=null && v!=='' && !(typeof v==='number' && v===0)){
          has=true; break;
        }
      }
      if(has) filteredCols.push(col);
    }

    return {columns:filteredCols, rows:rows};
  }

  function drawResume(){
    tableBox.innerHTML='';
    info('Building Resume…');

    var model=buildResumeModel();
    state.resumeCache=model;

    var wrapper=document.createElement('div');
    wrapper.style.overflowX='auto';

    // Legend (bottom, but we create now to append after table)
    var legend=function(){
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
    }();

    var tbl=document.createElement('table'); tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='13.5px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    var thead=document.createElement('thead'); thead.style.background='#fafafa';
    var trh=document.createElement('tr');

    // Group color band (3px) above headers: we insert as a top border per-th
    function groupColor(g){ return g==='orange'?COLORS.orange : g==='green'?COLORS.green : g==='blue'?COLORS.blue : COLORS.purple; }

    // sticky for first two columns
    var stickyCount=2;

    // header cells
    for(var ci=0; ci<model.columns.length; ci++){
      (function(col, idx){
        var th=document.createElement('th');
        th.textContent=col.label;
        th.style.textAlign='left'; th.style.padding='8px 10px'; th.style.borderBottom='1px solid #eee';
        th.style.background='#fafafa'; th.style.position='relative';
        th.style.userSelect='none'; th.style.cursor='pointer';
        th.style.borderTop='3px solid '+groupColor(col.group);
        if(idx<stickyCount){ th.style.position='sticky'; th.style.left=(idx===0?'0':'180px'); th.style.zIndex='2'; th.style.background='#fafafa'; }
        // sorting
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
      // clear all
      var ths=qsa('th', thead);
      for(var i=0;i<ths.length;i++){
        var label=ths[i].textContent.replace(/[↑↓]\s*$/,'').trim();
        ths[i].textContent=label;
      }
      // set one
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

    function drawResumeBody(){
      tbody.innerHTML='';

      // build rows copy
      var rows=model.rows.slice();
      // default sort by 'resultat_race' asc if none chosen
      if(!state.resumeSortKey){ state.resumeSortKey='resultat_race'; state.resumeSortDir=-1; state.resumeSortDir=1; }
      // sort
      var key=state.resumeSortKey, dir=state.resumeSortDir;
      rows.sort(function(a,b){
        var va=valueForSort(a[key]), vb=valueForSort(b[key]);
        // numeric first if both numeric
        var na=typeof va==='number', nb=typeof vb==='number';
        if(na&&nb){
          if(va==null&&vb==null) return 0;
          if(va==null) return 1;
          if(vb==null) return -1;
          return (va-vb)*dir;
        }
        // nulls last
        if(va==null && vb==null) return 0;
        if(va==null) return 1;
        if(vb==null) return -1;
        // string compare
        if(!na && !nb){
          if(va<vb) return -1*dir;
          if(va>vb) return  1*dir;
          return 0;
        }
        // number vs string: numbers first
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
    }

    function formatCell(key, v){
      // default blank
      if(v==null || v==='') return '—';
      // percent keys end with _pct or *_lt
      if(/_pct$/.test(key) || /_lt$/.test(key)){
        var n=Number(v); if(!isFinite(n)) return '—';
        return n.toFixed(2)+'%';
      }
      // AB columns: show only "1"
      if(key==='ABMEC' || key==='ABPILOTE'){
        return (String(v)==='1') ? '1' : '—';
      }
      return String(v);
    }

    // Build header once, then body (to allow sorting updates)
    drawResumeBody();
    updateHeaderIndicators();

    wrapper.appendChild(tbl);
    tableBox.appendChild(wrapper);

    // Legend under the table (left aligned)
    tableBox.appendChild(legend);
    info('Resume built • '+model.rows.length+' drivers');
  }

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

  function init(){
    state.raceId=Number(getURLParam('race',null));
    var s=getURLParam('session','')||''; state.sessionCode=s?String(s).toUpperCase():null;
    if(!state.raceId){ if(titleEl) titleEl.textContent='Grand Prix — missing ?race=<race_id>'; info('Example: ?race=501'); return; }

    var repo='menditeguy/f1data-races-1-500';
    if(state.raceId>500 && state.raceId<=1000) repo='menditeguy/f1data-races-501-1000';
    else if(state.raceId>1000) repo='menditeguy/f1data-races-1001-1500';
    var base=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';
    var sessionsBase='https://cdn.jsdelivr.net/gh/'+repo+'@main';
    console.info('[INFO] Using '+repo+' @main for race '+state.raceId);

    Promise.all([loadDrivers(base), loadParticipants(base)])
    .then(function(){
      var url=sessionsBase+'/races/'+state.raceId+'/sessions.json';
      info('Loading… '+url);
      return loadJSON(url);
    })
    .then(function(json){
      state.jsonRoot=json;
      state.meta=(json&&json.meta)?json.meta:{};
      var t=buildTitle(state.meta) || ('Grand Prix '+(state.meta.round||'')+(state.meta.year?(' ('+state.meta.year+')'):''));
      if(titleEl) titleEl.textContent=t;

      // Normalize sessions array
      var sessions=[];
      if(Array.isArray(json.sessions)){
        for(var i=0;i<json.sessions.length;i++){
          var sx=json.sessions[i];
          sessions.push({code:(sx.code||sx.session||'UNK').toUpperCase(), rows:sx.rows||sx.data||[]});
        }
      }else{
        for(var k in json){ var v=json[k]; if(Array.isArray(v) && v.length && typeof v[0]==='object'){ sessions.push({code:k.toUpperCase(), rows:v}); } }
      }
      // normalize aliases
      for(var j=0;j<sessions.length;j++){
        if(sessions[j].code==='MT') sessions[j].code='FL';
        if(sessions[j].code==='GRID') sessions[j].code='GRILLE';
        if(sessions[j].code==='RACE') sessions[j].code='COURSE';
      }
      // filter empties
      var filtered=[];
      for(var j2=0;j2<sessions.length;j2++){ var rws=sessions[j2].rows; if(Array.isArray(rws) && rws.length) filtered.push(sessions[j2]); }
      // sort by natural order
      filtered.sort(function(a,b){ return sessionOrderIdx(a.code)-sessionOrderIdx(b.code); });

      state.sessions=filtered;
      // default session
      var exists=false; for(var x=0;x<filtered.length;x++){ if(filtered[x].code===state.sessionCode){ exists=true; break; } }
      if(!exists){ state.sessionCode = filtered.length? filtered[0].code : 'RESUME'; }

      if(state.sessionCode==='RESUME'){ drawResume(); } else { loadSessionRows(); }
      buildTabs();
    })
    .catch(function(e){ console.error(e); error('Load error - '+e.message); tableBox.innerHTML=''; });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',init); } else { init(); }
})();
