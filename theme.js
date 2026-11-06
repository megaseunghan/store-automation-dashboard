// Runs before stylesheets so the saved application theme is present at first paint.
(() => {
  const root=document.documentElement,key='dashboard-theme';
  let theme='light';
  try {theme=localStorage.getItem(key)==='dark'?'dark':'light';} catch {theme='light';}
  root.dataset.surface='glass';root.dataset.theme=theme;
  function label(button){button.textContent=theme==='dark'?'라이트 모드':'다크 모드';button.setAttribute('aria-pressed',String(theme==='dark'));}
  function init(){
    const button=document.getElementById('appThemeToggle');if(!button)return;
    label(button);
    button.addEventListener('click',()=>{
      const next=theme==='dark'?'light':'dark';
      try {localStorage.setItem(key,next);theme=next;} catch {theme='light';}
      root.dataset.theme=theme;label(button);
      document.dispatchEvent(new CustomEvent('app-theme-change',{detail:{theme}}));
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
