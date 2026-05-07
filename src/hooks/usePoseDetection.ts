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
  confidence: number;
  videoElement: HTMLVideoElement | null;
  keypoints: Keypoint[];
  noseY: number;
  lastY: number;
}

export const usePoseDetection = () => {
  const [result, setResult] = useState<PoseDetectionResult>({
    isJumping: false,
    confidence: 0,
    videoElement: null,
    keypoints: [],
    noseY: 0,
    lastY: 0,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastYRef = useRef<number>(0);
  const isJumpingRef = useRef<boolean>(false);
  const jumpCooldownRef = useRef<number>(0);

  const detectJump = useCallback((y: number) => {
    const jumpThreshold = 20;
    const timeSinceLastJump = Date.now() - jumpCooldownRef.current;
    
    if (timeSinceLastJump > 800) {
      const diff = lastYRef.current - y;
      console.log(`Jump detection: diff=${diff.toFixed(1)}, threshold=${jumpThreshold}, lastY=${lastYRef.current.toFixed(1)}, currentY=${y.toFixed(1)}`);
      
      if (diff > jumpThreshold && !isJumpingRef.current) {
        isJumpingRef.current = true;
        jumpCooldownRef.current = Date.now();
        console.log('JUMP DETECTED!');
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
    let isInitialized = false;
    
    const init = async () => {
      try {
        console.log('Initializing TensorFlow.js...');
        await tf.ready();
        
        const backends = tf.getBackend();
        console.log('TensorFlow.js ready, backend:', backends);
        
        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 320, 
            height: 240,
            facingMode: 'user'
          } 
        });
        
        console.log('Camera access granted');
        
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
        console.log('Video started playing');

        console.log('Creating pose detector...');
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        detectorRef.current = detector;
        isInitialized = true;
        console.log('Pose detector initialized');

        const detect = async () => {
          if (!detectorRef.current || !videoRef.current || !isInitialized) return;

          try {
            const poses = await detectorRef.current.estimatePoses(videoRef.current);
            
            if (poses.length > 0) {
              const pose = poses[0];
              const nose = pose.keypoints.find(k => k.name === 'nose');
              
              const keypoints = pose.keypoints
                .filter(k => k.score > 0.3)
                .map(k => ({
                  x: k.x,
                  y: k.y,
                  score: k.score || 0,
                  name: k.name
                }));
              
              if (nose && nose.score > 0.3) {
                detectJump(nose.y);
                setResult(prev => ({ 
                  ...prev, 
                  confidence: nose.score,
                  keypoints,
                  noseY: nose.y,
                  lastY: lastYRef.current,
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
  }, [detectJump]);

  return result;
};
