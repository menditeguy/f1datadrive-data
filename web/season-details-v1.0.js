// season-details-v1.0.js — Page détail saison (style Forix simplifié)
(function(){
  'use strict';

  function qs(sel,root){return (root||document).querySelector(sel);}
  function loadJSON(url){return fetch(url,{cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('HTTP '+r.status+' on '+url);
    return r.json();
  });}

  var app=qs('#f1-season-details');
  var titleEl=qs('#seasonTitle',app);
  var statusEl=qs('#status',app);
  var contentEl=qs('#seasonContent',app);
  var BASE=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';

  function showInfo(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#666';}}
  function showError(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#b00';}}

  function renderRaceList(races){
    var div=document.createElement('div');
    div.style.display='grid';
    div.style.gridTemplateColumns='repeat(auto-fit,minmax(220px,1fr))';
    div.style.gap='10px';
    races.forEach(r=>{
      var box=document.createElement('div');
      box.style.border='1px solid #ddd';
      box.style.borderRadius='10px';
      box.style.padding='8px 10px';
      box.style.background='#fff';
      box.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';
      var name=document.createElement('div');
      name.innerHTML='<strong>'+r.circuit+'</strong>';
      var country=document.createElement('div');
      country.style.color='#666';
      country.textContent=r.country||'';
      box.appendChild(name);
      box.appendChild(country);
      div.appendChild(box);
    });
    return div;
  }

  function renderStandings(standings){
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.style.borderCollapse='collapse';
    tbl.style.marginTop='20px';
    tbl.style.fontSize='14px';
    tbl.style.background='#fff';
    tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';
    tbl.style.borderRadius='12px';
    var trh=document.createElement('tr');
    ['Pos','Driver','Team','Points'].forEach(h=>{
      var th=document.createElement('th');
      th.textContent=h;
      th.style.textAlign='left';
      th.style.padding='8px 10px';
      th.style.borderBottom='1px solid #eee';
      trh.appendChild(th);
    });
    tbl.appendChild(trh);

    standings.forEach((s,i)=>{
      var tr=document.createElement('tr');
      function td(t){var td=document.createElement('td');td.textContent=t;td.style.padding='6px 10px';td.style.borderBottom='1px solid #f3f3f3';return td;}
      tr.appendChild(td(i+1));
      tr.appendChild(td(s.driver||''));
      tr.appendChild(td(s.team||''));
      tr.appendChild(td(s.points||''));
      tbl.appendChild(tr);
    });
    return tbl;
  }

  function loadSeason(year){
    showInfo('Chargement de la saison '+year+' ...');
    var url=BASE+'/seasons/'+year+'/season.json';
    loadJSON(url).then(j=>{
      titleEl.textContent='Saison '+year;
      contentEl.innerHTML='';
      if(!j || !j.races){showError('Aucune donnée trouvée.');return;}
      var races=j.races||[];
      var standings=j.standings||j.pilotes||[];

      var h3=document.createElement('h3');
      h3.textContent=races.length+' Grands Prix';
      h3.style.margin='10px 0';
      contentEl.appendChild(h3);
      contentEl.appendChild(renderRaceList(races));

      if(standings.length){
        var h4=document.createElement('h3');
        h4.textContent='Classement Pilotes';
        h4.style.margin='20px 0 8px';
        contentEl.appendChild(h4);
        contentEl.appendChild(renderStandings(standings));
      }
      showInfo('Saison '+year+' chargée');
    }).catch(e=>{
      console.error(e);
      showError('Erreur: '+e.message);
    });
  }

  function init(){
    var params=new URL(window.location.href).searchParams;
    var year=params.get('year');
    if(!year){showError('Paramètre year manquant.');return;}
    loadSeason(year);
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
