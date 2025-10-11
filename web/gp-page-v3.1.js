// gp-page-v3.1.js — ES5 compatible (parité v2.9 + boutons statiques + CDN CORS-safe + fallbacks)
// - Sessions: boutons statiques (EL1…Q4, PQx, SQx, Grid, LPbLP, TLaps, FL, Lead, Race, Resume)
// - Chargement JSON: jsDelivr (@main) + fallback Statically + githack (CORS OK)
// - Dépôt auto: races 1–500 / 501–1000 / 1001–1500
// - Tableaux "séance" et "Resume" (tris, couleurs, colonnes dynamiques, légende)
// - Laps fix: ne jamais reprendre les tours de la course pour EL / Q / WUP / FL
// - Garde la logique PerfTime de v2.9 (meilleur ms du week-end, Pos + %)
// - "No data" propre si la séance n’existe pas

(function(){
  'use strict';

  /* ========================== Utils ========================== */
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return (root||document).querySelectorAll(sel); }
  function isNum(x){ return x!==null && x!=='' && !isNaN(x); }
  function pad2(n){ n=Number(n); return (n<10?'0':'')+n; }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function byNum(a,b){ return (a==null)-(b==null) || (a>b)-(a<b); }
  function byStr(a,b){ a=(a||'')+''; b=(b||'')+''; return (a>b)-(a<b); }
  function fmtPct(x){ return isFinite(x)? (x.toFixed(2)+'%') : '—'; }
  function fmtTimeMs(ms){
    if(!isNum(ms)) return '—';
    var t=Number(ms);
    var m=Math.floor(t/60000); t-=m*60000;
    var s=Math.floor(t/1000);  t-=s*1000;
    var cs=Math.round(t/10);
    return m+':'+pad2(s)+'.'+pad2(cs);
  }
  function inferInt(x){
    if(x==null) return null;
    var s=(x+'').trim();
    if(!s) return null;
    var n=Number(s);
    return isFinite(n)? Math.round(n) : null;
  }
  function toNumber(x){
    if(x==null||x==='') return null;
    var n=+x; return isFinite(n)? n:null;
  }
  function pick(obj, keys){
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      if(obj!=null && obj.hasOwnProperty(k) && obj[k]!=null && obj[k]!=='') return obj[k];
    }
    return null;
  }

  /* ========================== DOM anchors ========================== */
  var app=qs('#f1-gp-app')||qs('#f1-season-app')||document.body;
  var titleEl=qs('#gpTitle', app) || (function(){var h=document.createElement('h2'); h.id='gpTitle'; h.style.margin='8px 0 16px'; app.appendChild(h); return h;})();
  var statusEl=qs('#status', app) || (function(){var p=document.createElement('p'); p.id='status'; p.style.color='#666'; app.appendChild(p); return p;})();
  var tabsEl=null;
  var tableBox=qs('#tableBox', app) || (function(){var d=document.createElement('div'); d.id='tableBox'; app.appendChild(d); return d;})();
  var tableTopScroller=null;

  /* ========================== Style ========================== */
  var CSS = "" +
  "#sessionTabs{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}" +
  ".chip{border-radius:14px;padding:6px 10px;border:1px solid #ddd;cursor:pointer;font-size:14px;line-height:1;user-select:none}" +
  ".chip.active{box-shadow:inset 0 -2px 0 rgba(0,0,0,.15)}" +
  ".chip.orange{background:#fff7f2;border-color:#fcc9ac;color:#d24f0f}" +
  ".chip.green{background:#f5fff7;border-color:#c7ebd1;color:#1b9e47}" +
  ".chip.blue{background:#f3f8ff;border-color:#c6dcff;color:#1a73e8}" +
  ".chip.purple{background:#f6f3ff;border-color:#d9d0ff;color:#6b4ede}" +
  ".tbl{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}" +
  ".tbl th,.tbl td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}" +
  ".tbl thead th{position:sticky;top:0;background:#fafafa;border-bottom:2px solid #eee;z-index:1}" +
  ".tbl .num{text-align:right}" +
  ".tbl .muted{color:#999}" +
  ".tbl legend{font-size:13px;color:#666;margin-top:6px}" +
  ".groupbar{height:3px}" +
  ".grp-orange{background:#ff6a00}" +
  ".grp-green{background:#1b9e47}" +
  ".grp-blue{background:#1a73e8}" +
  ".grp-purple{background:#6b4ede}" +
  ".hover-col{background:#f7fbff}" +
  ".floating-scroll{overflow-x:auto;overflow-y:hidden;border-bottom:1px dashed #e5e5e5;margin:8px 0 0}" +
  ".floating-scroll::-webkit-scrollbar{height:10px}" +
  ".floating-scroll::-webkit-scrollbar-thumb{background:#ccc;border-radius:6px}";
  var style=document.createElement('style'); style.textContent=CSS; document.head.appendChild(style);

  var COLORS={orange:'#ff6a00', green:'#1b9e47', blue:'#1a73e8', purple:'#6b4ede'};

    /* ======================== Routing / data base ======================== */

    function getRaceIdFromUrl(){
      var m = location.search.match(/[?&]race=(\d+)/);
      return m ? parseInt(m[1],10) : null;
    }

    // CORS-safe base URLs
    function baseUrls(repo){
      return [
        "https://cdn.jsdelivr.net/gh/" + repo + "@main/",
        "https://cdn.statically.io/gh/" + repo + "/main/",
        "https://raw.githack.com/" + repo + "/main/"
      ];
    }

    // Repository selector (3 sous-dépôts comme v3.0)
    function repoForRace(raceId){
      if (raceId <= 500) return "menditeguy/f1data-races-1-500";
      if (raceId <= 1000) return "menditeguy/f1data-races-501-1000";
      return "menditeguy/f1data-races-1001-1500";
    }

  /* ========================== Fetch helpers (CORS safe) ========================== */
  function fetchTextCascade(paths){
    // Essaie chaque base jusqu’à succès
    function tryOne(i){
      if(i>=paths.length) return Promise.reject(new Error('All mirrors failed'));
      return fetch(paths[i], {cache:'no-store'}).then(function(r){
        if(!r.ok) throw new Error('HTTP '+r.status+' on '+paths[i]);
        return r.text();
      })["catch"](function(){
        return tryOne(i+1);
      });
    }
    return tryOne(0);
  }
  function fetchJSONCascade(paths){
    return fetchTextCascade(paths).then(function(t){
      try { return JSON.parse(t); }
      catch(e){ throw new Error('Invalid JSON at '+paths[0]+' – '+t.slice(0,100)); }
    });
  }

  /* ========================== Session meta ========================== */
  // Ordre statique complet (avec PerfTime ajouté après Q4)
  var TAB_ORDER = [
    'EL1','EL2','EL3','EL4','WUP',
    'PQ1','PQ2','SQ1','SQ2','SQ3',
    'Q1','Q2','Q3','Q4','PERFTIME',
    'GRID','LPBLP','TLAPS','FL','LEAD','RACE',
    'RESUME'
  ];
  function tabGroup(code){
    var c=String(code||'').toUpperCase();
    if(c==='EL1'||c==='EL2'||c==='EL3'||c==='EL4'||c==='WUP') return 'orange';
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='GRID'||c==='FL'||c==='PERFTIME'||c==='TLAPS') return 'green';
    if(c==='LPBLP'||c==='LEAD'||c==='RACE'||c==='COURSE') return 'blue';
    if(c==='RESUME') return 'purple';
    return 'blue';
  }
  function colorFor(code){
    var c=String(code||'').toUpperCase();
    if(c==='EL1'||c==='EL2'||c==='EL3'||c==='EL4'||c==='WUP') return COLORS.orange;
    if(c==='PQ1'||c==='PQ2'||c==='SQ1'||c==='SQ2'||c==='SQ3'||c==='Q1'||c==='Q2'||c==='Q3'||c==='Q4'||c==='GRID'||c==='FL'||c==='PERFTIME'||c==='TLAPS') return COLORS.green;
    if(c==='LPBLP'||c==='LEAD'||c==='RACE'||c==='COURSE') return COLORS.blue;
    if(c==='RESUME') return COLORS.purple;
    return COLORS.blue;
  }
  function labelFor(code){
    var m=String(code||'').toUpperCase();
    var map={ 'COURSE':'Race', 'RACE':'Race', 'GRID':'Grid', 'FL':'FL', 'LPBLP':'LPbLP', 'TLAPS':'TLaps', 'RESUME':'Resume', 'PERFTIME':'PerfTime' };
    return map[m]||m;
  }

  function ensureTabs(){
    if(!tabsEl){
      tabsEl=document.createElement('div'); tabsEl.id='sessionTabs';
      tabsEl.style.display='flex'; tabsEl.style.flexWrap='wrap'; tabsEl.style.gap='8px'; tabsEl.style.margin='8px 0 12px';
      if(tableBox && tableBox.parentNode){ tableBox.parentNode.insertBefore(tabsEl, tableBox); } else if(app){ app.appendChild(tabsEl); }
    }
  }

  /* ========================== Build tabs ========================== */
  var activeTab=null;
  function renderTabs(){
    ensureTabs();
    tabsEl.innerHTML='';
    for(var i=0;i<TAB_ORDER.length;i++){
      (function(code){
        var chip=document.createElement('span');
        var group=tabGroup(code);
        chip.className='chip '+group;
        chip.textContent=labelFor(code);
        chip.onclick=function(){ activate(code); };
        if(activeTab===code) chip.className+=' active';
        tabsEl.appendChild(chip);
      })(TAB_ORDER[i]);
    }
  }

  /* ========================== Activate tab ========================== */
  var raceId=getRaceIdFromUrl();
  function activate(code){
    activeTab=String(code||'').toUpperCase();
    renderTabs();
    statusEl.textContent='';
    if(activeTab==='RESUME') return showResume();
    return loadSession(activeTab);
  }

  /* ========================== Data paths ========================== */
  function pathFor(repo, raceId, name){
    // race/<id>/<name>.json — (compat: grille.json / grid.json / etc.)
    return "races/"+raceId+"/"+name.toLowerCase()+".json";
  }
  function allPaths(repo, raceId, name){
    var bases=baseUrls(repo);
    var rel=pathFor(repo, raceId, name);
    var arr=[];
    for(var i=0;i<bases.length;i++) arr.push(bases[i]+rel);
    return arr;
  }

  /* ========================== Load session JSON ========================== */
  function loadSession(code){
    var repo=repoForRace(raceId);
    var name = code.toLowerCase();

    // aliases connus
    if(name==='course') name='race';
    if(name==='grille') name='grid';
    if(name==='leadlaps') name='lead';

    return fetchJSONCascade(allPaths(repo, raceId, name))["then"](function(json){
      buildSessionTable(code, json);
    })["catch"](function(err){
      tableBox.innerHTML='';
      var p=document.createElement('p'); p.textContent="No data for "+labelFor(code); p.className='muted';
      tableBox.appendChild(p);
      console.warn(err);
    });
  }

  /* ========================== Table scaffolding ========================== */
  function clearTable(){
    tableBox.innerHTML='';
    // scroller top (horizontal)
    if(tableTopScroller) tableTopScroller.remove();
    tableTopScroller=document.createElement('div');
    tableTopScroller.className='floating-scroll';
    var inner=document.createElement('div');
    inner.style.width='1800px'; inner.style.height='1px';
    tableTopScroller.appendChild(inner);
    tableBox.parentNode.insertBefore(tableTopScroller, tableBox);
  }
  function syncScroll(table){
    var sc=table.parentNode;
    tableTopScroller.onscroll=function(){ sc.scrollLeft = tableTopScroller.scrollLeft; };
    sc.onscroll=function(){ tableTopScroller.scrollLeft = sc.scrollLeft; };
  }
  function addLegend(container, items){
    var p=document.createElement('div');
    p.style.fontSize='12px'; p.style.color='#666'; p.style.marginTop='8px';
    p.textContent = items.join('   •   ');
    container.appendChild(p);
  }

  /* ========================== Build per-session table ========================== */
  function buildSessionTable(code, json){
    clearTable();

    var tbl=document.createElement('table'); tbl.className='tbl';
    var thead=document.createElement('thead'); var tbody=document.createElement('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);

    // columns
    var cols=[
      {key:'pos', label:'Pos', className:'num'},
      {key:'no',  label:'No',  className:'num'},
      {key:'driver', label:'Driver'},
      {key:'car_engine', label:'Car / Engine'}
    ];

    // Laps + Time + Gap/Reason (classiques)
    cols.push({key:'laps', label:'Laps', className:'num'});
    cols.push({key:'time', label:'Time', className:'num'});
    cols.push({key:'gap',  label:'Gap / Reason', className:'num'});

    // Pour FL : ajoute la colonne tour du meilleur tour si présente
    if(code.toUpperCase()==='FL'){
      if(json && json.data && json.data.length && (json.data[0].hasOwnProperty('lap')||json.data[0].hasOwnProperty('lap_no')||json.data[0].hasOwnProperty('lap_number'))){
        cols.splice(5,0,{key:'lap', label:'Lap', className:'num'});
      }
    }

    // THEAD
    var tr=document.createElement('tr');
    for(var c=0;c<cols.length;c++){
      var th=document.createElement('th'); th.textContent=cols[c].label; if(cols[c].className) th.className=cols[c].className;
      tr.appendChild(th);
    }
    thead.appendChild(tr);

    // TBODY — normalise champs
    var rows=(json && json.data)? json.data : [];
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      var trb=document.createElement('tr');
      var pos = pick(r,['position','pos','rank']); if(pos!=null) pos=+pos;
      var no  = pick(r,['number','no','car_no']);
      var drv = pick(r,['driver','driver_name','name']);
      var ce  = pick(r,['car_engine','car','car_engine_name','team']);
      var laps= pick(r,['laps','lap_count']);
      var time= pick(r,['time','best_time','total_time','race_time']);
      var gap = pick(r,['gap','gap_reason','reason','diff']);

      // Lap (FL)
      var lapField = pick(r,['lap','lap_no','lap_number']);

      var tds=[
        pos!=null? pos : '—',
        no!=null? no : '—',
        drv||'—',
        ce||'—',
        laps!=null? laps : '—'
      ];

      if(code.toUpperCase()==='FL' && (lapField!=null)){
        tds.push(lapField);
      }

      tds.push(time||'—');
      tds.push(gap!=null? gap : '—');

      for(var k=0;k<tds.length;k++){
        var td=document.createElement('td');
        var val=tds[k];
        if(k===0||k===1||k===4||(code.toUpperCase()==='FL' && k===5)) td.className='num';
        td.textContent=val;
        trb.appendChild(td);
      }
      tbody.appendChild(trb);
    }

    // Render
    var wrapper=document.createElement('div'); wrapper.style.overflow='auto';
    wrapper.appendChild(tbl); tableBox.appendChild(wrapper);
    syncScroll(wrapper);

    // Légende (optionnelle)
    if(code.toUpperCase()==='FL'){
      addLegend(tableBox,[
        'Lap = numéro du tour du meilleur temps (si disponible)'
      ]);
    }
  }

  /* ========================== Resume (synthèse) ========================== */
  function showResume(){
    clearTable();

    statusEl.textContent='Resume built';

    var repo=repoForRace(raceId);
    // Charger sessions nécessaires au modèle Resume :
    var need = ['RACE','GRID','FL','EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4'];
    // PerfTime est calculée localement (ou via JSON futur)

    var promises=[];
    for(var i=0;i<need.length;i++){
      (function(code){
        promises.push(fetchJSONCascade(allPaths(repo, raceId, code.toLowerCase()))["catch"](function(){ return {data:[]}; }));
      })(need[i]);
    }

    Promise.all(promises).then(function(all){
      var maps={};
      for(var i=0;i<need.length;i++) maps[need[i]]=all[i];

      buildResume(maps);
    })["catch"](function(err){
      tableBox.innerHTML='';
      var p=document.createElement('p'); p.textContent="Unable to build Resume"; p.className='muted';
      tableBox.appendChild(p);
      console.warn(err);
    });
  }

  // Récupère meilleurs temps week-end par pilote (PerfTime)
  function computePerfTime(bestBySession){
    // bestBySession: { code -> [{driver_id,time_ms,...}, ...] }
    var bestOfDriver={};  // driver_id -> best ms
    var globalBest=null;

    function use(ms, id){
      if(!isNum(ms)) return;
      if(bestOfDriver[id]==null || ms<bestOfDriver[id]) bestOfDriver[id]=ms;
      if(globalBest==null || ms<globalBest) globalBest=ms;
    }

    var SESS = ['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','FL'];
    for(var i=0;i<SESS.length;i++){
      var code=SESS[i], arr=bestBySession[code] && bestBySession[code].data || [];
      for(var j=0;j<arr.length;j++){
        var r=arr[j];
        var id = pick(r,['driver_id','id_driver','driverId','id']);
        var t  = pick(r,['best_ms','best_time_ms','time_ms','timeMs','time_ms_abs']);
        var t2 = null;
        if(!isNum(t)){
          // fallback texte "1:18.572"
          var txt = pick(r,['best_time','time']);
          if(txt){ 
            var m = (txt+'').match(/(?:(\d+):)?(\d+)\.(\d{1,3})/);
            if(m){
              var mm=+m[1]||0, ss=+m[2]||0, cs=+(''+m[3]).padEnd(3,'0');
              t2=mm*60000+ss*1000+cs;
            }
          }
        }
        use(isNum(t)?+t:t2, id);
      }
    }
    return {bestOfDriver:bestOfDriver, globalBest:globalBest};
  }

  function buildResume(maps){
    var race = maps.RACE && maps.RACE.data || [];
    var grid = maps.GRID && maps.GRID.data || [];

    // construire bestBySession pour PerfTime()
    var bestBySession={};
    var SESS = ['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','FL'];
    for(var i=0;i<SESS.length;i++){
      var code=SESS[i]; bestBySession[code]=maps[code]||{data:[]};
    }
    var perf = computePerfTime(bestBySession);
    var bestOfDriver=perf.bestOfDriver, globalBest=perf.globalBest;

    // index course (ordre final)
    var raceOrder={}, drivers=[];
    for(var i=0;i<race.length;i++){
      var r=race[i], id=pick(r,['driver_id','id_driver','driverId','id']);
      raceOrder[id]= pick(r,['position','pos','rank']) || (i+1);
      drivers.push({id:id, driver: pick(r,['driver','driver_name','name']), team: pick(r,['team','car_engine','car_engine_name'])});
    }

    // compléter pilotes manquants via grille
    for(var g=0;g<grid.length;g++){
      var gr=grid[g], idg=pick(gr,['driver_id','id_driver','driverId','id']);
      if(idg && raceOrder[idg]==null){
        raceOrder[idg]=999; // pas classé
        drivers.push({id:idg, driver: pick(gr,['driver','driver_name','name']), team: pick(gr,['team','car_engine','car_engine_name'])});
      }
    }

    // Modèle de ligne
    function mkRow(drv){
      var id=drv.id, obj={
        RESULTAT_RACE: raceOrder[id] || null,
        DRIVER: drv.driver||'—',
        TEAM: drv.team||'—',
        ABMEC:null, ABPILOTE:null,
        // sessions → Pos + %
      };

      // Abandons si présents dans RACE
      var rec = null;
      for(var k=0;k<race.length;k++){
        var rr=race[k]; var rid=pick(rr,['driver_id','id_driver','driverId','id']);
        if(rid===id){ rec=rr; break; }
      }
      if(rec){
        var abm = pick(rec,['ab_mec','ab_mec_count','ret_mech']);
        var abp = pick(rec,['ab_pilote','ab_driver','ret_driver']);
        obj.ABMEC = inferInt(abm);
        obj.ABPILOTE = inferInt(abp);
      }

      // remplit (Pos + %) pour toutes les sessions disponibles dans maps
      function fill(code){
        var data = maps[code] && maps[code].data || [];
        var found=null;
        for(var i=0;i<data.length;i++){
          var rr=data[i]; var rid=pick(rr,['driver_id','id_driver','driverId','id']);
          if(rid===id){ found=rr; break; }
        }
        var pos = found? pick(found,['position','pos','rank']) : null;
        var pct = null;

        // percent: rapport au meilleur temps absolu de la session (ms si dispo sinon parse)
        if(found){
          var ms = pick(found,['best_ms','best_time_ms','time_ms','timeMs','time_ms_abs']);
          if(!isNum(ms)){
            var txt=pick(found,['best_time','time']);
            if(txt){
              var m=(txt+'').match(/(?:(\d+):)?(\d+)\.(\d{1,3})/);
              if(m){
                var mm=+m[1]||0, ss=+m[2]||0, cs=+(''+m[3]).padEnd(3,'0');
                ms=mm*60000+ss*1000+cs;
              }
            }
          }
          if(isNum(ms)){
            // cherche meilleur de la session
            var best=null;
            for(var t=0;t<data.length;t++){
              var rr2=data[t];
              var ms2 = pick(rr2,['best_ms','best_time_ms','time_ms','timeMs','time_ms_abs']);
              if(!isNum(ms2)){
                var tx=pick(rr2,['best_time','time']);
                if(tx){
                  var m2=(tx+'').match(/(?:(\d+):)?(\d+)\.(\d{1,3})/);
                  if(m2){
                    var mm2=+m2[1]||0, ss2=+m2[2]||0, cs2=+(''+m2[3]).padEnd(3,'0');
                    ms2=mm2*60000+ss2*1000+cs2;
                  }
                }
              }
              if(isNum(ms2) && (best==null || ms2<best)) best=ms2;
            }
            if(isNum(best)) pct = (ms/best*100);
          }
        }
        obj[code+'_pos']= pos!=null ? Number(pos) : null;
        obj[code+'_pct']= pct!=null ? +pct.toFixed(2) : null;
      }

      var ALL=['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','GRID','FL'];
      for(var a=0;a<ALL.length;a++) fill(ALL[a]);

      // PerfTime (Pos + %)
      var posPerf=null;
      if(bestOfDriver[id]!=null && globalBest!=null){
        var arr=Object.keys(bestOfDriver).map(function(k){ return {id:k, t:bestOfDriver[k]}; }).sort(function(a,b){return a.t-b.t;});
        for(var p=0;p<arr.length;p++){ if(arr[p].id==id){ posPerf=p+1; break; } }
      }
      obj['PERFTIME_pos']= posPerf;
      obj['PERFTIME_pct']= (bestOfDriver[id]!=null && globalBest!=null)? +((bestOfDriver[id]/globalBest*100)).toFixed(2) : null;

      return obj;
    }

    // construire lignes
    var mapRows={}; var rows=[];
    for(var d=0;d<drivers.length;d++){
      var row=mkRow(drivers[d]); rows.push(row); mapRows[drivers[d].id]=row;
    }

    // colonnes dynamiques (sticky: Driver/Team)
    var columns=[];
    columns.push({key:'DRIVER',label:'Driver / Team', group:'', sticky:true});
    columns.push({key:'pct_dummy',label:'%', group:'', hidden:true}); // garde l’alignement précédent (%)
    // sessions → Pos + %
    function push2(code, label, grp){
      columns.push({key:code+'_pos', label:label+' Pos', group:grp});
      columns.push({key:code+'_pct', label:label+' %',   group:grp});
    }
    var S=['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','GRID','FL'];
    for(var s=0;s<S.length;s++){
      var grp=(S[s]==='GRID' || S[s]==='FL')?'green': (S[s].charAt(0)==='E' || S[s]==='WUP')?'orange':'green';
      push2(S[s], S[s]==='GRID'?'GRILLE':'%'.replace('%',S[s]), grp);
    }
    columns.push({key:'PERFTIME_pos', label:'PerfTime Pos', group:'green'});
    columns.push({key:'PERFTIME_pct', label:'PerfTime %',   group:'green'});

    var hasAbMec=false, hasAbPil=false;
    for(var r0=0;r0<rows.length;r0++){ if(rows[r0].ABMEC!=null) hasAbMec=true; if(rows[r0].ABPILOTE!=null) hasAbPil=true; }
    if(hasAbMec) columns.push({key:'ABMEC', label:'Ab mec', group:'blue'});
    if(hasAbPil) columns.push({key:'ABPILOTE', label:'Ab pilote', group:'blue'});
    columns.push({key:'NB_TOURS_WEEKEND', label:'Nb tours weekend', group:'blue'}); // quand dispo (sinon vide)

    // THEAD + groupbars
    var tbl=document.createElement('table'); tbl.className='tbl';
    var thead=document.createElement('thead'); var tbody=document.createElement('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);

    var tr=document.createElement('tr');
    // barre de groupe
    var trg=document.createElement('tr'); var thg=document.createElement('th'); thg.colSpan=columns.length; thg.style.padding=0;
    var gb=document.createElement('div'); gb.className='groupbar grp-green'; // start neutral
    gb.style.background='linear-gradient(90deg,#ff6a00 0 33%,#1b9e47 33% 66%,#1a73e8 66% 100%)';
    thg.appendChild(gb); trg.appendChild(thg); thead.appendChild(trg);

    for(var c=0;c<columns.length;c++){
      var th=document.createElement('th'); th.textContent=columns[c].label;
      if(columns[c].sticky){ th.style.position='sticky'; th.style.left='0'; th.style.zIndex='2'; th.style.background='#fafafa'; }
      tr.appendChild(th);
    }
    thead.appendChild(tr);

    // TBODY
    rows.sort(function(a,b){ return byNum(a.RESULTAT_RACE, b.RESULTAT_RACE); });

    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      var trb=document.createElement('tr');

      for(var c=0;c<columns.length;c++){
        var col=columns[c], td=document.createElement('td');

        if(col.key==='DRIVER'){
          td.innerHTML='<div><strong>'+ (r.DRIVER||'—') +'</strong><div class="muted">'+(r.TEAM||'')+'</div></div>';
          td.style.position='sticky'; td.style.left='0'; td.style.background='#fff';
        }else if(col.key==='pct_dummy'){
          td.textContent=''; td.className='num';
        }else{
          var val=r[col.key];
          if(/_pct$/.test(col.key)) { td.className='num'; td.textContent = val!=null? (val.toFixed? val.toFixed(2):val)+'%' : '—'; }
          else if(/_pos$/.test(col.key)) { td.className='num'; td.textContent = val!=null? val : '—'; }
          else if(col.key==='NB_TOURS_WEEKEND'){ td.className='num'; td.textContent = r.NB_TOURS_WEEKEND!=null? r.NB_TOURS_WEEKEND : '—'; }
          else if(col.key==='ABMEC'||col.key==='ABPILOTE'){ td.className='num'; td.textContent = val!=null? val : '—'; }
          else { td.textContent = val!=null? val : '—'; }
        }
        trb.appendChild(td);
      }
      tbody.appendChild(trb);
    }

    // Render
    var wrapper=document.createElement('div'); wrapper.style.overflow='auto';
    wrapper.appendChild(tbl); tableBox.appendChild(wrapper);
    syncScroll(wrapper);

    addLegend(tableBox, [
      'Orange = séances libres', 'Vert = séances chronométrées', 'Bleu = éléments de course', 'Violet = synthèse'
    ]);
  }

  /* ========================== Boot ========================== */
  (function init(){
    if(!raceId){ statusEl.textContent='Race id missing'; return; }
    titleEl.textContent='Grand Prix '+raceId;
    activeTab = TAB_ORDER[0];
    renderTabs();
    activate(TAB_ORDER[0]); // EL1 par défaut; l’utilisateur change ensuite
  })();

})();
