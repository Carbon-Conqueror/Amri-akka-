
  window.addEventListener("scroll",()=>{document.getElementById("navbar").classList.toggle("scrolled",window.scrollY>40)});
  const floatingDonateEl=document.getElementById("floatingDonate");
  const donateSectionEl=document.getElementById("donate");
  const heroSectionEl=document.getElementById("hero");
  function updateFloatingDonate(){
    const pastHero=window.scrollY>heroSectionEl.offsetHeight*0.6;
    const donateRect=donateSectionEl.getBoundingClientRect();
    const overDonateSection=donateRect.top<window.innerHeight*0.7&&donateRect.bottom>0;
    floatingDonateEl.classList.toggle("show",pastHero&&!overDonateSection);
  }
  window.addEventListener("scroll",updateFloatingDonate,{passive:true});
  updateFloatingDonate();
  const hamburgerBtn=document.getElementById("hamburger");
  const mobileMenuEl=document.getElementById("mobileMenu");
  function setMobileMenu(open){
    mobileMenuEl.classList.toggle("open",open);
    hamburgerBtn.setAttribute("aria-expanded",String(open));
    hamburgerBtn.setAttribute("aria-label",open?"Close menu":"Open menu");
    document.body.classList.toggle("no-scroll",open);
  }
  hamburgerBtn.addEventListener("click",()=>{setMobileMenu(!mobileMenuEl.classList.contains("open"))});
  document.addEventListener("keydown",(e)=>{if(e.key==="Escape")setMobileMenu(false)});
  document.addEventListener("click",(e)=>{if(mobileMenuEl.classList.contains("open")&&!mobileMenuEl.contains(e.target)&&!hamburgerBtn.contains(e.target))setMobileMenu(false)});
  mobileMenuEl.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>setMobileMenu(false)));
  const obs=new IntersectionObserver((entries)=>{entries.forEach((e,i)=>{if(e.isIntersecting){setTimeout(()=>e.target.classList.add("visible"),i*80);obs.unobserve(e.target)}})},{threshold:0.08});
  document.querySelectorAll(".reveal").forEach(el=>obs.observe(el));
  function showToast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500)}
  function handleVolunteer(){const f=document.getElementById("volFirst").value.trim(),e=document.getElementById("volEmail").value.trim(),p=document.getElementById("volPhone").value.trim();if(!f){showToast("⚠️ Please enter your first name");return}if(!e){showToast("⚠️ Please enter your email");return}if(!p){showToast("⚠️ Please enter your phone number");return}showToast("🎉 Application submitted! We will reach out within 48 hours.");["volFirst","volLast","volEmail","volPhone","volCity","volMsg"].forEach(id=>document.getElementById(id).value="")}
  function handleContact(){const n=document.getElementById("cName").value.trim(),e=document.getElementById("cEmail").value.trim(),m=document.getElementById("cMsg").value.trim();if(!n){showToast("⚠️ Please enter your name");return}if(!e){showToast("⚠️ Please enter your email");return}if(!m){showToast("⚠️ Please write a message");return}showToast("✅ Message sent! We will get back to you soon.");["cName","cEmail","cSubject","cMsg"].forEach(id=>document.getElementById(id).value="")}
  document.querySelector(".vol-submit").addEventListener("click",handleVolunteer);
  document.querySelector(".contact-submit").addEventListener("click",handleContact);
