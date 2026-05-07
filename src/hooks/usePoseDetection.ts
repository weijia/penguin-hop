import { useState, useEffect, useRef, useCallback } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';

interface PoseDetectionResult {
  isJumping: boolean;
  confidence: number;
  videoElement: HTMLVideoElement | null;
}

export const usePoseDetection = () => {
  const [result, setResult] = useState<PoseDetectionResult>({
    isJumping: false,
    confidence: 0,
    videoElement: null,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastYRef = useRef<number>(0);
  const isJumpingRef = useRef<boolean>(false);
  const jumpCooldownRef = useRef<number>(0);

  const detectJump = useCallback((y: number) => {
    const jumpThreshold = 30;
    const timeSinceLastJump = Date.now() - jumpCooldownRef.current;
    
    if (timeSinceLastJump > 1000) {
      const diff = lastYRef.current - y;
      if (diff > jumpThreshold && !isJumpingRef.current) {
        isJumpingRef.current = true;
        jumpCooldownRef.current = Date.now();
        setResult(prev => ({ ...prev, isJumping: true }));
        
        setTimeout(() => {
          isJumpingRef.current = false;
          setResult(prev => ({ ...prev, isJumping: false }));
        }, 300);
      }
    }
    lastYRef.current = y;
  }, []);

  useEffect(() => {
    let animationId: number;
    
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        if (!videoRef.current) {
          const video = document.createElement('video');
          video.autoplay = true;
          video.playsInline = true;
          video.srcObject = stream;
          videoRef.current = video;
          setResult(prev => ({ ...prev, videoElement: video }));
        } else {
          videoRef.current.srcObject = stream;
        }

        await videoRef.current.play();

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        detectorRef.current = detector;

        const detect = async () => {
          if (!detectorRef.current || !videoRef.current) return;

          try {
            const poses = await detectorRef.current.estimatePoses(videoRef.current);
            
            if (poses.length > 0) {
              const pose = poses[0];
              const nose = pose.keypoints.find(k => k.name === 'nose');
              
              if (nose && nose.score > 0.5) {
                detectJump(nose.y);
                setResult(prev => ({ ...prev, confidence: nose.score }));
              }
            }
          } catch (error) {
            console.error('Pose detection error:', error);
          }

          animationId = requestAnimationFrame(detect);
        };

        detect();
      } catch (error) {
        console.error('Camera access error:', error);
      }
    };

    init();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
    };
  }, [detectJump]);

  return result;
};