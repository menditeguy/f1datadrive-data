// gp-page-v2.8.js — ES5 compatible
// - Dynamic session ribbon (EL, Q, WUP, GRID, FL, RACE, ... + RESUME)
// - No pagination; sortable table
// - Laps fix (no race fallback for practices/qual/wup/fl)
// - "Resume" view: per-driver synthesis table
(function(){
  'use strict';

  /* ========== Small utils ========== */
  function qs(sel, root){ return (root||document).querySelector(sel); }
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

  /* ========== Lookups ========== */
  var DRIVERS=null, PARTICIPANTS=null;
  function loadDrivers(base){ return loadJSON(base+'/lookups/drivers.min.json').then(function(j){DRIVERS=j;}); }
  function loadParticipants(base){ return loadJSON(base+'/lookups/participants.json').then(function(j){PARTICIPANTS=j;}); }
  function driverName(id){ if(id==null) return ''; var k=String(id); return DRIVERS&&DRIVERS[k]?DRIVERS[k]:String(id); }
  function pinfo(raceId, driverId){ if(!PARTICIPANTS) return {}; var rn=PARTICIPANTS[String(raceId)]||{}; return rn[String(driverId)]||{}; }

  /* ========== Time helpers ========== */
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

  /* ========== DOM refs & state ========== */
  var app=qs('#f1-gp-app');
  var titleEl=qs('#gpTitle',app);
  var statusEl=qs('#status',app);
  var tabsEl=qs('#sessionTabs',app);
  var tableBox=qs('#sessionTable',app);

  var state={
    raceId:null,
    meta:null,
    sessions:[],   // [{code, rows}]
    sessionCode:null,
    rows:[],       // for standard session table
    sort:{key:'pos',dir:1},
    columns:['pos','no','driver','car_engine','laps','time','gap_reason'],
    resumeCache:null // computed resume table
  };

  function info(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#666'; } }
  function error(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#b00'; } }

  /* ========== Sorting & table ========== */
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

  /* ========== Color & labels ========== */
  function colorFor(code){
    var c=String(code||'').toUpperCase();
    if(c==='EL1'||c==='EL2'||c==='EL3'||c==='EL4'||c==='WUP') return '#ee5a2f'; // orange
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='SPRINT_SHOOTOUT') return '#188038'; // green
    if(c==='RESUME') return '#6A32A8'; // purple
    return '#1a73e8'; // blue
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

    // expose all sessions + add RESUME virtual tab (visible if Race exists)
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

  /* ========== Build display rows for normal session ========== */
  function buildDisplayRows(rows, sessionCode, raceId){
    if(!Array.isArray(rows)) return [];
    var c=String(sessionCode||'').toUpperCase();
    var isRaceType=(c==='COURSE'||c==='RACE'||c==='SPRINT'); // only race-like use participants laps fallback

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

  /* ========== Resume view ========== */
  function sessionOrderIdx(code){
    var order=['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','SPRINT_SHOOTOUT','SPRINT','GRILLE','GRID','FL','COURSE','RACE'];
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
    }
    return null;
  }
  function eachDriverByRaceOrder(){
    // try race results for ordering
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
    }else{
      // fallback: grid then qual then any
      var grid=findSession('GRILLE')||findSession('GRID')||findSession('Q3')||findSession('Q2')||findSession('Q1');
      if(grid && Array.isArray(grid.rows)){
        var gr=grid.rows.slice();
        gr.sort(function(a,b){ return (Number(pick(a,['position','pos']))||999) - (Number(pick(b,['position','pos']))||999); });
        for(var j=0;j<gr.length;j++){ var id2=pick(gr[j],['driver_id','DriverId','driverId']); if(id2!=null) list.push(Number(id2)); }
      }
    }
    // unique
    var seen={}, out=[]; for(var k=0;k<list.length;k++){ var v=list[k]; if(!seen[v]){ seen[v]=1; out.push(v); } }
    return out;
  }

  function collectSessionsPresent(){
    // only sessions that have at least one row with time/pos for at least one driver
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

  function drawResume(){
    // cache?
    tableBox.innerHTML='';
    info('Building Resume…');

    var driversOrder=eachDriverByRaceOrder();
    if(!driversOrder.length){ tableBox.textContent='Resume unavailable (no race data).'; return; }

    // sessions present (as columns)
    var sessCodes=collectSessionsPresent();

    // compute per-session best ms (for %)
    var bestBySession={};
    for(var i=0;i<sessCodes.length;i++){
      var s=findSession(sessCodes[i]); bestBySession[s.code]=bestMsOfSession(s);
    }

    // PerfTime & laps weekend
    var globalBest=null;
    var bestOfDriver={}, lapsOfDriver={};

    // Walk across sessions to collect per-driver info
    for(var si=0; si<sessCodes.length; si++){
      var s=findSession(sessCodes[si]), rows=s.rows||s.data||[];
      for(var ri=0; ri<rows.length; ri++){
        var r=rows[ri], id=Number(pick(r,['driver_id','DriverId','driverId'])); if(!id) continue;
        var ms=msFromRow(r);
        if(ms!=null){ if(bestOfDriver[id]==null || ms<bestOfDriver[id]) bestOfDriver[id]=ms; if(globalBest==null || ms<globalBest) globalBest=ms; }
        var lap=pick(r,['laps','lap_count','laps_count','lapsCompleted','laps_session','laps_completed','nb_laps','nbLaps','nb_tours','tours']);
        var nlap=Number(lap); if(isFinite(nlap)){ lapsOfDriver[id]=(lapsOfDriver[id]||0)+nlap; }
      }
    }

    // Try to read optional resume metrics from json: json.resume or session code RESUME
    // expected shape per row: { driver_id, pos_lap_time, top1, top3, top6, top10 }
    var resumeMap={};
    var embedResume=null;
    // search session code 'RESUME'
    var resumeSess=findSession('RESUME');
    if(resumeSess && Array.isArray(resumeSess.rows)){
      embedResume=resumeSess.rows;
    } else if(state.jsonRoot && state.jsonRoot.resume && Array.isArray(state.jsonRoot.resume)){
      embedResume=state.jsonRoot.resume;
    }
    if(embedResume){
      for(var rsi=0;rsi<embedResume.length;rsi++){
        var rr=embedResume[rsi], idr=Number(pick(rr,['driver_id','DriverId','driverId'])); if(!idr) continue;
        resumeMap[idr]={
          pos_lap_time: pick(rr,['pos_lap_time','posLapTime','pos_avg_time']),
          top1: pick(rr,['top1','top_1']),
          top3: pick(rr,['top3','top_3']),
          top6: pick(rr,['top6','top_6']),
          top10: pick(rr,['top10','top_10'])
        };
      }
    }

    // Build header
    var wrapper=document.createElement('div');
    wrapper.style.overflowX='auto';
    var tbl=document.createElement('table'); tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='13.5px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    var thead=document.createElement('thead'); thead.style.background='#fafafa';
    var trh=document.createElement('tr');

    function th(txt,sticky){
      var h=document.createElement('th'); h.textContent=txt; h.style.textAlign='left'; h.style.padding='8px 10px'; h.style.borderBottom='1px solid #eee';
      if(sticky){ h.style.position='sticky'; h.style.left='0'; h.style.background='#fafafa'; zIndex=1; }
      return h;
    }

    trh.appendChild(th('Resultat race'));        // left-most
    trh.appendChild(th('Driver / Team'));
    for(var sc=0; sc<sessCodes.length; sc++){ trh.appendChild(th(labelFor(sessCodes[sc]))); }
    trh.appendChild(th('Nb tours weekend'));
    trh.appendChild(th('PerfTime %'));
    trh.appendChild(th('Pos lap/time')); // from JSON (race-only per your rule)
    trh.appendChild(th('Top1'));
    trh.appendChild(th('Top3'));
    trh.appendChild(th('Top6'));
    trh.appendChild(th('Top10'));
    thead.appendChild(trh); tbl.appendChild(thead);

    // body
    var tbody=document.createElement('tbody');

    function cell(txt){ var td=document.createElement('td'); td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3'; td.innerHTML = (txt==null||txt==='')?'—':String(txt); return td; }
    function cellPilot(id){
      var td=document.createElement('td'); td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3';
      var n=driverName(id); var team=(pinfo(state.raceId,id).team||'');
      td.innerHTML='<div><strong>'+n+'</strong><div style="font-size:12px;color:#777">'+team+'</div></div>';
      return td;
    }
    function cellSession(code, id){
      var s=findSession(code); if(!s) return cell('—');
      var best=bestBySession[s.code]; var r=rowForDriver(s,id); if(!r) return cell('—');

      var pos=pick(r,['position','pos','rank','rang']); pos=(pos!=null && String(pos).trim()!=='')?Number(pos):null;
      var ms=msFromRow(r);
      var pct = (ms!=null && best!=null)? (ms/best*100) : null;
      var pctStr = (pct!=null)? (pct.toFixed(2)+'%') : '—';

      var td=document.createElement('td'); td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3';
      var posStr=(pos!=null?pos:'—');
      td.innerHTML='<div><strong>'+posStr+'</strong><div style="font-size:12px;color:#777">'+pctStr+'</div></div>';
      return td;
    }

    // compute race result positions for left column
    var race=findSession('COURSE')||findSession('RACE');
    var racePosMap={};
    if(race && Array.isArray(race.rows)){
      for(var rr=0; rr<race.rows.length; rr++){
        var ro=race.rows[rr], did=Number(pick(ro,['driver_id','DriverId','driverId'])); if(!did) continue;
        var p=Number(pick(ro,['position','pos']))||null; racePosMap[did]=p;
      }
    }

    // rows
    for(var di=0; di<driversOrder.length; di++){
      var id=driversOrder[di], tr=document.createElement('tr');
      // Resultat race
      tr.appendChild(cell(racePosMap[id]!=null?racePosMap[id]:'—'));
      // Pilot / team
      tr.appendChild(cellPilot(id));
      // Session cells
      for(var sc=0; sc<sessCodes.length; sc++){ tr.appendChild(cellSession(sessCodes[sc], id)); }
      // Nb tours weekend
      tr.appendChild(cell(lapsOfDriver[id]!=null?lapsOfDriver[id]:'—'));
      // PerfTime %
      var perf = (bestOfDriver[id]!=null && globalBest!=null)? (bestOfDriver[id]/globalBest*100).toFixed(2)+'%' : '—';
      tr.appendChild(cell(perf));
      // Resume metrics (from JSON only; race-only)
      var rsm=resumeMap[id]||{};
      tr.appendChild(cell(rsm.pos_lap_time!=null? rsm.pos_lap_time : '—'));
      tr.appendChild(cell(rsm.top1!=null? rsm.top1 : '—'));
      tr.appendChild(cell(rsm.top3!=null? rsm.top3 : '—'));
      tr.appendChild(cell(rsm.top6!=null? rsm.top6 : '—'));
      tr.appendChild(cell(rsm.top10!=null? rsm.top10 : '—'));

      tbody.appendChild(tr);
    }

    tbl.appendChild(tbody);
    wrapper.appendChild(tbl);
    tableBox.appendChild(wrapper);

    info('Resume built • '+driversOrder.length+' drivers');
  }

  /* ========== Init & loading ========== */
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
      // pick default session
      var exists=false; for(var x=0;x<filtered.length;x++){ if(filtered[x].code===state.sessionCode){ exists=true; break; } }
      if(!exists){ state.sessionCode = filtered.length? filtered[0].code : 'RESUME'; }

      if(state.sessionCode==='RESUME'){ drawResume(); } else { loadSessionRows(); }
      buildTabs();
    })
    .catch(function(e){ console.error(e); error('Load error - '+e.message); tableBox.innerHTML=''; });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',init); } else { init(); }
})();
