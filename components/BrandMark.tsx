'use client';

import { useEffect, useRef } from 'react';

// Matching cubic segments let the same outline unfold rather than swap icons.
const heart = 'M16 10 C20 3 28 4 28 11 C28 17 22 22 16 27 C16 27 16 27 16 27 C16 27 16 27 16 27 C10 22 4 17 4 11 C4 4 12 3 16 10 Z';
const envelope = 'M16 3 C20 6 24 9 28 12 C28 17 28 22 28 26 C24 26 20 26 16 26 C12 26 8 26 4 26 C4 22 4 17 4 12 C8 9 12 6 16 3 Z';
const folded = 'M16 27 C16 27 16 27 16 27 C16 27 16 27 16 27 M16 27 C16 27 16 27 16 27 M16 27 C16 27 16 27 16 27';
const open = 'M4 12 C8 15 12 18 16 20 C20 18 24 15 28 12 M4 26 C7 23 10 20 13 18 M19 18 C22 20 25 23 28 26';
const timing = {
  dur: '16s', repeatCount: 'indefinite', keyTimes: '0;0.28;0.46;0.65;0.83;1',
  calcMode: 'spline' as const,
  keySplines: Array(5).fill('0.45 0 0.55 1').join(';'),
};

export default function BrandMark({ animated = false, paused = false, size = 23 }: {
  animated?: boolean; paused?: boolean; size?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!animated) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (paused || preference.matches) svg.current?.pauseAnimations();
      else svg.current?.unpauseAnimations();
    };
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, [animated, paused]);

  return <svg ref={svg} className={`brand-mark${animated ? ' brand-mark-animated' : ''}`}
    width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path className="brand-mark-still" d={heart} />
    {animated && <g className="brand-mark-moving">
      <path d={heart}><animate attributeName="d" values={[heart, heart, envelope, envelope, heart, heart].join(';')} {...timing} /></path>
      <path d={folded} opacity="0">
        <animate attributeName="d" values={[folded, folded, open, open, folded, folded].join(';')} {...timing} />
        <animate attributeName="opacity" values="0;0;1;1;0;0" {...timing} />
      </path>
      <g className="brand-mark-dust">
        {[{x:13,y:11,dx:-2,start:0.47}, {x:17,y:10,dx:1,start:0.49},
          {x:20,y:11,dx:2,start:0.51}, {x:15,y:10,dx:0,start:0.53}].map((particle, index) => {
          const end = particle.start + 0.1;
          return <g key={index} opacity="0">
            <animate attributeName="opacity" dur="16s" repeatCount="indefinite"
              values="0;0;0.65;0;0" keyTimes={`0;${particle.start};${particle.start + 0.02};${end};1`}
              calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
            <animateTransform attributeName="transform" type="translate" dur="16s" repeatCount="indefinite"
              values={`0 0;0 0;${particle.dx} -7;${particle.dx} -7`}
              keyTimes={`0;${particle.start};${end};1`} calcMode="spline"
              keySplines="0.45 0 0.55 1;0.25 0.1 0.4 1;0.45 0 0.55 1" />
            {index === 1
              ? <path d={`M${particle.x} ${particle.y-1.2} Q${particle.x} ${particle.y} ${particle.x+1.2} ${particle.y} Q${particle.x} ${particle.y} ${particle.x} ${particle.y+1.2} Q${particle.x} ${particle.y} ${particle.x-1.2} ${particle.y} Q${particle.x} ${particle.y} ${particle.x} ${particle.y-1.2} Z`} />
              : <circle cx={particle.x} cy={particle.y} r="0.65" />}
          </g>;
        })}
      </g>
    </g>}
    <circle className="brand-mark-accent" cx="29" cy="4" r="2" stroke="none" />
  </svg>;
}
