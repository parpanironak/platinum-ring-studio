(function(root){
  'use strict';
  const INNER=7.8499997901698855,REFERENCE_HALF_WIDTH=1.100000023841858;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=t=>t*t*(3-2*t);
  function profile(kind,angle){
    const c=Math.cos(angle),s=Math.sin(angle);
    if(kind==='soft-square'||kind==='flat'){
      const e=kind==='flat'?.30:.60;
      return [Math.sign(c)*Math.abs(c)**e,Math.sign(s)*Math.abs(s)**e];
    }
    if(kind==='knife')return [c,s>=0?1-Math.abs(c):s];
    return [c,s];
  }
  function prepare(original){
    const samples=[];
    for(let i=0;i<original.length;i+=3){
      // THREE axes: x=source x, y=source z, z=-source y.
      const x=original[i],height=original[i+1],axial=-original[i+2];
      const radius=Math.hypot(x,height),angle=Math.abs(Math.atan2(x,height));
      const shoulder=smooth(clamp(1-(angle-28*Math.PI/180)/(23*Math.PI/180),0,1));
      const center=INNER+.675+.75*shoulder,half=.675-.075*shoulder;
      const u=(axial-2.4)/.85,v=(radius-center)/half,n=Math.hypot(u,v);
      const weight=1-smooth(clamp((height-5.2)/2.1,0,1));
      if(weight>0&&n>.85&&n<1.15&&radius>0)samples.push({i,x,height,axial,radius,center,half,a:Math.atan2(v,u),weight});
    }
    return {original:new Float32Array(original),samples};
  }
  function deform(prepared,settings){
    const out=new Float32Array(prepared.original),hw=settings.width/2,ht=settings.thickness/2;
    for(const p of prepared.samples){
      const [u,v]=profile(settings.profile,p.a);
      const targetRadius=p.center+(ht-.675)+v*(p.half+ht-.675);
      const r=p.radius+(targetRadius-p.radius)*p.weight;
      const axial=p.axial+(2.4+u*hw-p.axial)*p.weight;
      out[p.i]=p.x*r/p.radius;out[p.i+1]=p.height*r/p.radius;out[p.i+2]=-axial;
    }
    return out;
  }
  function axialShift(settings){return REFERENCE_HALF_WIDTH+settings.width/2+settings.gap-2.4;}
  function sectionPath(kind,width,thickness){
    const points=[];const scale=37;
    for(let i=0;i<=160;i++){const [u,v]=profile(kind,i/160*Math.PI*2);points.push(`${i?'L':'M'}${(90+u*width/2*scale).toFixed(2)},${(39-v*thickness/2*scale).toFixed(2)}`);}
    return points.join(' ')+' Z';
  }
  const api={INNER,REFERENCE_HALF_WIDTH,profile,prepare,deform,axialShift,sectionPath};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RingGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
