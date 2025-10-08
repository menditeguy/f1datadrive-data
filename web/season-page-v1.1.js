// season-page-v1.1.js — ES5 compatible (sélecteur de saisons en grille)
(function(){
  'use strict';

  function qs(sel,root){return (root||document).querySelector(sel);}
  function loadText(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.text().then(function(t){if(!r.ok)throw new Error('HTTP '+r.status+' on '+url);return t;});});}
  function loadJSON(url){return loadText(url).then(function(t){try{return JSON.parse(t);}catch(e){throw new Error('Invalid JSON at '+url+' — '+t.slice(0,100));}});}

  var app=qs('#f1-season-app');
  var titleEl=qs('#seasonTitle',app);
  var statusEl=qs('#status',app);
  var gridEl=qs('#seasonGrid',app);
  var tableBox=qs('#seasonTable',app);
  var BASE=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';

  function showInfo(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#666';}}
  function showError(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#b00';}}

  function drawSeasonTable(data,year){
    tableBox.innerHTML='';
    if(!data || !data.races){showInfo('Aucune donnée pour la saison '+year+'.');return;}

    var tbl=document.createElement('table');
    tbl.style.width='100%';tbl.style.borderCollapse='collapse';tbl.style.fontSize='14px';
    tbl.style.background='#fff';tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';tbl.style.borderRadius='12px';tbl.style.overflow='hidden';

    var thead=document.createElement('thead');thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    ['Round','Grand Prix','Country'].forEach(function(h){
      var th=document.createElement('th');
      th.textContent=h;
      th.style.textAlign='left';th.style.padding='10px';th.style.borderBottom='1px solid #eee';
      trh.appendChild(th);
    });
    thead.appendChild(trh);tbl.appendChild(thead);

    var tbody=document.createElement('tbody');
    data.races.forEach(function(r){
      var tr=document.createElement('tr');
      tr.onmouseenter=function(){tr.style.background='#fcfcfd';};
      tr.onmouseleave=function(){tr.style.background='';};
      tr.style.cursor='pointer';
      tr.onclick=function(){
        var target='grands-prix?race='+r.race_id;
        if(window.location.hostname.indexOf('webador')!==-1) target='/grands-prix?race='+r.race_id;
        window.open(target,'_self');
      };

      var td1=document.createElement('td');
      td1.textContent='R'+r.round;td1.style.padding='8px 10px';td1.style.borderBottom='1px solid #f3f3f3';
      var td2=document.createElement('td');
      td2.textContent=r.circuit||r.name||'';td2.style.padding='8px 10px';td2.style.borderBottom='1px solid #f3f3f3';
      var td3=document.createElement('td');
      td3.textContent=r.country||'';td3.style.padding='8px 10px';td3.style.borderBottom='1px solid #f3f3f3';
      tr.appendChild(td1);tr.appendChild(td2);tr.appendChild(td3);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
  }

  function loadSeason(year){
    if(!year){showInfo('Sélectionnez une saison.');return;}
    showInfo('Chargement de la saison '+year+' ...');
    var url=BASE+'/seasons/'+year+'/season.json';
    loadJSON(url).then(function(j){
      titleEl.textContent='Résultats de la saison '+year;
      drawSeasonTable(j,year);
      showInfo('Saison '+year+' chargée');
    }).catch(function(e){
      console.error(e);
      showError('Erreur: '+e.message);
    });
  }

  function highlightYear(year){
    var all=gridEl.querySelectorAll('.yearItem');
    for(var i=0;i<all.length;i++){
      all[i].style.textDecoration='none';
      all[i].style.color='#1565c0';
      if(all[i].textContent===String(year)){
        all[i].style.textDecoration='underline';
        all[i].style.fontWeight='bold';
      }
    }
  }

  function buildYearGrid(){
    var years=[]; var currentYear=(new Date()).getFullYear();
    for(var y=1950;y<=currentYear+1;y++){years.push(y);} // +1 = 2026
    gridEl.innerHTML='';
    gridEl.style.display='grid';
    gridEl.style.gridTemplateColumns='repeat(auto-fill, minmax(60px,1fr))';
    gridEl.style.gap='8px';
    gridEl.style.margin='12px 0 16px';

    years.forEach(function(y){
      var a=document.createElement('a');
      a.textContent=y;
      a.href='javascript:void(0)';
      a.className='yearItem';
      a.style.color='#1565c0';
      a.style.fontWeight='500';
      a.style.textAlign='center';
      a.style.textDecoration='none';
      a.style.fontSize='15px';
      a.onclick=function(){highlightYear(y);loadSeason(y);};
      gridEl.appendChild(a);
    });
  }

  function init(){
    buildYearGrid();
    var urlYear=new URL(window.location.href).searchParams.get('year');
    var startYear=urlYear || (new Date()).getFullYear();
    highlightYear(startYear);
    loadSeason(startYear);
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
