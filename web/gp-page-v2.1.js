// gp-page-v2.1.js  ASCII_SAFE v20250929-forix-en-fixed

(function(){
  'use strict';

  function qs(sel, root){ return (root||document).querySelector(sel); }

  function fmtMs(v){
    if (v == null || isNaN(Number(v))) return v;
    var ms = Number(v);
    var s = Math.floor(ms/1000);
    var mm = Math.floor(s/60);
    var ss = s % 60;
    var mmm = ms % 1000;
    return mm + ':' + String(ss).padStart(2,'0') + '.' + String(mmm).padStart(3,'0');
  }
  function isLikelyMsCol(c){ return /(^|_)(ms|milliseconds|lap_ms|best_lap_ms|fastest_lap_ms|best_time_ms)$/i.test(c); }
  function isNumeric(val){ return val !== null && val !== '' && !isNaN(val); }
  function getURLParam(k, d){
    var u = new URL(window.location.href);
    var v = u.searchParams.get(k);
    return (v===null? d : v);
  }

  // ---- Drivers lookup
  var DRIVERS = null;
  function loadDrivers(base){
    var url = base + '/lookups/drivers.min.json';
    return fetch(url, { cache: 'no-store' }).then(function(resp){
      if(!resp.ok) throw new Error('drivers.min.json HTTP ' + resp.status);
      return resp.json();
    }).then(function(json){ DRIVERS = json; });
  }
  function driverName(id){
    if (id == null) return '';
    var key = String(id);
    return (DRIVERS && DRIVERS[key]) ? DRIVERS[key] : String(id);
  }
  function withDriverNames(rows){
    if (!Array.isArray(rows)) return [];
    return rows.map(function(r){
      var out = {}; for (var k in r) out[k] = r[k];
      var id = (r && (r.driver_id!=null ? r.driver_id : (r.DriverId!=null ? r.DriverId : (r.driverId!=null ? r.driverId : null))));
      var fromLookup = (id!=null && DRIVERS) ? DRIVERS[String(id)] : null;
      out.driver = fromLookup || r.driver_name || r.driver || r.name || (id!=null ? String(id) : '');
      return out;
    });
  }

  // --- pick helper
  function pick(r, keys){
    for (let i=0;i<keys.length;i++){
      const k = keys[i];
      if (r && r[k] != null && r[k] !== "") return r[k];
    }
    return null;
  }

  // --- traduction rapide FR -> EN pour les raisons d'abandon
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
      "Pas parti":"Did not start"
    };
    return map[txt] || txt;
  }

  // --- Build display rows (Forix-style EN)
  function buildDisplayRows(rows){
    if (!Array.isArray(rows)) return [];

    return rows.map(function(r){
      const pos    = pick(r,['position','pos','rank','rang']);
      const num    = pick(r,['num','num_car','number','no','car_no','car']);
      const team   = pick(r,['team','team_name','teams','teams_name']);
      const motor  = pick(r,['motor_name','engine','moteur']);
      const laps   = pick(r,['laps','laps_completed','nb_laps','nb_tours','tours']);
      const drvId  = pick(r,['driver_id','DriverId','driverId']);
      const name   = driverName(drvId);
      const delta  = pick(r,['delta','time','race_time']);
      const rank   = pick(r,['rank','positionOrder','positionText']);

      // Laps correction (DNF lap 0 => show 1)
      const lapsCompleted = Number(laps || 0);
      const lapsDisplay = (lapsCompleted === 0 && (!pos || Number(pos) === 0)) ? 1 : lapsCompleted;

      // Split Time vs Gap/Reason
      let timeDisplay = "";
      let gapReason = "";

      if (delta && /[a-zA-Z]/.test(String(delta))) {
        // textual reason
        gapReason = translateReason(String(delta));
      } else if (delta) {
        // numeric or full time
        const s = String(delta);
        if (s.startsWith("+")) {
          gapReason = s;
        } else {
          timeDisplay = s;
        }
      }

      return {
        pos: (pos!=null ? Number(pos) : null),
        no:  (num!=null ? String(num) : ""),
        driver: name,
        car_engine: (team || "") + (motor ? ("/" + motor) : ""),
        laps: lapsDisplay,
        time: timeDisplay,
        gap_reason: gapReason,
        rank: rank || null,
        driver_id: drvId || null
      };
    });
  }

  // --- Helpers classement ---
  function toPos(row) {
    const v = (row && (row.pos ?? row.position ?? 0));
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function cmpPos(a, b) {
    const pa = toPos(a), pb = toPos(b);
    if (pa > 0 && pb > 0) return pa - pb; // classés normalement

    // DNF: sort by laps desc
    const la = Number(a.laps) || 0;
    const lb = Number(b.laps) || 0;
    if (la !== lb) return lb - la;

    // tie-breaker: use rank or driver_id (approx track order)
    const ra = Number(a.rank) || Number(a.driver_id) || 9999;
    const rb = Number(b.rank) || Number(b.driver_id) || 9999;
    return ra - rb;
  }

  // --- State & DOM
  var app      = qs('#f1-gp-app');
  var titleEl  = qs('#gpTitle', app);
  var statusEl = qs('#status', app);
  var selEl    = qs('#sessionSelect', app);
  var tableBox = qs('#sessionTable', app);

  var state = { raceId:null, sessionCode:null, sessions:[], rows:[], columns:[], sort:{key:null,dir:1}, page:1, pageSize:25 };

  function showError(msg){ statusEl.textContent = msg; statusEl.style.color = '#b00'; }
  function showInfo(msg){  statusEl.textContent = msg; statusEl.style.color = '#666'; }

  function renderPager(){
    var total = state.rows.length;
    var totalPages = Math.max(1, Math.ceil(total/state.pageSize));
    state.page = Math.min(state.page, totalPages);

    var wrap = document.createElement('div');
    wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px'; wrap.style.margin='10px 0';

    var info = document.createElement('span');
    info.style.fontSize='12px';
    info.textContent = 'Total: ' + total + ' rows - Page ' + state.page + '/' + totalPages;
    wrap.appendChild(info);

    function mkBtn(text, on, dis){
      var b = document.createElement('button');
      b.textContent = text; b.disabled = !!dis;
      b.style.padding='6px 10px'; b.style.border='1px solid #ddd'; b.style.borderRadius='8px';
      b.style.background=dis?'#f5f5f5':'#fff'; b.style.cursor=dis?'not-allowed':'pointer';
      b.onclick = on; return b;
    }
    wrap.appendChild(mkBtn('<<', function(){state.page=1;drawTable();}, state.page===1));
    wrap.appendChild(mkBtn('<' , function(){state.page=Math.max(1,state.page-1);drawTable();}, state.page===1));
    wrap.appendChild(mkBtn('>' , function(){state.page=Math.min(totalPages,state.page+1);drawTable();}, state.page===totalPages));
    wrap.appendChild(mkBtn('>>', function(){state.page=totalPages;drawTable();}, state.page===totalPages));

    var sizeSel = document.createElement('select');
    [10,25,50,100].forEach(function(n){
      var o = document.createElement('option');
      o.value=n; o.textContent= n + '/page'; if(n===state.pageSize) o.selected=true; sizeSel.appendChild(o);
    });
    sizeSel.onchange=function(){state.pageSize=Number(sizeSel.value);state.page=1;drawTable();};
    sizeSel.style.marginLeft='auto'; sizeSel.style.padding='6px'; sizeSel.style.borderRadius='8px';
    wrap.appendChild(sizeSel);
    return wrap;
  }

  function sortRows(){
    var key = state.sort.key, dir = state.sort.dir;
    if(!key) return;
    if (key === 'pos') {
      state.rows.sort(dir === 1 ? cmpPos : function(a,b){ return cmpPos(b,a); });
      return;
    }
    var numeric = state.rows.some(function(r){ return isNumeric(r[key]); });
    state.rows.sort(function(a,b){
      var va=a[key], vb=b[key];
      if(numeric){
        var na=Number(va), nb=Number(vb);
        if(isNaN(na)&&isNaN(nb))return 0; if(isNaN(na))return 1; if(isNaN(nb))return -1;
        return (na-nb)*dir;
      } else {
        var sa=(va==null?'':String(va)).toLowerCase();
        var sb=(vb==null?'':String(vb)).toLowerCase();
        return sa.localeCompare(sb)*dir;
      }
    });
  }

  function drawTable(){
    tableBox.innerHTML = '';
    tableBox.appendChild(renderPager());

    var tbl = document.createElement('table');
    tbl.style.width='100%'; tbl.style.borderCollapse='collapse'; tbl.style.fontSize='14px';
    tbl.style.background='#fff'; tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)'; tbl.style.borderRadius='12px'; tbl.style.overflow='hidden';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    state.columns.forEach(function(col){
      var th=document.createElement('th');
      const HEAD = { pos:"Pos", no:"No", driver:"Driver", car_engine:"Car / Engine", laps:"Laps", time:"Time", gap_reason:"Gap / Reason" };
      th.textContent = HEAD[col] || col;
      th.style.textAlign='left'; th.style.padding='10px'; th.style.borderBottom='1px solid '#eee";
      th.style.cursor='pointer'; th.style.userSelect='none';
      th.onclick=function(){ state.sort.key===col ? state.sort.dir*=-1 : (state.sort.key=col,state.sort.dir=1); sortRows(); drawTable(); };
      if(state.sort.key===col){ th.textContent = th.textContent + ' ' + (state.sort.dir===1?'^':'v'); }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    thead.style.position='sticky'; thead.style.top='0'; thead.style.background='#fafafa';
    tbl.appendChild(thead);

    sortRows();
    var start=(state.page-1)*state.pageSize, end=start+state.pageSize;
    var slice=state.rows.slice(start,end);

    var tbody=document.createElement('tbody');
    slice.forEach(function(r){
      var tr=document.createElement('tr');
      tr.onmouseenter=function(){tr.style.background='#fcfcfd';};
      tr.onmouseleave=function(){tr.style.background='';};
      state.columns.forEach(function(c){
        var td=document.createElement('td');
        var v = r[c];
        if (c === 'driver_id') v = driverName(v);
        if (isLikelyMsCol(c) && isNumeric(v)) v = fmtMs(v);
        if (c === 'pos') {
          var n = Number(v);
          v = (Number.isFinite(n) && n > 0) ? n : '—';
        }
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
    state.sessions.forEach(function(s){
      var o=document.createElement('option');
      o.value=s.code; o.textContent=s.code; if(s.code===state.sessionCode) o.selected=true;
      selEl.appendChild(o);
    });
    selEl.onchange=function(){ state.sessionCode=selEl.value; loadSessionRows(); };
  }

  function loadSessionRows(){
    const sess = state.sessions.find(function(x){ return x.code===state.sessionCode; }) || state.sessions[0];
    if(!sess){
      state.rows=[]; state.columns=[];
      showInfo("No session available for this GP.");
      tableBox.innerHTML="";
      return;
    }
    const srcRows = Array.isArray(sess.rows) ? sess.rows : (Array.isArray(sess.data) ? sess.data : []);
    state.rows    = buildDisplayRows(withDriverNames(srcRows));
    state.columns = ["pos","no","driver","car_engine","laps","time","gap_reason"];
    state.sort = { key:"pos", dir:1 };
    state.page = 1;
    showInfo("Session " + sess.code + " • " + srcRows.length + " rows");
    drawTable();
  }

  function formatGpName(name, round){
    if (name) {
      var m = String(name).trim().match(/^gp\s*0*(\d+)$/i);
      if (m) return "Grand Prix " + m[1];
      return name;
    }
    if (round != null) return "Grand Prix " + String(round);
    return null;
  }

  function buildGpTitle(meta){
    if (!meta) return null;
    var year    = meta.year;
    var round   = meta.round;
    var name    = formatGpName(meta.name || meta.gp_name, round);
    var left = name ? (year ? (name + " (" + year + ")") : name)
                    : (round!=null && year ? ("Grand Prix " + round + " (" + year + ")")
                                           : (year!=null ? String(year) : null));
    var circuit = meta.circuit || "";
    var country = meta.country || "";
    var right   = circuit ? (country ? (circuit + " (" + country + ")") : circuit) : "";
    if (left && right) return left + " - " + right;
    if (left) return left;
    if (right) return right + (year ? " ("+year+")" : "");
    return null;
  }

  function init(){
    state.raceId = Number(getURLParam('race', null));
    var s = getURLParam('session','') || '';
    state.sessionCode = s ? s.toUpperCase() : null;
    if(!state.raceId){ titleEl.textContent='Grand Prix — missing ?race=<race_id>'; showInfo('Example: ?race=501'); return; }
    titleEl.textContent = 'Grand Prix — race_id ' + state.raceId;

    var base = (app && app.dataset && app.dataset.base) ? app.dataset.base : 'https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main';
    loadDrivers(base).then(function(){
      var url  = base + '/races/' + state.raceId + '/sessions.json';
      showInfo('Loading... ' + url);
      return fetch(url, { cache:'no-store' }).then(function(resp){
        if(!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      }).then(function(json){
        state.meta = (json && json.meta) ? json.meta : {};
        var titleTxt = buildGpTitle(state.meta) || ('Grand Prix ' + (state.meta.round||'') + (state.meta.year ? (' ('+state.meta.year+')') : ''));
        titleEl.textContent = titleTxt;

        var sessions = [];
        if (Array.isArray(json.sessions)) {
          sessions = json.sessions.map(function(sx){ return { code: (sx.code||sx.session||'UNK').toUpperCase(), rows: sx.rows||sx.data||[] }; });
        } else {
          Object.keys(json||{}).forEach(function(k){
            var v = json[k];
            if (Array.isArray(v) && v.length && typeof v[0]==='object'){
              sessions.push({ code: k.toUpperCase(), rows: v });
            }
          });
        }

        var order=['EL1','EL2','EL3','EL4','WUP','Q1','Q2','Q3','Q4','SPRINT_SHOOTOUT','SPRINT','GRILLE','MT','COURSE'];
        sessions.sort(function(a,b){ return order.indexOf(a.code) - order.indexOf(b.code); });
        state.sessions = sessions;

        var exists = sessions.some(function(sx){ return sx.code===state.sessionCode; });
        if(!exists) state.sessionCode = (sessions[0] ? sessions[0].code : null);

        populateSessionSelect();
        loadSessionRows();
      });
    }).catch(function(err){
      console.error(err);
      showError('Load error - ' + err.message);
      tableBox.innerHTML='';
    });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

})();
