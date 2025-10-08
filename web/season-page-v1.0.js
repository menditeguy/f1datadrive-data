// season-page-v1.0.js — ES5 compatible (Résultats par saison)
(function(){
  'use strict';

  function qs(sel,root){return (root||document).querySelector(sel);}
  function loadText(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.text().then(function(t){if(!r.ok)throw new Error('HTTP '+r.status+' on '+url);return t;});});}
  function loadJSON(url){return loadText(url).then(function(t){try{return JSON.parse(t);}catch(e){throw new Error('Invalid JSON at '+url+' — '+t.slice(0,100));}});}

  var app=qs('#f1-season-app');
  var titleEl=qs('#seasonTitle',app);
  var statusEl=qs('#status',app);
  var selEl=qs('#seasonSelect',app);
  var tableBox=qs('#seasonTable',app);
  var BASE=(app && app.dataset && app.dataset.base)?app.dataset.base:'https://menditeguy.github.io/f1datadrive-data';

  function showInfo(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#666';}}
  function showError(msg){if(statusEl){statusEl.textContent=msg;statusEl.style.color='#b00';}}

  function drawSeasonTable(data){
    tableBox.innerHTML='';
    if(!data || !data.races){showInfo('Aucune donnée pour cette saison.');return;}

    var tbl=document.createElement('table');
    tbl.style.width='100%';tbl.style.borderCollapse='collapse';tbl.style.fontSize='14px';
    tbl.style.background='#fff';tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';tbl.style.borderRadius='12px';tbl.style.overflow='hidden';

    var thead=document.createElement('thead');
    thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    ['Round','Grand Prix','Country'].forEach(function(h){
      var th=document.createElement('th');
      th.textContent=h;
      th.style.textAlign='left';th.style.padding='10px';th.style.borderBottom='1px solid #eee';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

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
      drawSeasonTable(j);
      showInfo('Saison '+year+' chargée');
    }).catch(function(e){
      console.error(e);
      showError('Erreur: '+e.message);
    });
  }

  function init(){
    showInfo('Chargement de la liste des saisons...');
    // tentative de liste dynamique
    var years=[];
    var currentYear=(new Date()).getFullYear();
    for(var y=1950;y<=currentYear;y++){years.push(y);}
    selEl.innerHTML='';
    years.reverse().forEach(function(y){
      var o=document.createElement('option');
      o.value=y;o.textContent=y;selEl.appendChild(o);
    });
    selEl.onchange=function(){loadSeason(selEl.value);};

    var urlYear=new URL(window.location.href).searchParams.get('year');
    if(urlYear && years.indexOf(Number(urlYear))>=0){
      selEl.value=urlYear;
      loadSeason(urlYear);
    }else{
      selEl.value=years[0];
      loadSeason(years[0]);
    }
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
