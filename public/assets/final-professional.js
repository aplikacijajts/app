// JTS Logistics final premium UI. Visual-only improvements; protected navigation stays enforced by role-ui.js.
(function(){
  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }

  const pageInfo = {
    '/admin.html':['Inbox','Approvals and documents'],
    '/admin-users.html':['Users','Team and access'],
    '/admin-loads.html':['Loads','Create, assign and monitor'],
    '/dispatcher.html':['Dispatch Board','Loads, documents and broker bids'],
    '/driver.html':['Driver Workspace','Documents, assigned loads and updates'],
    '/broker.html':['Broker Workspace','Driver bids and active opportunities'],
    '/gps.html':['GPS Tracking','Fleet tracking and location overview'],
    '/load-details.html':['Load Details','Documents, status and history'],
    '/command-center.html':['Dashboard','Operations overview'],
    '/live-map.html':['Fleet Map','Locations and routes'],
    '/settings-center.html':['Admin','System configuration'],
    '/onboarding.html':['Setup','Launch checklist']
  };

  const replacements = new Map([
    ['JTS Logistics Portal','JTS Logistics'],['Home','Dashboard'],['Logout','Sign out'],['Approvals & Inbox','Approvals'],
    ['Documents Inbox','Documents'],['Pending Account Approvals','Account Approvals'],['Create User','Add User'],['New User','Add User'],
    ['Approved Users','Team'],['All Loads','Loads'],['Create Load','New Load'],['Data Management','Data Controls'],['GPS / Tracking','GPS Tracking'],
    ['Create BID','Create Bid'],['My Recent Bids','Recent Bids'],['Submit Request','Submit'],['Create an account','Create Account'],['Go to Website www.jtslogistics.net','Visit Website'],
    ['Done','Active'],['Ready','Active']
  ]);

  const removePatterns = [
    /no JSON editing/i,/This will be hashed/i,/Only approved drivers appear/i,/Allowed: PDF/i,/Required: POD/i,/read-only/i,
    /Professional workspace for/i,/Opens the configured/i,/Your account will be reviewed/i,/Use your email/i,/System management/i,
    /Review, approve/i,/Submit a bid/i,/View and delete/i,/Track your uploads/i,/Closed loads/i,/Prepare the workspace/i,
    /Company profile, users/i,/Vehicle markers/i,/Operations command center/i,/Premium control center/i,/Smart data views/i,
    /Fast operation buttons/i,/Optimized for mobile/i,/default/i,/e\.g\./i,/will be hashed/i,/stored in users\.json/i
  ];

  function textClean(){
    document.querySelectorAll('h1,h2,h3,a,button,label,p,small,span,option,th').forEach(el=>{
      if(el.children.length && !['A','BUTTON','LABEL','TH'].includes(el.tagName)) return;
      const t=(el.textContent||'').trim();
      if(replacements.has(t)) el.textContent=replacements.get(t);
    });
    document.querySelectorAll('p,.text-xs,.text-sm,small').forEach(el=>{
      const t=(el.textContent||'').trim();
      if(removePatterns.some(r=>r.test(t))) el.classList.add('jts-final-hidden');
    });
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(input=>{
      input.placeholder = input.placeholder
        .replace(/^e\.g\.,?\s*/i,'')
        .replace('you@company.com','email@jtslogistics.com')
        .replace('John Doe','Full name')
        .replace('John Dispatcher','Full name')
        .replace('Create a password','Password')
        .replace('Set a password','Password')
        .replace('default','jts-logistics')
        .replace('Ask about operations...','Ask JTS Assistant');
    });
  }

  function pageHead(){
    const path=location.pathname.endsWith('/')?'/':location.pathname;
    const info=pageInfo[path];
    if(!info) return;
    const main=document.querySelector('main.max-w-6xl,main.max-w-5xl,.enterprise-shell');
    if(!main || main.querySelector('.jts-page-head')) return;
    const existingH1=main.querySelector(':scope > div h1, :scope > h1');
    if(existingH1) existingH1.closest('.flex')?.classList.add('jts-final-hidden');
    const head=document.createElement('div');
    head.className='jts-page-head';
    head.innerHTML='<div><div class="jts-page-eyebrow">JTS Logistics</div><h1>'+info[0]+'</h1><div class="jts-page-subtitle">'+info[1]+'</div></div><div class="jts-page-badge">'+new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+'</div>';
    main.insertBefore(head, main.firstElementChild);
  }

  function activeNav(){
    const path=location.pathname;
    document.querySelectorAll('header a[href],.jts-mobile-sheet a[href]').forEach(a=>{
      try{ const url=new URL(a.getAttribute('href'),location.origin); if(url.pathname===path) a.setAttribute('aria-current','page'); }catch{}
    });
  }

  function navItemsForUser(){
    const user=window.JTSAuth && window.JTSAuth.currentUser ? window.JTSAuth.currentUser() : null;
    if(!user) return [];
    const role=String(user.role||'').toLowerCase();
    const items=[];
    items.push(['/home.html','Dashboard','⌂']);
    if(role==='admin') {
      items.push(['/admin.html','Inbox','✉']);
      items.push(['/admin-loads.html','Loads','▦']);
      items.push(['/admin-users.html','Users','◉']);
    }
    if(role==='dispatcher') {
      items.push(['/dispatcher.html','Loads','▦']);
      items.push(['/admin.html','Inbox','✉']);
      items.push(['/gps.html','GPS','⌖']);
      items.push(['/live-map.html','Map','◎']);
    }
    if(role==='driver') {
      items.push(['/driver.html','Loads','▦']);
      items.push(['/gps.html','GPS','⌖']);
      items.push(['/live-map.html','Map','◎']);
    }
    if(role==='broker') {
      items.push(['/broker.html','Bids','◈']);
      items.push(['/load-details.html','Loads','▦']);
    }
    return items;
  }

  function buildMobileMenu(){
    document.querySelectorAll('.pe-bottom-nav,.enterprise-dock,.jts-mobile-menu').forEach(x=>x.remove());
    const user=window.JTSAuth && window.JTSAuth.currentUser ? window.JTSAuth.currentUser() : null;
    if(!user) return;
    document.body.classList.add('jts-clean-protected');
    const items=navItemsForUser();
    if(!items.length) return;
    const wrap=document.createElement('div');
    wrap.className='jts-mobile-menu';
    wrap.innerHTML='<button type="button" class="jts-menu-fab" aria-label="Open navigation"><span></span><span></span><span></span></button><div class="jts-menu-backdrop"></div><nav class="jts-mobile-sheet" aria-label="Mobile navigation"><div class="jts-sheet-handle"></div><div class="jts-sheet-title"><strong>Menu</strong><small>'+String(user.role||'').toUpperCase()+'</small></div><div class="jts-sheet-links"></div><button type="button" class="jts-sheet-logout">Sign out</button><button type="button" class="jts-sheet-close">Close</button></nav>';
    const links=wrap.querySelector('.jts-sheet-links');
    items.forEach(([href,label,icon])=>{
      const a=document.createElement('a'); a.href=href; a.innerHTML='<span class="jts-sheet-icon">'+icon+'</span><span>'+label+'</span>';
      if(location.pathname===href) a.classList.add('active');
      links.appendChild(a);
    });
    document.body.appendChild(wrap);
    const open=()=>wrap.classList.add('open');
    const close=()=>wrap.classList.remove('open');
    wrap.querySelector('.jts-menu-fab').addEventListener('click',open);
    wrap.querySelector('.jts-menu-backdrop').addEventListener('click',close);
    wrap.querySelector('.jts-sheet-close').addEventListener('click',close);
    wrap.querySelector('.jts-sheet-logout').addEventListener('click',function(){ try{ localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); }catch(e){} location.href='/index.html'; });
    wrap.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  }

  function loginPolish(){
    if(!/index\.html|register\.html/.test(location.pathname)) return;
    document.querySelector('main.max-w-md')?.classList.add('jts-auth-screen');
    const h1=document.querySelector('h1'); if(h1 && /login/i.test(h1.textContent)) h1.textContent='Welcome Back';
    const reg=document.querySelector('h1'); if(reg && /driver registration/i.test(reg.textContent)) reg.textContent='Create Account';
  }

  function formLayout(){
    document.querySelectorAll('section.bg-white').forEach(section=>{
      const fields=section.querySelectorAll('input,select,textarea');
      if(fields.length>=6) section.classList.add('jts-large-form');
    });
  }

  function cleanDemoBlocks(){
    document.querySelectorAll('.jts-final-kpis,.pe-dashboard-grid').forEach(x=>x.remove());
    document.querySelectorAll('.enterprise-dock').forEach(x=>x.remove());
  }

  ready(function(){
    cleanDemoBlocks(); textClean(); pageHead(); activeNav(); loginPolish(); formLayout(); buildMobileMenu();
    setTimeout(function(){ cleanDemoBlocks(); textClean(); buildMobileMenu(); activeNav(); },150);
    setTimeout(function(){ cleanDemoBlocks(); textClean(); buildMobileMenu(); },900);
  });
})();
