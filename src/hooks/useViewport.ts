import { useState, useEffect } from 'react';

export interface ViewportInfo {
  width: number;
  height: number;
  isMobile: boolean;
  isPortrait: boolean;
}

export const useViewport = (): ViewportInfo => {
  const [viewport, setViewport] = useState<ViewportInfo>(() => {
    if (typeof window === 'undefined') {
      return { width: 1920, height: 1080, isMobile: false, isPortrait: false };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      width,
      height,
      isMobile: width < 768,
      isPortrait: height > width,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({
        width,
        height,
        isMobile: width < 768,
        isPortrait: height > width,
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return viewport;
};
