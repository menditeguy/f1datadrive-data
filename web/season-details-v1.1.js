// season-details-v1.1.js — GP cliquables + layout allégé + numéros de GP
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

  // -- Grille des GP (plus légère + cliquable)
  function renderRaceList(races){
    var div=document.createElement('div');
    div.style.display='grid';
    div.style.gridTemplateColumns='repeat(auto-fit,minmax(240px,1fr))';
    div.style.gap='8px';
    div.style.margin='12px 0';

    races.forEach(r=>{
      var box=document.createElement('div');
      box.style.border='1px solid #ddd';
      box.style.borderRadius='8px';
      box.style.padding='6px 10px';
      box.style.background='#fff';
      box.style.cursor='pointer';
      box.style.transition='all 0.2s';
      box.onmouseenter=function(){box.style.background='#f8f9fb';box.style.boxShadow='0 2px 4px rgba(0,0,0,0.08)';};
      box.onmouseleave=function(){box.style.background='#fff';box.style.boxShadow='none';};
      box.onclick=function(){
        var target='/grands-prix?race='+r.race_id;
        window.open(target,'_self');
      };

      var name=document.createElement('div');
      name.innerHTML='<strong>R'+r.round+' – '+(r.circuit||'')+'</strong>';
      name.style.fontSize='15px';
      name.style.marginBottom='3px';

      var country=document.createElement('div');
      country.style.color='#555';
      country.style.fontSize='13px';
      country.textContent=r.country||'';

      box.appendChild(name);
      box.appendChild(country);
      div.appendChild(box);
    });

    return div;
  }

  // -- Tableau des classements
  function renderStandings(standings){
    if(!standings.length) return document.createTextNode('');
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.style.borderCollapse='collapse';
    tbl.style.marginTop='20px';
    tbl.style.fontSize='14px';
    tbl.style.background='#fff';
    tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';
    tbl.style.borderRadius='8px';
    tbl.style.overflow='hidden';

    var thead=document.createElement('thead');
    thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    ['Pos','Driver','Team','Points'].forEach(function(h){
      var th=document.createElement('th');
      th.textContent=h;
      th.style.textAlign='left';
      th.style.padding='8px 10px';
      th.style.borderBottom='1px solid #eee';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

    var tbody=document.createElement('tbody');
    standings.forEach(function(s,i){
      var tr=document.createElement('tr');
      function td(t){var d=document.createElement('td');d.textContent=t;d.style.padding='6px 10px';d.style.borderBottom='1px solid #f3f3f3';return d;}
      tr.appendChild(td(i+1));
      tr.appendChild(td(s.driver||''));
      tr.appendChild(td(s.team||''));
      tr.appendChild(td(s.points||''));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function loadSeason(year){
    showInfo('Chargement de la saison '+year+' ...');
    var url=BASE+'/seasons/'+year+'/season.json';
    loadJSON(url).then(function(j){
      titleEl.textContent='Saison '+year;
      contentEl.innerHTML='';
      if(!j || !j.races){showError('Aucune donnée trouvée.');return;}
      var races=j.races||[];
      var standings=j.standings||j.pilotes||[];

      var h3=document.createElement('h3');
      h3.textContent=races.length+' Grands Prix';
      h3.style.margin='10px 0';
      contentEl.appendChild(h3);

      // Ajouter la grille
      contentEl.appendChild(renderRaceList(races));

      // Classement pilotes (si dispo)
      if(standings.length){
        var h4=document.createElement('h3');
        h4.textContent='Classement Pilotes';
        h4.style.margin='20px 0 8px';
        contentEl.appendChild(h4);
        contentEl.appendChild(renderStandings(standings));
      }
      showInfo('Saison '+year+' chargée');
    }).catch(function(e){
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
