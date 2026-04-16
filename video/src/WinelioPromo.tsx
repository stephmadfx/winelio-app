import React from "react";
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  spring, interpolate, Img, staticFile, Audio,
} from "remotion";
import type { Slide } from "./config";

export interface WinelioPromoProps { slides: Slide[] }

const ORANGE = "#FF6B35";
const AMBER  = "#F7931E";
const WHITE  = "#FFFFFF";

// ── Animations helpers ───────────────────────────────────────────────────────
function useFadeIn(start: number, dur = 20) {
  const f = useCurrentFrame();
  return interpolate(f - start, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}
function useSlideUp(start: number) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(
    spring({ frame: f - start, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } }),
    [0, 1], [60, 0]
  );
}

// ── Fond ─────────────────────────────────────────────────────────────────────
const Background: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{
      background: `linear-gradient(${135 + interpolate(f, [0, 1500], [0, 15])}deg,#1a0a00 0%,#2D1505 40%,#1C1C1C 100%)`,
    }} />
  );
};

// ── Particules ────────────────────────────────────────────────────────────────
const Particles: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {[{x:120,y:200,s:4,sp:0.8},{x:1800,y:150,s:6,sp:1.2},{x:300,y:900,s:3,sp:0.6},
        {x:1600,y:800,s:5,sp:1.0},{x:960,y:80,s:4,sp:0.9},{x:200,y:550,s:3,sp:0.7},
        {x:1750,y:500,s:5,sp:1.1}].map((d,i) => (
        <div key={i} style={{
          position:"absolute", left:d.x, top:d.y, width:d.s, height:d.s,
          borderRadius:"50%", background:ORANGE,
          opacity: interpolate(Math.sin(f*d.sp*0.05+i),[-1,1],[0.15,0.55]),
        }}/>
      ))}
    </>
  );
};

// ── Barre de progression ──────────────────────────────────────────────────────
const AccentBar: React.FC<{p:number}> = ({p}) => (
  <div style={{
    position:"absolute", bottom:0, left:0, height:6, width:`${p*100}%`,
    background:`linear-gradient(90deg,${ORANGE},${AMBER})`, borderRadius:"0 3px 3px 0",
  }}/>
);

// ── Fondu entre slides ────────────────────────────────────────────────────────
const Fade: React.FC<{total:number}> = ({total}) => {
  const f = useCurrentFrame();
  return (
    <div style={{
      position:"absolute", inset:0, background:"#111", pointerEvents:"none",
      opacity: interpolate(f,[0,12,total-12,total],[1,0,0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),
    }}/>
  );
};

// ── Slide 1 ───────────────────────────────────────────────────────────────────
const Slide1: React.FC<{texts:string[]; dur:number}> = ({texts, dur}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"0 160px"}}>
      <div style={{textAlign:"center"}}>
        <p style={{margin:0,opacity:useFadeIn(0),transform:`translateY(${useSlideUp(0)}px)`,fontSize:72,fontWeight:300,color:WHITE,letterSpacing:-1,lineHeight:1.2}}>
          {texts[0]}
        </p>
        <p style={{margin:"16px 0 0",opacity:useFadeIn(20),transform:`translateY(${useSlideUp(20)}px)`,fontSize:72,fontWeight:300,color:WHITE,lineHeight:1.2}}>
          {texts[1].replace(" tous les jours.", "")} <span style={{color:ORANGE,fontWeight:700}}>tous les jours.</span>
        </p>
        <p style={{margin:"24px 0 0",opacity:useFadeIn(45),transform:`translateY(${useSlideUp(45)}px)`,fontSize:40,fontWeight:300,color:"rgba(255,255,255,0.55)",letterSpacing:0.5}}>
          {texts[2]}
        </p>
      </div>
      <AccentBar p={interpolate(f,[0,dur],[0,1],{extrapolateRight:"clamp"})}/>
    </AbsoluteFill>
  );
};

