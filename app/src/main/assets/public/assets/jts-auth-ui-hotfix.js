// Final auth/UI cleanup for JTS Logistics. Keeps existing functionality unchanged.
(function(){
  function decode(token){
    try{
      const part=(token||'').split('.')[1]; if(!part) return null;
      const base64=part.replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(base64), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    }catch(e){ try { return JSON.parse(atob(((token||'').split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/'))); } catch(_) { return null; } }
  }
  function currentUser(){
    const token=localStorage.getItem('token')||'';
    const u=decode(token);
    if(!u || !u.role || (u.exp && Date.now() >= u.exp*1000)) return null;
    return u;
  }
  function isAuthPage(){ return location.pathname==='/' || /\/index\.html$|\/register\.html$/i.test(location.pathname); }
  function cleanup(){
    const u=currentUser();
    if(document.body){
      document.body.dataset.role = u ? String(u.role||'user').toLowerCase() : 'guest';
      document.body.classList.toggle('jts-auth-page', isAuthPage());
    }
    if(!u){
      document.querySelectorAll('.jts-menu-root,.jts-mobile-menu,.jts-rail,.pe-bottom-nav,.enterprise-dock').forEach(el=>el.remove());
    }
    if(isAuthPage()){
      const cards=document.querySelectorAll('main>div.bg-white, main>div.border');
      cards.forEach(card=>{
        const logos=[...card.querySelectorAll('.jts-auth-logo')];
        logos.forEach((el,i)=>{ if(i>0) el.remove(); });
        if(!card.querySelector('.jts-auth-logo')){
          const logo=document.createElement('div');
          logo.className='jts-auth-logo';
          logo.innerHTML='<img src="/assets/jts-logo.png" alt="JTS Logistics">';
          card.insertBefore(logo, card.firstChild);
        }
      });
    }
  }
  document.addEventListener('DOMContentLoaded', cleanup, {once:true});
  window.addEventListener('load', cleanup);
  window.addEventListener('pageshow', cleanup);
  setTimeout(cleanup, 50);
  setTimeout(cleanup, 300);
  setTimeout(cleanup, 900);
})();
