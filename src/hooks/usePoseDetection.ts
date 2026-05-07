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
  isMovingLeft: boolean;
  isMovingRight: boolean;
  confidence: number;
  videoElement: HTMLVideoElement | null;
  keypoints: Keypoint[];
  noseY: number;
  lastY: number;
}

export const usePoseDetection = () => {
  const [result, setResult] = useState<PoseDetectionResult>({
    isJumping: false,
    isMovingLeft: false,
    isMovingRight: false,
    confidence: 0,
    videoElement: null,
    keypoints: [],
    noseY: 0,
    lastY: 0,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastYRef = useRef<number>(0);
  const lastXRef = useRef<number>(0);
  const isJumpingRef = useRef<boolean>(false);
  const jumpCooldownRef = useRef<number>(0);

  const detectJump = useCallback((y: number) => {
    const jumpThreshold = 25;
    const timeSinceLastJump = Date.now() - jumpCooldownRef.current;
    
    if (timeSinceLastJump > 600) {
      const diff = lastYRef.current - y;
      
      if (diff > jumpThreshold && !isJumpingRef.current) {
        isJumpingRef.current = true;
        jumpCooldownRef.current = Date.now();
        setResult(prev => ({ ...prev, isJumping: true }));
        
        setTimeout(() => {
          isJumpingRef.current = false;
          setResult(prev => ({ ...prev, isJumping: false }));
        }, 400);
      }
    }
    lastYRef.current = y;
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

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
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
              const leftShoulder = pose.keypoints.find(k => k.name === 'left_shoulder');
              const rightShoulder = pose.keypoints.find(k => k.name === 'right_shoulder');
              
              const keypoints = pose.keypoints
                .filter(k => k.score > 0.25)
                .map(k => ({
                  x: k.x,
                  y: k.y,
                  score: k.score || 0,
                  name: k.name
                }));
              
              let isMovingLeft = false;
              let isMovingRight = false;
              
              if (leftShoulder && rightShoulder && 
                  leftShoulder.score > 0.3 && rightShoulder.score > 0.3) {
                const shoulderDiff = rightShoulder.x - leftShoulder.x;
                const lastShoulderDiff = lastXRef.current !== 0 ? lastYRef.current : shoulderDiff;
                
                if (Math.abs(shoulderDiff - lastShoulderDiff) > 30) {
                  if (shoulderDiff < lastShoulderDiff) {
                    isMovingLeft = true;
                  } else {
                    isMovingRight = true;
                  }
                }
                lastXRef.current = shoulderDiff;
              }
              
              if (nose && nose.score > 0.25) {
                detectJump(nose.y);
                setResult(prev => ({ 
                  ...prev, 
                  confidence: nose.score,
                  keypoints,
                  noseY: nose.y,
                  lastY: lastYRef.current,
                  isMovingLeft,
                  isMovingRight,
                }));
              } else {
                setResult(prev => ({ 
                  ...prev, 
                  keypoints,
                  confidence: nose?.score || 0,
                  isMovingLeft,
                  isMovingRight,
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
  }, [detectJump]);

  return result;
};
