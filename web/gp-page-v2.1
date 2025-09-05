// gp-page-v2.1.js — Tableau v2 (tri + pagination) pour la page GP (Webador)
/* global window, document */
(function () {
  "use strict";

  const qs  = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmtMs = (v) => {
    if (v == null || isNaN(Number(v))) return v;
    const ms = Number(v), s = Math.floor(ms/1000), mm = Math.floor(s/60), ss = s%60, mmm = ms%1000;
    return `${mm}:${String(ss).padStart(2,"0")}.${String(mmm).padStart(3,"0")}`;
  };
  const isLikelyMsCol = (c) => /(^|_)(ms|milliseconds|lap_ms|best_lap_ms|fastest_lap_ms|best_time_ms)$/i.test(c);
  const isNumeric = (val) => val !== null && val !== "" && !isNaN(val);
  const getURLParam = (k, d=null) => (new URL(window.location.href)).searchParams.get(k) ?? d;

  const app      = qs("#f1-gp-app");
  const titleEl  = qs("#gpTitle", app);
  const statusEl = qs("#status", app);
  const selEl    = qs("#sessionSelect", app);
  const tableBox = qs("#sessionTable", app);

  const state = { raceId:null, sessionCode:null, sessions:[], rows:[], columns:[], sort:{key:null,dir:1}, page:1, pageSize:25 };

  function showError(msg) { statusEl.textContent = msg; statusEl.style.color = "#b00"; }
  function showInfo(msg)  { statusEl.textContent = msg; statusEl.style.color = "#666"; }

  function renderPager() {
    const total = state.rows.length, totalPages = Math.max(1, Math.ceil(total/state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const wrap = document.createElement("div");
    wrap.style.display="flex"; wrap.style.alignItems="center"; wrap.style.gap="8px"; wrap.style.margin="10px 0";
    const info = document.createElement("span"); info.style.fontSize="12px";
    info.textContent = `Total : ${total} lignes • Page ${state.page}/${totalPages}`; wrap.appendChild(info);
    const mkBtn=(t,on,dis=false)=>{const b=document.createElement("button"); b.textContent=t; b.disabled=dis;
      b.style.padding="6px 10px"; b.style.border="1px solid #ddd"; b.style.borderRadius="8px";
      b.style.background=dis?"#f5f5f5":"#fff"; b.style.cursor=dis?"not-allowed":"pointer"; b.onclick=on; return b;};
    wrap.appendChild(mkBtn("⏮",()=>{state.page=1;drawTable();},state.page===1));
    wrap.appendChild(mkBtn("◀", ()=>{state.page=Math.max(1,state.page-1);drawTable();},state.page===1));
    wrap.appendChild(mkBtn("▶", ()=>{state.page=Math.min(totalPages,state.page+1);drawTable();},state.page===totalPages));
    wrap.appendChild(mkBtn("⏭",()=>{state.page=totalPages;drawTable();},state.page===totalPages));
    const sizeSel=document.createElement("select"); [10,25,50,100].forEach(n=>{const o=document.createElement("option"); o.value=n;o.textContent=`${n}/page`; if(n===state.pageSize)o.selected=true; sizeSel.appendChild(o);});
    sizeSel.onchange=()=>{state.pageSize=Number(sizeSel.value);state.page=1;drawTable();}; sizeSel.style.marginLeft="auto"; sizeSel.style.padding="6px"; sizeSel.style.borderRadius="8px"; wrap.appendChild(sizeSel);
    return wrap;
  }

  function sortRows(){
    const {key,dir}=state.sort; if(!key) return;
    const numeric = state.rows.some(r=>isNumeric(r[key]));
    state.rows.sort((a,b)=>{
      const va=a[key],vb=b[key];
      if(numeric){ const na=Number(va), nb=Number(vb);
        if(isNaN(na)&&isNaN(nb))return 0; if(isNaN(na))return 1; if(isNaN(nb))return -1; return (na-nb)*dir;
      } else { return ((va??"").toString().toLowerCase()).localeCompare((vb??"").toString().toLowerCase())*dir; }
    });
  }

  function drawTable(){
    tableBox.innerHTML="";
    tableBox.appendChild(renderPager());
    const tbl=document.createElement("table");
    tbl.style.width="100%"; tbl.style.borderCollapse="collapse"; tbl.style.fontSize="14px";
    tbl.style.background="#fff"; tbl.style.boxShadow="0 1px 2px rgba(0,0,0,0.06)"; tbl.style.borderRadius="12px"; tbl.style.overflow="hidden";
    const thead=document.createElement("thead"), trh=document.createElement("tr");
    state.columns.forEach(col=>{
      const th=document.createElement("th"); th.textContent=col; th.style.textAlign="left"; th.style.padding="10px"; th.style.borderBottom="1px solid #eee"; th.style.cursor="pointer"; th.style.userSelect="none";
      th.onclick=()=>{ state.sort.key===col ? state.sort.dir*=-1 : (state.sort.key=col,state.sort.dir=1); sortRows(); drawTable(); };
      if(state.sort.key===col){ th.textContent = `${col} ${state.sort.dir===1?"▲":"▼"}`; }
      trh.appendChild(th);
    });
    thead.appendChild(trh); thead.style.position="sticky"; thead.style.top="0"; thead.style.background="#fafafa"; tbl.appendChild(thead);

    sortRows(); const start=(state.page-1)*state.pageSize, end=start+state.pageSize, slice=state.rows.slice(start,end);
    const tbody=document.createElement("tbody");
    slice.forEach(r=>{ const tr=document.createElement("tr"); tr.onmouseenter=()=>tr.style.background="#fcfcfd"; tr.onmouseleave=()=>tr.style.background="";
      state.columns.forEach(c=>{ const td=document.createElement("td"); let v=r[c]; if(isLikelyMsCol(c)&&isNumeric(v)) v=fmtMs(v);
        td.textContent = v==null ? "" : v; td.style.padding="8px 10px"; td.style.borderBottom="1px solid #f3f3f3"; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody); tableBox.appendChild(tbl); tableBox.appendChild(renderPager());
  }

  function populateSessionSelect(){
    selEl.innerHTML=""; state.sessions.forEach(s=>{ const o=document.createElement("option"); o.value=s.code; o.textContent=s.code; if(s.code===state.sessionCode)o.selected=true; selEl.appendChild(o); });
    selEl.onchange=()=>{ state.sessionCode=selEl.value; loadSessionRows(); };
  }

  function loadSessionRows(){
    const sess = state.sessions.find(x=>x.code===state.sessionCode) || state.sessions[0];
    if(!sess){ state.rows=[]; state.columns=[]; showInfo("Aucune session disponible pour ce GP."); tableBox.innerHTML=""; return; }
    const rows = Array.isArray(sess.rows) ? sess.rows : (Array.isArray(sess.data) ? sess.data : []);
    state.rows = rows.slice();
    const keySet=new Set(); rows.slice(0,50).forEach(r=>Object.keys(r||{}).forEach(k=>keySet.add(k))); state.columns=Array.from(keySet);
    state.sort = state.columns.includes("position") ? {key:"position", dir:1} : {key:null, dir:1}; state.page=1;
    showInfo(`Session ${sess.code} • ${rows.length} lignes`); drawTable();
  }

  async function init(){
    state.raceId = Number(getURLParam("race", null));
    state.sessionCode = (getURLParam("session","")||"").toUpperCase() || null;
    if(!state.raceId){ titleEl.textContent="Grand Prix — paramètre ?race=<race_id> manquant"; showInfo("Exemple : ?race=501"); return; }
    titleEl.textContent = `Grand Prix — race_id ${state.raceId}`;

    const base = app?.dataset?.base || "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main";
    const url  = `${base}/races/${state.raceId}/sessions.json`;
    showInfo(`Chargement… ${url}`);

    try{
      const resp = await fetch(url, { cache:"no-store" });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      let sessions = [];
      if (Array.isArray(json.sessions)) {
        sessions = json.sessions.map(s => ({ code: (s.code||s.session||"UNK").toUpperCase(), rows: s.rows||s.data||[] }));
      } else {
        sessions = Object.entries(json||{})
          .filter(([k,v]) => Array.isArray(v) && v.length && typeof v[0]==="object")
          .map(([k,v]) => ({ code: k.toUpperCase(), rows: v }));
      }

      const order=["EL1","EL2","EL3","EL4","WUP","Q1","Q2","Q3","Q4","SPRINT_SHOOTOUT","SPRINT","GRILLE","MT","COURSE"];
      sessions.sort((a,b)=> (order.indexOf(a.code)) - (order.indexOf(b.code)));

      state.sessions = sessions;
      const exists = sessions.some(s=>s.code===state.sessionCode);
      if(!exists) state.sessionCode = sessions[0]?.code ?? null;

      populateSessionSelect(); loadSessionRows();
    }catch(err){
      console.error(err);
      showError(`Erreur de chargement — ${err.message}. URL : ${url}`);
      tableBox.innerHTML="";
    }
  }

  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
