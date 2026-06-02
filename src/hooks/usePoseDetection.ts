import { useState, useEffect, useRef, useCallback } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

interface Keypoint {
  x: number;
  y: number;
  score: number;
  name?: string;
}

interface PoseDetectionResult {
  isJumping: boolean;
  moveX: number;
  moveY: number;
  confidence: number;
  videoElement: HTMLVideoElement | null;
  keypoints: Keypoint[];
  noseY: number;
  noseX: number;
}

export const usePoseDetection = () => {
  const [result, setResult] = useState<PoseDetectionResult>({
    isJumping: false,
    moveX: 0,
    moveY: 0,
    confidence: 0,
    videoElement: null,
    keypoints: [],
    noseY: 0,
    noseX: 0,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastYRef = useRef<number>(120);
  const lastXRef = useRef<number>(160);
  const isJumpingRef = useRef<boolean>(false);
  const jumpCooldownRef = useRef<number>(0);

  const detectMovement = useCallback((noseX: number, noseY: number) => {
    const jumpThreshold = 30;
    const moveThreshold = 20;
    const timeSinceLastJump = Date.now() - jumpCooldownRef.current;
    
    const diffY = lastYRef.current - noseY;
    const diffX = noseX - lastXRef.current;

    if (timeSinceLastJump > 600 && diffY > jumpThreshold && !isJumpingRef.current) {
      isJumpingRef.current = true;
      jumpCooldownRef.current = Date.now();
      setResult(prev => ({ 
        ...prev, 
        isJumping: true,
        moveX: Math.abs(diffX) > moveThreshold ? Math.sign(diffX) * Math.min(1, Math.abs(diffX) / 50) : 0,
      }));
      
      setTimeout(() => {
        isJumpingRef.current = false;
        setResult(prev => ({ ...prev, isJumping: false, moveX: 0 }));
      }, 400);
    } else {
      setResult(prev => ({ 
        ...prev, 
        moveX: Math.abs(diffX) > moveThreshold ? Math.sign(diffX) * Math.min(1, Math.abs(diffX) / 50) : 0,
      }));
    }
    
    lastYRef.current = noseY;
    lastXRef.current = noseX;
  }, []);

  useEffect(() => {
    let animationId: number;
    let isInitialized = false;
    
    const init = async () => {
      try {
        await tf.ready();
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 320, 
            height: 240,
            facingMode: 'user'
          } 
        });
        
        if (!videoRef.current) {
          const video = document.createElement('video');
          video.autoplay = true;
          video.playsInline = true;
          video.srcObject = stream;
          videoRef.current = video;
          setResult(prev => ({ ...prev, videoElement: video }));
        }

        await videoRef.current.play();

        // 使用 MediaPipe Pose 替代 MoveNet，避免 CORS 问题
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          {
            runtime: 'tfjs',
            modelType: 'lite',
            enableSmoothing: true
          }
        );
        detectorRef.current = detector;
        isInitialized = true;

        const detect = async () => {
          if (!detectorRef.current || !videoRef.current || !isInitialized) {
            animationId = requestAnimationFrame(detect);
            return;
          }

          try {
            const poses = await detectorRef.current.estimatePoses(videoRef.current);
            
            if (poses.length > 0) {
              const pose = poses[0];
              const nose = pose.keypoints.find(k => k.name === 'nose');
              
              const keypoints = pose.keypoints
                .filter(k => k.score > 0.25)
                .map(k => ({
                  x: k.x,
                  y: k.y,
                  score: k.score || 0,
                  name: k.name
                }));
              
              if (nose && nose.score > 0.25) {
                detectMovement(nose.x, nose.y);
                setResult(prev => ({ 
                  ...prev, 
                  confidence: nose.score,
                  keypoints,
                  noseY: nose.y,
                  noseX: nose.x,
                }));
              } else {
                setResult(prev => ({ 
                  ...prev, 
                  keypoints,
                  confidence: nose?.score || 0,
                }));
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
      isInitialized = false;
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
  }, [detectMovement]);

  return result;
};
