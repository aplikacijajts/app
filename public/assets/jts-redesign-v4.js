(function(){
  const pageMeta={
    '/admin.html':['Admin Console','Approvals, documents and operational control.'],
    '/admin-users.html':['Team & Access','Users, roles and driver assignments.'],
    '/admin-loads.html':['Load Management','Create, assign and monitor loads.'],
    '/dispatcher.html':['Dispatcher Workspace','Loads, documents and driver operations.'],
    '/driver.html':['Driver Portal','Documents, loads and messages.'],
    '/broker.html':['Broker Workspace','Bids, GPS and collaboration.'],
    '/chat.html':['Messages','Real-time secure team communication.'],
    '/notifications.html':['Notification Center','Live alerts, messages and operational updates.'],
    '/gps.html':['GPS Tracking','Fleet location and tracking workspace.'],
    '/live-map.html':['Live Map','Fleet status, map and route overview.'],
    '/command-center.html':['Command Center','Premium operations control center.'],
    '/load-details.html':['Load Details','Status, documents and updates.'],
    '/settings-center.html':['Settings','Workspace configuration and security.'],
    '/onboarding.html':['Setup','Workspace onboarding and configuration.']
  };
  const routes={
    admin:[['/admin.html','Console','grid'],['/admin-users.html','Team','users'],['/admin-loads.html','Loads','truck'],['/chat.html','Messages','chat'],['/notifications.html','Alerts','bell'],['/live-map.html','Map','map']],
    dispatcher:[['/dispatcher.html','Workspace','grid'],['/admin-loads.html','Loads','truck'],['/chat.html','Messages','chat'],['/notifications.html','Alerts','bell'],['/gps.html','GPS','map']],
    driver:[['/driver.html','Portal','grid'],['/load-details.html','Loads','truck'],['/chat.html','Messages','chat'],['/notifications.html','Alerts','bell'],['/gps.html','GPS','map']],
    broker:[['/broker.html','Workspace','grid'],['/admin-loads.html','Loads','truck'],['/chat.html','Messages','chat'],['/notifications.html','Alerts','bell']]
  };
  const icons={
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>',
    menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };
  function ready(fn){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();}
  function user(){try{return window.JTSAuth?.currentUser?.()||JSON.parse(localStorage.getItem('user')||'null')}catch{return null}}
  function isAuthPage(){return /\/index\.html$|\/register\.html$|^\/$/.test(location.pathname)}
  function role(){return (user()?.role||'driver').toLowerCase()}
  function logout(){localStorage.removeItem('token');localStorage.removeItem('user');sessionStorage.clear();location.href='/index.html'}
  function polishText(){
    const map={'Logout':'Sign out','Login':'Sign in','Home':'Dashboard','Approvals & Inbox':'Inbox','Documents Inbox':'Inbox','Create User':'Add User','Approved Users':'Team','Create Load':'New Load','Create BID':'Create Bid','All Loads':'Loads','Dispatcher Panel':'Dispatcher Workspace','Admin Panel':'Admin Console','Broker Portal':'Broker Workspace'};
    document.querySelectorAll('a,button,h1,h2,h3,span,label,option').forEach(el=>{const t=(el.textContent||'').trim(); if(map[t]) el.textContent=map[t];});
    document.querySelectorAll('p,small,.text-xs,.text-sm').forEach(el=>{const t=(el.textContent||'').trim(); if(/e\.g\.|JSON editing|This will be hashed|Allowed:|default$|Use your email and password|Missing docs check/i.test(t)) el.classList.add('jts-hide-copy');});
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i=>{i.placeholder=(i.placeholder||'').replace(/^e\.g\.,?\s*/i,'').replace('John Dispatcher','Full name').replace('Set a password','Password').replace('Amazon / Walmart','Customer').replace('Delivered / signed POD','Note');});
  }
  function tableLabels(){document.querySelectorAll('table').forEach(table=>{const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim()); table.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>td.setAttribute('data-label',heads[i]||'')));});}
  function header(){
    const h=document.querySelector('header'); if(!h)return;
    document.body.classList.toggle('jts-auth-page',isAuthPage());
    if(!isAuthPage()) document.body.classList.add('jts-app-shell');
    const title=h.querySelector('.font-bold, a.font-bold');
    if(title){
      const span=title.querySelector('span:last-child')||title; if(span) span.textContent='JTS Logistics';
    }
    h.querySelectorAll('a[href],button').forEach(el=>{ if(!el.closest('.jts-keep')) el.classList.add('jts-hidden-old-nav'); });
  }
  function pageHead(){
    if(isAuthPage())return; const meta=pageMeta[location.pathname]; if(!meta)return; const main=document.querySelector('main'); if(!main||main.querySelector('.jts-page-head'))return;
    [...main.children].slice(0,3).forEach(el=>{ if(el.matches('h1,.flex,.jts-page-head')) el.classList.add('jts-hide-copy'); });
    const div=document.createElement('div'); div.className='jts-page-head'; div.innerHTML=`<div><div class="jts-page-eyebrow">JTS Logistics</div><h1>${meta[0]}</h1><div class="jts-page-subtitle">${meta[1]}</div></div><div class="jts-page-badge">${new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</div>`; main.insertBefore(div,main.firstElementChild);
  }
  function nav(){
    if(isAuthPage())return; const u=user(); if(!u)return; document.querySelectorAll('.jts-rail,.jts-menu-root').forEach(x=>x.remove()); const items=routes[role()]||routes.driver;
    const rail=document.createElement('aside'); rail.className='jts-rail'; rail.innerHTML='<div class="jts-rail-brand">JTS</div>';
    items.forEach(([href,label,ic])=>{const a=document.createElement('a'); a.href=href; a.className=location.pathname===href?'active':''; a.innerHTML=`${icons[ic]||icons.grid}<span class="tip">${label}</span>`; rail.appendChild(a);});
    const spacer=document.createElement('div'); spacer.className='spacer'; rail.appendChild(spacer); const out=document.createElement('button'); out.type='button'; out.className='jts-rail-logout'; out.innerHTML=`${icons.out}<span class="tip">Sign out</span>`; out.onclick=logout; rail.appendChild(out); document.body.appendChild(rail);
    const root=document.createElement('div'); root.className='jts-menu-root'; root.innerHTML=`<button class="jts-menu-fab" type="button" aria-label="Open menu">${icons.menu}</button><div class="jts-menu-backdrop"></div><nav class="jts-menu-sheet"><div class="jts-menu-title"><strong>Menu</strong><span>${u.role||'user'}</span></div><div class="jts-menu-list"></div><button class="jts-menu-logout" type="button"><span class="jts-menu-icon">${icons.out}</span><span>Sign out</span></button></nav>`;
    const list=root.querySelector('.jts-menu-list'); items.forEach(([href,label,ic])=>{const a=document.createElement('a'); a.href=href; a.className=location.pathname===href?'active':''; a.innerHTML=`<span class="jts-menu-icon">${icons[ic]||icons.grid}</span><span>${label}</span>`; list.appendChild(a);});
    document.body.appendChild(root); const close=()=>root.classList.remove('open'); root.querySelector('.jts-menu-fab').onclick=()=>root.classList.add('open'); root.querySelector('.jts-menu-backdrop').onclick=close; root.querySelectorAll('a').forEach(a=>a.onclick=close); root.querySelector('.jts-menu-logout').onclick=logout;
  }
  function loginEnhance(){
    if(!isAuthPage())return; const box=document.querySelector('main>div.bg-white, main>div.border'); if(!box)return; const logo=document.createElement('div'); logo.className='jts-auth-logo'; logo.innerHTML='<img src="/assets/jts-logo.png" alt="JTS" style="height:46px;margin-bottom:18px">'; box.insertBefore(logo,box.firstChild);
  }
  function run(){polishText();tableLabels();header();pageHead();nav();loginEnhance();}
  ready(()=>{run(); setTimeout(run,250); setTimeout(tableLabels,900);});
})();
