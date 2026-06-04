// JTS Logistics final UI helpers: non-invasive, visual only.
(function(){
  function labelTables(){
    document.querySelectorAll('table').forEach((table)=>{
      const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.children].forEach((td,i)=>{ if(headers[i] && !td.getAttribute('data-label')) td.setAttribute('data-label', headers[i]); });
      });
    });
  }
  function markActiveMenu(){
    const path=location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.jts-menu-list a,a').forEach(a=>{
      const href=(a.getAttribute('href')||'').split('/').pop();
      if(href && href===path) a.classList.add('active');
    });
  }
  function polishSignOut(){
    document.querySelectorAll('button,a').forEach(el=>{
      const t=(el.textContent||'').trim().toLowerCase();
      if(t==='sign out' || t==='logout' || t==='одјави се') el.classList.add('signout');
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{ labelTables(); markActiveMenu(); polishSignOut(); });
  window.addEventListener('load',()=>{ labelTables(); polishSignOut(); });
})();
