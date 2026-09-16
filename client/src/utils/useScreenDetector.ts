import { useState, useEffect } from 'react';

export interface ScreenInfo {
  width: number;
  height: number;
  device: 'mobile' | 'tablet' | 'desktop';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmallMobile: boolean;
  isIpad: boolean;
  orientation: 'portrait' | 'landscape';
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function getScreenInfo(): ScreenInfo {
  if (typeof window === 'undefined') {
    return {
      width: 1200,
      height: 800,
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isSmallMobile: false,
      isIpad: false,
      orientation: 'landscape',
      breakpoint: 'xl'
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = width < 768;
  const isTablet = width >= 768 && width <= 1024;
  const isDesktop = width > 1024;
  const isSmallMobile = width <= 420;
  const isIpad = (width >= 768 && width <= 1024) || (/iPad|Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document);
  const orientation = width > height ? 'landscape' : 'portrait';

  let breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xl';
  if (width < 420) breakpoint = 'xs';
  else if (width < 768) breakpoint = 'sm';
  else if (width <= 1024) breakpoint = 'md';
  else if (width <= 1280) breakpoint = 'lg';
  else breakpoint = 'xl';

  const device = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  return {
    width,
    height,
    device,
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isIpad,
    orientation,
    breakpoint
  };
}

/**
 * useScreenDetector - Automatically detects and provides live screen size,
 * device type, orientation, and sets HTML attributes and CSS variables.
 */
export function useScreenDetector(): ScreenInfo {
  const [screen, setScreen] = useState<ScreenInfo>(getScreenInfo);

  useEffect(() => {
    const update = () => {
      const info = getScreenInfo();
      setScreen(info);

      // Automatically sync HTML data attributes for responsive CSS hooks
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-device', info.device);
        document.documentElement.setAttribute('data-breakpoint', info.breakpoint);
        document.documentElement.setAttribute('data-orientation', info.orientation);
        document.documentElement.style.setProperty('--screen-width', `${info.width}px`);
        document.documentElement.style.setProperty('--screen-height', `${info.height}px`);
      }
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return screen;
}
