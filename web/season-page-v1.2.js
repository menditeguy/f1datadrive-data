// season-page-v1.2.js — ES5 compatible (grille centrée + années grisées si absentes)
(function(){
  'use strict';

  function qs(sel,root){return (root||document).querySelector(sel);}
  function loadJSON(url){return fetch(url,{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status+' on '+url);
    return r.json();
  });}
  function checkExists(url){
    return fetch(url,{method:'HEAD'}).then(function(r){return r.ok;})
      .catch(function(){return false;});
  }

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
    tbl.style.width='100%';
    tbl.style.borderCollapse='collapse';
    tbl.style.fontSize='14px';
    tbl.style.background='#fff';
    tbl.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';
    tbl.style.borderRadius='12px';
    tbl.style.overflow='hidden';

    var thead=document.createElement('thead');
    thead.style.background='#fafafa';
    var trh=document.createElement('tr');
    ['Round','Grand Prix','Country'].forEach(function(h){
      var th=document.createElement('th');
      th.textContent=h;
      th.style.textAlign='left';
      th.style.padding='10px';
      th.style.borderBottom='1px solid #eee';
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

      function cell(t){var td=document.createElement('td');td.textContent=t;td.style.padding='8px 10px';td.style.borderBottom='1px solid #f3f3f3';return td;}
      tr.appendChild(cell('R'+r.round));
      tr.appendChild(cell(r.circuit||r.name||''));
      tr.appendChild(cell(r.country||''));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    tableBox.appendChild(tbl);
  }

  function loadSeason(year){
    showInfo('Chargement de la saison '+year+' ...');
    var url=BASE+'/seasons/'+year+'/season.json';
    loadJSON(url).then(function(j){
      titleEl.textContent='Résultats de la saison '+year;
      drawSeasonTable(j,year);
      showInfo('Saison '+year+' chargée');
      highlightYear(year,true);
    }).catch(function(e){
      showError('Aucune donnée disponible pour '+year);
      highlightYear(year,false);
      tableBox.innerHTML='';
    });
  }

  function highlightYear(year,active){
    var all=gridEl.querySelectorAll('.yearItem');
    for(var i=0;i<all.length;i++){
      var item=all[i];
      item.style.textDecoration='none';
      item.style.fontWeight='normal';
      if(String(item.textContent)===String(year)){
        item.style.textDecoration='underline';
        item.style.fontWeight='bold';
        item.style.color=active?'#1565c0':'#888';
      }
    }
  }

  function buildYearGrid(){
    gridEl.innerHTML='';
    gridEl.style.display='grid';
    gridEl.style.gridTemplateColumns='repeat(auto-fill, minmax(65px,1fr))';
    gridEl.style.gap='10px';
    gridEl.style.maxWidth='1000px';
    gridEl.style.margin='0 auto 20px';
    gridEl.style.textAlign='center';

    var currentYear=(new Date()).getFullYear();
    for(var y=1950;y<=currentYear+1;y++){
      (function(year){
        var a=document.createElement('a');
        a.textContent=year;
        a.className='yearItem';
        a.href='javascript:void(0)';
        a.style.color='#aaa'; // par défaut grisé
        a.style.textDecoration='none';
        a.style.transition='color 0.2s';
        a.style.fontSize='15px';
        a.style.fontWeight='500';
        a.style.cursor='default';

        var url=BASE+'/seasons/'+year+'/season.json';
        checkExists(url).then(function(exists){
          if(exists){
            a.style.color='#1565c0';
            a.style.cursor='pointer';
            a.onmouseenter=function(){a.style.color='#1e88e5';};
            a.onmouseleave=function(){a.style.color='#1565c0';};
            a.onclick=function(){loadSeason(year);};
          }else{
            a.style.color='#999';
            a.style.pointerEvents='none';
          }
        });

        gridEl.appendChild(a);
      })(y);
    }
  }

  function init(){
    buildYearGrid();
    var urlYear=new URL(window.location.href).searchParams.get('year');
    var startYear=urlYear || (new Date()).getFullYear();
    highlightYear(startYear,false);
    loadSeason(startYear);
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
