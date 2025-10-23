(function(){
  var t=document.getElementById("gpTitle");
  var s=document.getElementById("sessionSelect");
  var st=document.getElementById("status");
  var tbl=document.getElementById("sessionTable");

  function getRaceId(){
    var q={}, p=window.location.search.replace(/^\?/,"").split("&");
    for(var i=0;i<p.length;i++){ if(!p[i]) continue; var kv=p[i].split("="); q[decodeURIComponent(kv[0]||"")]=decodeURIComponent(kv[1]||""); }
    return q.race || "501";
  }
  var raceId=getRaceId();
  var url="https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main/races/"+raceId+"/sessions.json?nocache="+Date.now();

  var LABEL={"EL1":"EL1","EL2":"EL2","EL3":"EL3","EL4":"EL4","Q1":"Q1","Q2":"Q2","Q3":"Q3","Q4":"Q4","WUP":"Warm-up","MT":"Meilleur tour","GRILLE":"Grille","COURSE":"Course","SPRINT":"Sprint","SPRINT_SHOOTOUT":"Sprint Shootout"};
  var ORDER=["EL1","EL2","EL3","EL4","WUP","Q1","Q2","Q3","Q4","SPRINT_SHOOTOUT","SPRINT","GRILLE","MT","COURSE"];

  function renderTable(rows){
    if(!rows||!rows.length){ return '<div style="color:#666">Aucune ligne.</div>'; }
    var cols=Object.keys(rows[0]||{});
    var h='<div style="overflow:auto"><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;min-width:720px"><thead><tr>';
    for(var i=0;i<cols.length;i++){ h+='<th style="text-align:left;background:#f3f3f3">'+cols[i]+'</th>'; }
    h+='</tr></thead><tbody>';
    var max=Math.min(rows.length,100);
    for(var r=0;r<max;r++){ h+='<tr>'; for(var c=0;c<cols.length;c++){ var v=rows[r][cols[c]]; h+='<td>'+(v===undefined||v===null?'':String(v))+'</td>'; } h+='</tr>'; }
    h+='</tbody></table></div>';
    if(rows.length>max){ h+='<div style="margin-top:6px;color:#666">('+String(rows.length-max)+' lignes supplementaires non affichees)</div>'; }
    return h;
  }

  function show(list,code){
    var obj=null; for(var i=0;i<list.length;i++){ if(list[i].code===code){ obj=list[i]; break; } }
    if(!obj&&list.length){ obj=list[0]; }
    if(!obj){ return; }
    var nb=obj.nb_rows?obj.nb_rows:(obj.rows?obj.rows.length:0);
    st.textContent="Seance: "+(LABEL[obj.code]||obj.code)+" - "+nb+" lignes";
    tbl.innerHTML=renderTable(obj.rows||[]);
  }

  st.textContent="Chargement... "+url;

  fetch(url,{cache:"no-store"})
    .then(function(r){ if(!r.ok){ throw new Error("HTTP "+r.status); } return r.json(); })
    .then(function(data){
      try{ if(data&&data.gp&&data.gp.name&&data.gp.year){ t.textContent="GP "+String(data.gp.name)+" - "+String(data.gp.year); } }catch(e){}
      var list=Array.isArray(data&&data.sessions)?data.sessions:[];
      var arr=[]; for(var i=0;i<list.length;i++){ var it=list[i]; var has=(it&&((it.nb_rows&&it.nb_rows>0)||(it.rows&&it.rows.length>0))); if(has){ arr.push(it); } }
      arr.sort(function(a,b){ return ORDER.indexOf(a.code)-ORDER.indexOf(b.code); });

      s.innerHTML="";
      if(!arr.length){ st.textContent="Aucune seance disponible. URL: "+url; tbl.innerHTML=""; return; }
      for(var j=0;j<arr.length;j++){ var opt=document.createElement("option"); opt.value=arr[j].code; opt.textContent=LABEL[arr[j].code]||arr[j].code; s.appendChild(opt); }
      show(arr, s.value||arr[0].code);
      s.addEventListener("change", function(e){ show(arr, e.target.value); });
    })
    .catch(function(err){ st.textContent="Erreur: "+err.message+" - "+url; tbl.innerHTML=""; });
})();
