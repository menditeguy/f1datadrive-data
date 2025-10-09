// gp-page-v2.7.3.js — fix laps: no race fallback for EL/WUP/etc.
(function(){
  'use strict';

  function qs(sel, root){ return (root||document).querySelector(sel); }
  function isNumeric(v){ return v !== null && v !== '' && !isNaN(v); }
  function getURLParam(k,d){ try{ var u=new URL(window.location.href); var v=u.searchParams.get(k); return (v===null?d:v); }catch(e){ return d; } }
  function fmtMs(v){ if(v==null||isNaN(Number(v))) return v; var ms=Number(v), s=Math.floor(ms/1000), mm=Math.floor(s/60), ss=s%60, mmm=ms%1000; return mm+':'+String(ss).padStart(2,'0')+'.'+String(mmm).padStart(3,'0'); }
  function pick(o, keys){ if(!o) return null; for(var i=0;i<keys.length;i++){ var k=keys[i]; if(o[k]!=null && o[k]!=='') return o[k]; } return null; }
  function cloneRow(r){ var o={}; for(var k in r){ o[k]=r[k]; } return o; }
  function msFromRow(r){ var m=pick(r,['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds','bestTimeMs','bestTime_ms']); var n=Number(m); return isFinite(n)?n:null; }

  var DRIVERS=null, PARTICIPANTS=null;
  function loadText(url){ return fetch(url,{cache:'no-store'}).then(function(resp){ return resp.text().then(function(txt){ if(!resp.ok){ throw new Error('HTTP '+resp.status+' on '+url+' — '+txt.slice(0,120)); } return txt; }); }); }
  function loadJSON(url){ return loadText(url).then(function(t){ try{return JSON.parse(t);}catch(e){throw new Error('Invalid JSON at '+url+' — '+t.slice(0,120));} }); }
  function loadDrivers(base){ return loadJSON(base+'/lookups/drivers.min.json').then(function(j){ DRIVERS=j; }); }
  function loadParticipants(base){ return loadJSON(base+'/lookups/participants.json').then(function(j){ PARTICIPANTS=j; }); }
  function driverName(id){ if(id==null) return ''; var k=String(id); return (DRIVERS&&DRIVERS[k])?DRIVERS[k]:String(id); }
  function participantsInfo(raceId, driverId){ if(!PARTICIPANTS) return {}; var raceNode=PARTICIPANTS[String(raceId)]||{}; return raceNode[String(driverId)]||{}; }

  var RE_TIME=/(\d+h|\d+m|\d+s|km\/h|:)/i;
  function isFullRaceTimeString(s){ return typeof s==='string' && RE_TIME.test(s); }
  function translateReason(txt){
    if(!txt) return txt;
    var map={"Boîte de vitesses":"Gearbox","Accident":"Accident","Accrochage":"Collision","Aileron":"Wing","Moteur":"Engine","Transmission":"Transmission","Suspension":"Suspension","Hydraulique":"Hydraulics","Essence":"Fuel","Pneu":"Tyre","Sortie de piste":"Off track","Fixation de roue":"Wheel mounting","Surchauffe":"Overheating","Accélérateur":"Throttle","Jante":"Wheel rim","Pas parti":"Did not start","Abandon":"Retired","Disqualification":"Disqualified"};
    return map[txt]||txt;
  }

  function toPos(row){ var v=(row.pos!=null?row.pos:(row.position!=null?row.position:0)); var n=Number(v); return isFinite(n)?n:0; }
  function cmpPos(a,b){
    var pa=toPos(a), pb=toPos(b);
    if(pa>0 && pb>0) return pa-pb;
    var la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if(la!==lb) return lb-la;
    var ra=Number(a.positionOrder)||Number(a.rank)||Number(a.driver_id)||9999;
    var rb=Number(b.positionOrder)||Number(b.rank)||Number(b.driver_id)||9999;
    return ra-rb;
  }

  function buildDisplayRows(rows, sessionCode, raceId){
    if(!Array.isArray(rows)) return [];
    var c=String(sessionCode||'').toUpperCase();
    var isRaceType=(c==='COURSE'||c==='RACE'||c==='SPRINT'); // seuls ces types utilisent le fallback participants.laps

    var bestMs=null;
    if(!isRaceType){
      for(var i=0;i<rows.length;i++){ var ms=msFromRow(rows[i]); if(ms!=null) bestMs=(bestMs==null||ms<bestMs)?ms:bestMs; }
    }

    var out=[], lapKeys=['laps','lap_count','laps_count','lapsCompleted','laps_session','laps_completed','nb_laps','nbLaps','nb_tours','tours'];
    for(var j=0;j<rows.length;j++){
      var r=rows[j], drvId=pick(r,['driver_id','DriverId','driverId']), pinfo=participantsInfo(raceId, drvId);

      var pos=pick(r,['position','pos','rank','rang']);
      var team=pick(r,['team','team_name','teams','teams_name']) || pinfo.team || '';
      var motor=pick(r,['motor_name','engine','moteur']) || pinfo.motor || '';
      var num=pick(r,['num','num_car','number','no','car_no','car']) || pinfo.num_car || '';

      // ✅ Laps : jamais de fallback aux tours de course pour EL/WUP/Q/FL/GRID…
      var laps=pick(r, lapKeys);
      if(/^Q[1-4]$/i.test(c) || c==='GRILLE' || c==='GRID' || c==='FL'){ laps=''; }
      else if((laps==null || laps==='') && isRaceType){ laps=(pinfo.laps!=null?pinfo.laps:''); }

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
          if(isFullRaceTimeString(delta)){ timeDisplay=delta; }
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
      var rank=1;
      for(var k=0;k<order.length;k++){
        var o=order[k], row=out[o.i];
        if(!row.pos) row.pos=(o.ms==null?null:rank++);
      }
    }
    return out;
  }

  var app=qs('#f1-gp-app'), titleEl=qs('#gpTitle',app), statusEl=qs('#status',app), tableBox=qs('#sessionTable',app), tabsEl=qs('#sessionTabs',app);

  var state={ raceId:null, sessionCode:null, sessions:[], rows:[], columns:['pos','no','driver','car_engine','laps','time','gap_reason'], sort:{key:'pos',dir:1} };
  function showError(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#b00'; } }
  function showInfo(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#666'; } }

  function sortRows(){
    var key=state.sort.key, dir=state.sort.dir;
    if(!key) return;
    if(key==='pos'){ state.rows.sort(dir===1?cmpPos:function(a,b){return cmpPos(b,a);}); return; }
    var numeric=state.rows.some(function(r){ return isNumeric(r[key]); });
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
      (function(cname){
        var th=document.createElement('th');
        th.textContent=HEAD_MAP[cname]||cname;
        th.style.textAlign='left'; th.style.padding='10px'; th.style.borderBottom='1px solid #eee';
        th.style.cursor='pointer'; th.style.userSelect='none'; th.style.outline='none';
        th.onmousedown=function(e){ e.preventDefault(); }; // évite le petit carré de focus
        th.onclick=function(){ if(state.sort.key===cname){state.sort.dir*=-1;}else{state.sort.key=cname;state.sort.dir=1;} sortRows(); drawTable(); };
        if(state.sort.key===cname){ th.textContent+=' '+(state.sort.dir===1?'↑':'↓'); }
        trh.appendChild(th);
      })(state.columns[i]);
    }
    thead.appendChild(trh); tbl.appendChild(thead);

    sortRows();
    var tbody=document.createElement('tbody');
    for(var r=0;r<state.rows.length;r++){
      var row=state.rows[r], tr=document.createElement('tr');
      tr.onmouseenter=function(){ this.style.background='#fcfcfd'; };
      tr.onmouseleave=function(){ this.style.background=''; };
      for(var c=0;c<state.columns.length;c++){
        var key=state.columns[c], td=document.createElement('td'), v=row[key];
        if(key==='pos'){ var n=Number(v); v=(isFinite(n)&&n>0)?n:'—'; }
        td.textContent=(v==null?'':v);
        td.style.padding='8px 10px'; td.style.borderBottom='1px solid #f3f3f3';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
  }

  function colorFor(code){
    var c=String(code||'').toUpperCase();
    if(c==='EL1'||c==='EL2'||c==='EL3'||c==='EL4'||c==='WUP') return '#ee5a2f';         // orange (EL/WUP)
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='SPRINT_SHOOTOUT') return '#188038'; // vert
    return '#1a73e8'; // bleu (SPRINT, GRID/GRILLE, RACE/COURSE, FL, TLAPS/LPLP/LEAD quand dispo)
  }
  function labelFor(code){
    var m=String(code||'').toUpperCase();
    var map={ 'COURSE':'Race', 'RACE':'Race', 'GRILLE':'Grid', 'GRID':'Grid', 'SPRINT_SHOOTOUT':'SQ', 'MT':'FL' };
    return map[m]||m;
  }
  function ensureTabsContainer(){
    if(!tabsEl){
      tabsEl=document.createElement('div'); tabsEl.id='sessionTabs';
      tabsEl.style.display='flex'; tabsEl.style.flexWrap='wrap'; tabsEl.style.gap='8px'; tabsEl.style.margin='8px 0 12px';
      if(tableBox && tableBox.parentNode){ tableBox.parentNode.insertBefore(tabsEl, tableBox); } else if(app){ app.appendChild(tabsEl); }
    }
  }
  function buildSessionTabs(){
    ensureTabsContainer(); tabsEl.innerHTML='';
    if(!state.sessions || !state.sessions.length){ return; }
    for(var i=0;i<state.sessions.length;i++){
      (function(sx){
        var code=String(sx.code||'').toUpperCase();
        var btn=document.createElement('button');
        btn.textContent=labelFor(code);
        var col=colorFor(code);
        btn.style.background='#fff'; btn.style.border='1px solid '+col; btn.style.color=col;
        btn.style.padding='6px 10px'; btn.style.borderRadius='10px'; btn.style.cursor='pointer'; btn.style.fontWeight='600';
        btn.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';
        btn.onmouseenter=function(){ btn.style.background=col; btn.style.color='#fff'; };
        btn.onmouseleave=function(){ if(state.sessionCode===code){ btn.style.background=col; btn.style.color='#fff'; } else { btn.style.background='#fff'; btn.style.color=col; } };
        btn.onclick=function(){ if(state.sessionCode===code) return; state.sessionCode=code; loadSessionRows(); buildSessionTabs(); };
        if(state.sessionCode===code){ btn.style.background=col; btn.style.color='#fff'; }
        tabsEl.appendChild(btn);
      })(state.sessions[i]);
    }
  }

  function formatGpName(name, round){ if(name){ var m=String(name).trim().match(/^gp\s*0*(\d+)$/i); if(m) return 'Grand Prix '+m[1]; return name; } if(round!=null) return 'Grand Prix '+String(round); return null; }
  function buildGpTitle(meta){
    if(!meta) return null; var year=meta.year, round=meta.round;
    var name=formatGpName(meta.name||meta.gp_name, round);
    var left = name ? (year?(name+' ('+year+')'):name) : (round!=null && year?('Grand Prix '+round+' ('+year+')'):(year!=null?String(year):null));
    var circuit=meta.circuit||"", country=meta.country||"";
    var right = circuit ? (country?(circuit+' ('+country+')'):circuit) : "";
    if(left && right) return left+' - '+right; if(left) return left; if(right) return right+(year?(' ('+year+')'):''); return null;
  }

  function loadSessionRows(){
    var sess=null; for(var i=0;i<state.sessions.length;i++){ if(state.sessions[i].code===state.sessionCode){ sess=state.sessions[i]; break; } }
    if(!sess && state.sessions.length){ sess=state.sessions[0]; state.sessionCode=sess.code; }
    if(!sess){ state.rows=[]; showInfo('No session available for this GP.'); tableBox.innerHTML=''; return; }

    var srcRows = Array.isArray(sess.rows)?sess.rows:(Array.isArray(sess.data)?sess.data:[]);
    var withNames=[];
    for(var i=0;i<srcRows.length;i++){ var r=srcRows[i], out=cloneRow(r), id=pick(r,['driver_id','DriverId','driverId']); out.driver=driverName(id); withNames.push(out); }
    state.rows=buildDisplayRows(withNames, state.sessionCode, state.raceId);
    state.sort={key:'pos',dir:1};
    showInfo('Session '+labelFor(sess.code||'?')+' • '+srcRows.length+' rows');
    drawTable();
  }

  function init(){
    state.raceId=Number(getURLParam('race',null));
    var s=getURLParam('session','')||''; state.sessionCode=s?String(s).toUpperCase():null;
    if(!state.raceId){ if(titleEl) titleEl.textContent='Grand Prix — missing ?race=<race_id>'; showInfo('Example: ?race=501'); return; }

    var baseRepo='menditeguy/f1data-races-1-500';
    if(state.raceId>500 && state.raceId<=1000) baseRepo='menditeguy/f1data-races-501-1000';
    else if(state.raceId>1000) baseRepo='menditeguy/f1data-races-1001-1500';
    var rootBase=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';
    var sessionsBase='https://cdn.jsdelivr.net/gh/'+baseRepo+'@main';
    console.info('[INFO] Using '+baseRepo+' @main for race '+state.raceId);

    Promise.all([loadDrivers(rootBase), loadParticipants(rootBase)])
    .then(function(){
      var url=sessionsBase+'/races/'+state.raceId+'/sessions.json';
      showInfo('Loading... '+url);
      return loadJSON(url);
    })
    .then(function(json){
      state.meta=(json&&json.meta)?json.meta:{};
      var titleTxt=buildGpTitle(state.meta) || ('Grand Prix '+(state.meta.round||'')+(state.meta.year?(' ('+state.meta.year+')'):''));
      if(titleEl) titleEl.textContent=titleTxt;

      var sessions=[];
      if(Array.isArray(json.sessions)){
        for(var i=0;i<json.sessions.length;i++){ var sx=json.sessions[i]; sessions.push({code:(sx.code||sx.session||'UNK').toUpperCase(), rows:sx.rows||sx.data||[]}); }
      }else{
        for(var k in json){ var v=json[k]; if(Array.isArray(v) && v.length && typeof v[0]==='object'){ sessions.push({code:k.toUpperCase(), rows:v}); } }
      }

      // ordre logique + alias normalisés
      var order=['EL1','EL2','EL3','EL4','WUP','Q1','Q2','Q3','Q4','SPRINT_SHOOTOUT','SPRINT','GRILLE','GRID','FL','MT','COURSE','RACE'];
      // normaliser codes alias
      for(var i=0;i<sessions.length;i++){
        var c=sessions[i].code;
        if(c==='MT') sessions[i].code='FL';
        if(c==='GRID') sessions[i].code='GRILLE';
        if(c==='RACE') sessions[i].code='COURSE';
      }
      // filtre sessions vides
      var filtered=[];
      for(var i=0;i<sessions.length;i++){ var rws=sessions[i].rows; if(Array.isArray(rws) && rws.length) filtered.push(sessions[i]); }
      // tri
      filtered.sort(function(a,b){ var ia=order.indexOf(a.code); ia=(ia<0?999:ia); var ib=order.indexOf(b.code); ib=(ib<0?999:ib); return ia-ib; });

      state.sessions=filtered;
      var exists=false; for(var i=0;i<filtered.length;i++){ if(filtered[i].code===state.sessionCode){ exists=true; break; } }
      if(!exists) state.sessionCode=(filtered[0]?filtered[0].code:null);

      buildSessionTabs();
      loadSessionRows();
    })
    .catch(function(err){ console.error(err); showError('Load error - '+err.message); tableBox.innerHTML=''; });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',init); } else { init(); }
})();
