// gp-page-v2.5.js — version corrigée ES5 compatible Webador
// Correction : suppression des opérateurs "??" et "?." + variable rootBase fixée
(function(){
  'use strict';

  function qs(sel, root){ return (root||document).querySelector(sel); }
  function isNumeric(v){ return v !== null && v !== '' && !isNaN(v); }

  function getURLParam(k, d){
    try {
      var u = new URL(window.location.href);
      var v = u.searchParams.get(k);
      return (v===null?d:v);
    } catch(e){ return d; }
  }

  function fmtMs(v){
    if (v == null || isNaN(Number(v))) return v;
    var ms = Number(v);
    var s  = Math.floor(ms/1000);
    var mm = Math.floor(s/60);
    var ss = s % 60;
    var mmm= ms % 1000;
    return mm + ':' + String(ss).padStart(2,'0') + '.' + String(mmm).padStart(3,'0');
  }

  function pick(o, keys){
    if(!o) return null;
    for (var i=0; i<keys.length; i++){
      var k = keys[i];
      if (o[k]!=null && o[k]!=='') return o[k];
    }
    return null;
  }

  function cloneRow(r){
    var out={};
    for (var k in r){ out[k]=r[k]; }
    return out;
  }

  function msFromRow(r){
    var m = pick(r, ['best_lap_ms','best_ms','lap_ms','time_ms','milliseconds','bestTimeMs','bestTime_ms']);
    var n = Number(m);
    return isFinite(n)?n:null;
  }

  var DRIVERS = null;
  var PARTICIPANTS = null;

  function loadText(url){
    return fetch(url,{cache:'no-store'}).then(function(resp){
      return resp.text().then(function(txt){
        if(!resp.ok){ throw new Error('HTTP '+resp.status+' on '+url); }
        return txt;
      });
    });
  }

  function loadJSON(url){
    return loadText(url).then(function(txt){
      try { return JSON.parse(txt); }
      catch(e){ throw new Error('Invalid JSON at '+url+' — '+txt.slice(0,120)); }
    });
  }

  function loadDrivers(base){
    var url = base + '/lookups/drivers.min.json';
    return loadJSON(url).then(function(j){ DRIVERS=j; });
  }

  function loadParticipants(base){
    var url = base + '/lookups/participants.json';
    return loadJSON(url).then(function(j){ PARTICIPANTS=j; });
  }

  function driverName(id){
    if (id==null) return '';
    var k = String(id);
    return (DRIVERS && DRIVERS[k]) ? DRIVERS[k] : String(id);
  }

  function participantsInfo(raceId, driverId){
    if (!PARTICIPANTS) return {};
    var raceNode = PARTICIPANTS[String(raceId)] || {};
    return raceNode[String(driverId)] || {};
  }

  function isFullRaceTimeString(s){ return typeof s==='string' && /(\d+h|\d+m|\d+s|km\/h|:)/i.test(s); }
  function isPlusGap(s){ return typeof s==='string' && s.trim().indexOf('+')===0; }

  function translateReason(txt){
    if(!txt) return txt;
    var map = {
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

  function toPos(row){
    var v = (row.pos!=null?row.pos:(row.position!=null?row.position:0));
    var n = Number(v);
    return isFinite(n)?n:0;
  }

  function cmpPos(a,b){
    var pa=toPos(a), pb=toPos(b);
    if (pa>0 && pb>0) return pa - pb;
    var la=Number(a.laps)||0, lb=Number(b.laps)||0;
    if (la!==lb) return lb - la;
    var ra=Number(a.positionOrder)||Number(a.rank)||Number(a.driver_id)||9999;
    var rb=Number(b.positionOrder)||Number(b.rank)||Number(b.driver_id)||9999;
    return ra - rb;
  }

  function buildDisplayRows(rows, sessionCode, raceId){
    if (!Array.isArray(rows)) return [];
    var sessionUpper = String(sessionCode||'').toUpperCase();
    var isRace = (sessionUpper === 'COURSE');

    var bestMs=null;
    for (var i=0;i<rows.length;i++){
      var ms = msFromRow(rows[i]);
      if (ms!=null) bestMs=(bestMs==null||ms<bestMs)?ms:bestMs;
    }

    var out=[];
    for (var j=0;j<rows.length;j++){
      var r = rows[j];
      var drvId = pick(r,['driver_id','DriverId','driverId']);
      var name = driverName(drvId);
      var pinfo = participantsInfo(raceId, drvId);

      var pos = pick(r,['position','pos','rank','rang']);
      var team = pick(r,['team','team_name','teams','teams_name']) || pinfo.team || '';
      var motor = pick(r,['motor_name','engine','moteur']) || pinfo.motor || '';
      var num = pick(r,['num','num_car','number','no','car_no','car']) || pinfo.num_car || '';
      var laps = pick(r,['laps','laps_completed','nb_laps','nb_tours','tours']);
      if (/^Q[1-4]$/i.test(sessionUpper)) laps='';
      else if (laps==null||laps==='') laps=pinfo.laps||'';

      var timeDisplay='', gapReason='';
      if(!isRace){
        var ms2 = msFromRow(r);
        var timeRw = pick(r,['best_lap_time_raw','best_time','time_raw','best_lap']);
        timeDisplay = timeRw || (ms2!=null ? fmtMs(ms2) : '');
        if(ms2!=null && bestMs!=null && ms2>bestMs){
          gapReason = '+'+fmtMs(ms2-bestMs);
        }
      } else {
        var delta = pick(r,['delta','gap','race_gap']);
        if(delta && delta.trim().charAt(0)==='+') gapReason=delta;
        if(delta){
          if(isFullRaceTimeString(delta)){ timeDisplay=delta; }
          else{ gapReason=translateReason(delta); }
        }
      }

      out.push({
        pos:(pos!=null?Number(pos):null),
        no:String(num||''),
        driver:name,
        car_engine:team+(motor?('/'+motor):''),
        laps:(laps===''||laps==null)?'':Number(laps),
        time:timeDisplay,
        gap_reason:gapReason,
        rank:pick(r,['rank'])||null,
        positionOrder:pick(r,['positionOrder'])||null,
        driver_id:drvId||null
      });
    }
    return out;
  }

  var app = qs('#f1-gp-app');
  var titleEl = qs('#gpTitle', app);
  var statusEl = qs('#status', app);
  var selEl = qs('#sessionSelect', app);
  var tableBox = qs('#sessionTable', app);

  var state = {raceId:null,sessionCode:null,sessions:[],rows:[],columns:[],sort:{key:null,dir:1}};

  function showError(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#b00'; } }
  function showInfo(msg){ if(statusEl){ statusEl.textContent=msg; statusEl.style.color='#666'; } }

  function drawTable(){
    tableBox.innerHTML='';
    if(!state.rows.length){ return; }
    var tbl=document.createElement('table');
    tbl.style.width='100%'; tbl.style.fontSize='14px'; tbl.style.borderCollapse='collapse';
    var thead=document.createElement('thead'), trh=document.createElement('tr');
    var cols=['pos','no','driver','car_engine','laps','time','gap_reason'];
    var labels={'pos':'Pos','no':'No','driver':'Driver','car_engine':'Car/Engine','laps':'Laps','time':'Time','gap_reason':'Gap/Reason'};
    for(var i=0;i<cols.length;i++){
      var th=document.createElement('th');
      th.textContent=labels[cols[i]];
      th.style.padding='6px'; th.style.borderBottom='1px solid #ddd';
      trh.appendChild(th);
    }
    thead.appendChild(trh); tbl.appendChild(thead);
    var tbody=document.createElement('tbody');
    for(var j=0;j<state.rows.length;j++){
      var r=state.rows[j]; var tr=document.createElement('tr');
      for(var k=0;k<cols.length;k++){
        var td=document.createElement('td');
        td.textContent=r[cols[k]]==null?'':r[cols[k]];
        td.style.padding='4px 6px'; td.style.borderBottom='1px solid #f3f3f3';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
  }

  function populateSessionSelect(){
    selEl.innerHTML='';
    for(var i=0;i<state.sessions.length;i++){
      var s=state.sessions[i];
      var o=document.createElement('option');
      o.value=s.code; o.textContent=s.code;
      if(s.code===state.sessionCode) o.selected=true;
      selEl.appendChild(o);
    }
    selEl.onchange=function(){
      state.sessionCode=selEl.value;
      loadSessionRows();
    };
  }

  function loadSessionRows(){
    var sess=null;
    for(var i=0;i<state.sessions.length;i++){
      if(state.sessions[i].code===state.sessionCode){ sess=state.sessions[i]; break; }
    }
    if(!sess && state.sessions.length) sess=state.sessions[0];
    if(!sess){ showInfo('No session available for this GP.'); return; }

    var srcRows = Array.isArray(sess.rows)?sess.rows:(Array.isArray(sess.data)?sess.data:[]);
    var withNames=[];
    for(var i=0;i<srcRows.length;i++){
      var r=srcRows[i]; var out=cloneRow(r);
      var id=pick(r,['driver_id','DriverId','driverId']);
      out.driver=driverName(id);
      withNames.push(out);
    }

    state.rows=buildDisplayRows(withNames,state.sessionCode,state.raceId);
    showInfo('Session '+(sess.code||'?')+' • '+srcRows.length+' rows');
    drawTable();
  }

  function buildGpTitle(meta){
    if(!meta) return null;
    var year=meta.year, round=meta.round;
    var circuit=meta.circuit||'', country=meta.country||'';
    return (year?year+' ':'')+(circuit?(circuit+(country?' ('+country+')':'')):'');
  }

  function init(){
    state.raceId = Number(getURLParam('race', null));
    var s = getURLParam('session','');
    state.sessionCode = s ? s.toUpperCase() : null;

    if(!state.raceId){
      if(titleEl) titleEl.textContent='Grand Prix — missing ?race=<race_id>';
      showInfo('Example: ?race=501');
      return;
    }

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
        state.meta=json && json.meta ? json.meta : {};
        var titleTxt=buildGpTitle(state.meta) || ('Grand Prix '+(state.meta.round||''));
        if(titleEl) titleEl.textContent=titleTxt;

        var sessions=[];
        if(Array.isArray(json.sessions)){
          for(var i=0;i<json.sessions.length;i++){
            var sx=json.sessions[i];
            sessions.push({code:(sx.code||sx.session||'UNK').toUpperCase(), rows:sx.rows||sx.data||[]});
          }
        }
        state.sessions=sessions;
        if(!state.sessionCode && sessions.length) state.sessionCode=sessions[0].code;
        populateSessionSelect();
        loadSessionRows();
      })
      .catch(function(err){
        console.error(err);
        showError('Load error - '+err.message);
      });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else { init(); }

})();