// ── Slide 2 ───────────────────────────────────────────────────────────────────
const Slide2: React.FC<{texts:string[]; dur:number}> = ({texts, dur}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"0 160px"}}>
      <div style={{textAlign:"center"}}>
        <p style={{margin:0,opacity:useFadeIn(0),transform:`translateY(${useSlideUp(0)}px)`,fontSize:62,fontWeight:300,color:WHITE,lineHeight:1.3}}>
          {texts[0]}
        </p>
        <p style={{margin:"12px 0",opacity:useFadeIn(30),transform:`translateY(${useSlideUp(30)}px)`,fontSize:80,fontWeight:800,background:`linear-gradient(90deg,${ORANGE},${AMBER})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.1}}>
          {texts[1]}
        </p>
        <p style={{margin:"32px 0 0",opacity:useFadeIn(70),transform:`translateY(${useSlideUp(70)}px)`,fontSize:44,fontWeight:400,color:"rgba(255,255,255,0.7)",lineHeight:1.4}}>
          {texts[2]}
        </p>
      </div>
      <AccentBar p={interpolate(f,[0,dur],[0,1],{extrapolateRight:"clamp"})}/>
    </AbsoluteFill>
  );
};

// ── Slide 3 ───────────────────────────────────────────────────────────────────
const Slide3: React.FC<{texts:string[]; dur:number}> = ({texts, dur}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoScale = spring({frame:f, fps, config:{damping:14,stiffness:100}});
  return (
    <AbsoluteFill style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"0 160px"}}>
      <div style={{marginBottom:48,opacity:useFadeIn(0,15),transform:`scale(${interpolate(logoScale,[0,1],[0.6,1])})`}}>
        <Img src={staticFile("assets/logo-on-dark.png")} style={{height:80,objectFit:"contain"}}/>
      </div>
      <div style={{textAlign:"center"}}>
        <p style={{margin:0,opacity:useFadeIn(25),transform:`translateY(${useSlideUp(25)}px)`,fontSize:52,fontWeight:700,color:WHITE,lineHeight:1.2}}>
          {texts[0]}
        </p>
        <p style={{margin:"8px 0 24px",opacity:useFadeIn(60),transform:`translateY(${useSlideUp(60)}px)`,fontSize:90,fontWeight:900,background:`linear-gradient(90deg,${ORANGE},${AMBER})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>
          {texts[1]}
        </p>
        <p style={{margin:0,opacity:useFadeIn(100),transform:`translateY(${useSlideUp(100)}px)`,fontSize:40,fontWeight:300,color:"rgba(255,255,255,0.65)",lineHeight:1.5}}>
          {texts[2]}
        </p>
      </div>
      <AccentBar p={interpolate(f,[0,dur],[0,1],{extrapolateRight:"clamp"})}/>
    </AbsoluteFill>
  );
};

