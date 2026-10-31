import { useEffect, useState } from 'react';
import { isFirstLoad } from '../app/state';

const loadingTips = {
  firstLoad: ['Welcome to SquanGo CSP!!'],
  general: [
    'Happy Learning.',
    'There are 3678 different sliceable positions on a squan.',
    'Square-1 was invented in 1990 by Karel Hršel and Vojtěch Kopský',
    'Square-1 notation was created by Jaap Scherphuis, the creator of sq1optim',
    'Every position on a squan can be solved under 13 slices (12 ignoring the equator) or under 31 face turns!',
    'WR: 4.63 avg — Sameer Aggarwal',
    'WR: 3.40 single — Hassan Khanani.',
    'Back to square one, literally!',
    'Parity monster is hiding under your bed!!',
    '#BanMattsMuffinTracing!!!',
    '#BanMatts5-1Tracing!!!',
    '"Square-1" is short for "Back to Square 1", one of the original names of the puzzle!',
    'The earliest names of Square-1 was "Back to Square 1", and "Cube 21"',
    'Square-1 is one of the OG events of wca, added in 2005 — one year after the creation of wca',
    'The first square-1 average world record was by Lars Vandenbergh of 33.21s at Dutch Open 2004',
    'The first square-1 world record was by Lars Vandenbergh, 41.80s single at World Championship 2003',
    "Mike Masonjones proved in 2005 that God's Number for the Square-1 is 13 in the twist metric (10.615 on average).",
    "In 2017, Chen Shuang calculated the God's Number for the Square-1 to be 31 in face turn metric (25.134 on average)",
    'csTimer was created by Chen Shuang (cs0x7f) in 2016 and stands for Chen Shuang\'s Timer',
    'Square-1 was patented by Karel Hrsel and Vojtech Kopsky on 16 March 1993, US 5,193,809.',
    "Some CSP's even-odd algs are mirrors of each other!",
    'meow :3 — Matt 2026',
    'You can start tracing on either shape if both are 4e4c!',
    'Parity Monster is hiding behind the curtain!!!',
    "Cale's Parity Tracing was invented by Cale Schoon (2014SCHO02), published on May 16, 2017",
    'You can change the tracing position and the even/odd will update automatically!',
    'Click in the middle of a symmetric shape in Parity Tracer to trace from a different angle!',
    'Creating stories will help you remember CSP.',
    'Free Palestine',
    'Find other SquanGo tools at: squan-go.web.app',
  ],
};

function adjustLoadingScreen(): void {
  const width = window.innerWidth;
  const els = ['loadingTitle', 'loadingAuthor', 'loadingTip', 'evaCredit', 'mattCredit'];
  els.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('loading-title--xs', 'loading-title--sm', 'loading-author--xs', 'loading-author--sm', 'loading-tip--xs', 'loading-tip--sm', 'loading-credit--xs', 'loading-credit--sm');
    if (width <= 355) {
      el.classList.add(
        id === 'loadingTitle' ? 'loading-title--xs'
        : id === 'loadingAuthor' ? 'loading-author--xs'
        : id === 'loadingTip' ? 'loading-tip--xs'
        : 'loading-credit--xs',
      );
    } else if (width <= 480) {
      el.classList.add(
        id === 'loadingTitle' ? 'loading-title--sm'
        : id === 'loadingAuthor' ? 'loading-author--sm'
        : id === 'loadingTip' ? 'loading-tip--sm'
        : 'loading-credit--sm',
      );
    }
  });
}

export default function LoadingScreen({ hidden }: { hidden: boolean }): React.ReactNode {
  const [tip] = useState<string>(
    () => loadingTips[isFirstLoad ? 'firstLoad' : 'general'][Math.floor(Math.random() * loadingTips[isFirstLoad ? 'firstLoad' : 'general'].length)],
  );
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    adjustLoadingScreen();
    window.addEventListener('resize', adjustLoadingScreen);
    return () => window.removeEventListener('resize', adjustLoadingScreen);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        let next = prev + Math.random() * 30;
        if (next > 90) next = 90;
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hidden) setProgress(100);
  }, [hidden]);

  if (hidden) return null;

  return (
    <div id="loadingScreen" className="loading-screen">
      <h1 id="loadingTitle" className="loading-title">
        SquanGo CSP
      </h1>
      <p id="loadingAuthor" className="loading-author">
        by Abid & Matt
      </p>
      <div id="loadingTipContainer">
        <p id="loadingTip" className="loading-tip">
          {tip}
        </p>
      </div>
      <div id="loadingBarContainer" className="loading-bar-container">
        <div id="loadingProgress" className="loading-bar-progress" style={{ width: `${progress}%` }} />
      </div>
      <p id="evaCredit" className="loading-credit">
        inspired from hashtagcuber.com/csp/ by Eva Kato
      </p>
      <p id="mattCredit" className="loading-credit loading-credit--matt">
        credit goes to Matt (@this_is_not_matt) for helping me out in this project
      </p>
    </div>
  );
}