// ── Slide 4 ───────────────────────────────────────────────────────────────────
const Slide4: React.FC<{texts:string[]; dur:number}> = ({texts, dur}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes = [
    {x:960,y:300,label:"Vous",main:true,delay:20},
    {x:660,y:480,label:"Niveau 1",main:false,delay:50},
    {x:1260,y:480,label:"Niveau 1",main:false,delay:50},
    {x:500,y:660,label:"Niv. 2",main:false,delay:80},
    {x:820,y:660,label:"Niv. 2",main:false,delay:80},
    {x:1100,y:660,label:"Niv. 2",main:false,delay:80},
    {x:1420,y:660,label:"Niv. 2",main:false,delay:80},
  ];
  return (
    <AbsoluteFill style={{display:"flex",flexDirection:"column",justifyContent:"flex-start",alignItems:"center",padding:"80px 160px 0"}}>
      <div style={{textAlign:"center",zIndex:10}}>
        <p style={{margin:0,opacity:useFadeIn(0),transform:`translateY(${useSlideUp(0)}px)`,fontSize:56,fontWeight:700,color:WHITE,lineHeight:1.2}}>{texts[0]}</p>
        <p style={{margin:"16px 0 0",opacity:useFadeIn(30),transform:`translateY(${useSlideUp(30)}px)`,fontSize:44,fontWeight:300,color:"rgba(255,255,255,0.7)",lineHeight:1.4}}>{texts[1]}</p>
        <p style={{margin:"12px 0 0",opacity:useFadeIn(65),transform:`translateY(${useSlideUp(65)}px)`,fontSize:48,fontWeight:700,color:ORANGE}}>{texts[2]}</p>
      </div>
      <div style={{position:"absolute",bottom:0,left:0,right:0,top:260,opacity:interpolate(f,[40,80],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}>
        <svg width="1920" height="820" viewBox="0 0 1920 820">
          {[[960,120,660,300],[960,120,1260,300],[660,300,500,480],[660,300,820,480],[1260,300,1100,480],[1260,300,1420,480]].map(([x1,y1,x2,y2],i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={`rgba(255,107,53,${interpolate(f,[40+i*8,70+i*8],[0,0.45],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})})`}
              strokeWidth={2} strokeDasharray="8 4"/>
          ))}
          {nodes.map((n,i) => {
            const sc = interpolate(spring({frame:f-n.delay,fps,config:{damping:14,stiffness:100}}),[0,1],[0,1]);
            return (
              <g key={i} transform={`translate(${n.x},${n.y}) scale(${sc})`}>
                <circle cx={0} cy={0} r={n.main?52:38}
                  fill={n.main?"url(#grad)":"rgba(255,255,255,0.08)"}
                  stroke={n.main?AMBER:"rgba(255,107,53,0.5)"} strokeWidth={n.main?3:1.5}/>
                <text x={0} y={6} textAnchor="middle" fill={WHITE} fontSize={n.main?20:15} fontWeight={n.main?700:400}>{n.label}</text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={ORANGE}/><stop offset="100%" stopColor={AMBER}/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <AccentBar p={interpolate(f,[0,dur],[0,1],{extrapolateRight:"clamp"})}/>
    </AbsoluteFill>
  );
};

// ── Flèche vers le bas ───────────────────────────────────────────────────────
const DownArrow: React.FC<{bounce:number; opacity:number}> = ({bounce, opacity}) => (
  <div style={{opacity, transform:`translateY(${bounce}px)`}}>
    <svg width="80" height="90" viewBox="0 0 80 90" fill="none">
      {/* Tige */}
      <line x1="40" y1="0" x2="40" y2="55" stroke={ORANGE} strokeWidth="10" strokeLinecap="round"
        style={{filter:"drop-shadow(0 0 12px rgba(255,107,53,0.9))"}}/>
      {/* Tête */}
      <polyline points="10,40 40,78 70,40" stroke={ORANGE} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
        style={{filter:"drop-shadow(0 0 16px rgba(255,107,53,0.9))"}}/>
    </svg>
  </div>
);

// ── Slide 5 ───────────────────────────────────────────────────────────────────
const Slide5: React.FC<{texts:string[]}> = ({texts}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoScale = spring({frame:f,fps,config:{damping:12,stiffness:90}});
  const pulse = interpolate(Math.sin(f*0.12),[-1,1],[1,1.04]);

  // Flèches : apparaissent après frame 80, rebondissent vers le bas
  const arrowOpacity = interpolate(f,[80,110],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const bounce1 = interpolate(Math.sin(f*0.15),[-1,1],[0,20]);
  const bounce2 = interpolate(Math.sin(f*0.15 + 0.8),[-1,1],[0,20]); // léger décalage de phase

  return (
    <AbsoluteFill style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"0 160px"}}>
      <div style={{opacity:useFadeIn(0,12),transform:`scale(${interpolate(logoScale,[0,1],[0.5,1])})`,marginBottom:32}}>
        <Img src={staticFile("assets/logo-on-dark.png")} style={{height:90,objectFit:"contain"}}/>
      </div>
      <div style={{textAlign:"center"}}>
        <p style={{margin:0,opacity:useFadeIn(20),transform:`translateY(${useSlideUp(20)}px)`,fontSize:62,fontWeight:300,color:WHITE,lineHeight:1.3}}>
          {texts[0]}
        </p>
        <p style={{margin:"16px 0 36px",opacity:useFadeIn(50),transform:`translateY(${useSlideUp(50)}px)`,fontSize:52,fontWeight:400,color:"rgba(255,255,255,0.7)",lineHeight:1.3}}>
          {texts[1]}
        </p>
        {/* Deux flèches vers le bas */}
        <div style={{display:"flex",justifyContent:"center",gap:60,marginBottom:28}}>
          <DownArrow bounce={bounce1} opacity={arrowOpacity}/>
          <DownArrow bounce={bounce2} opacity={arrowOpacity}/>
        </div>
        {/* Bouton CTA */}
        <div style={{opacity:useFadeIn(70),transform:`scale(${pulse})`}}>
          <div style={{display:"inline-block",padding:"24px 72px",background:`linear-gradient(135deg,${ORANGE},${AMBER})`,borderRadius:60,fontSize:40,fontWeight:800,color:WHITE,letterSpacing:1,boxShadow:"0 8px 40px rgba(255,107,53,0.45)"}}>
            {texts[2]}
          </div>
        </div>
        <p style={{margin:"32px 0 0",opacity:useFadeIn(70),fontSize:28,color:"rgba(255,255,255,0.4)",letterSpacing:2}}>
          {texts[3]}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ── Composition principale ────────────────────────────────────────────────────
export const WinelioPromo: React.FC<WinelioPromoProps> = ({slides}) => {
  const frames = slides.map(s => s.frames);
  const offsets = frames.reduce<number[]>((acc,_,i) => {
    acc.push(i===0 ? 0 : acc[i-1]+frames[i-1]);
    return acc;
  },[]);

  const SlideComponents = [Slide1, Slide2, Slide3, Slide4] as const;

  return (
    <AbsoluteFill style={{fontFamily:"'Helvetica Neue',Arial,sans-serif",background:"#111"}}>
      <Background/>
      <Particles/>

      {slides.slice(0,4).map((sl,i) => {
        const Comp = SlideComponents[i];
        const audioSrc = staticFile(`assets/audio/slide${i+1}.mp3`);
        return (
          <Sequence key={sl.id} from={offsets[i]} durationInFrames={frames[i]}>
            <Audio src={audioSrc} startFrom={0}/>
            <Comp texts={sl.texts} dur={frames[i]}/>
            <Fade total={frames[i]}/>
          </Sequence>
        );
      })}

      <Sequence from={offsets[4]} durationInFrames={frames[4]}>
        <Audio src={staticFile("assets/audio/slide5.mp3")} startFrom={0}/>
        <Slide5 texts={slides[4].texts}/>
        <Fade total={frames[4]}/>
      </Sequence>
    </AbsoluteFill>
  );
};
