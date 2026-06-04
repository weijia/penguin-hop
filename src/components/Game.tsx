import { useState, useEffect, useCallback, useRef } from 'react';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useViewport } from '../hooks/useViewport';

interface MovingObject {
  id: number;
  type: 'hole' | 'fish';
  lane: number;
  progress: number;
  caught?: boolean;
}

interface GameState {
  score: number;
  fishCollected: number;
  isGameOver: boolean;
  isPlaying: boolean;
  penguinPosition: number;
  isJumping: boolean;
  objects: MovingObject[];
  difficulty: number;
}

const BASE_PENGUIN_Y = 88;
const VANISHING_POINT_Y = 15; // 消失点在屏幕上方远处
const ICE_ZONE_TOP = 15;
const ICE_ZONE_BOTTOM = 88;

const MOBILE_BASE_PENGUIN_Y = 82;
const MOBILE_VANISHING_POINT_Y = 10; // 移动端消失点在屏幕上方
const MOBILE_ICE_ZONE_TOP = 10;
const MOBILE_ICE_ZONE_BOTTOM = 82;

export const Game = () => {
  const { 
    isJumping: detectedJump, 
    moveX,
    videoElement, 
    keypoints, 
    confidence,
    noseX,
  } = usePoseDetection();

  const { isMobile, isPortrait } = useViewport();

  const basePenguinY = isMobile ? MOBILE_BASE_PENGUIN_Y : BASE_PENGUIN_Y;
  const vanishingPointY = isMobile ? MOBILE_VANISHING_POINT_Y : VANISHING_POINT_Y;
  const iceZoneTop = isMobile ? MOBILE_ICE_ZONE_TOP : ICE_ZONE_TOP;
  const iceZoneBottom = isMobile ? MOBILE_ICE_ZONE_BOTTOM : ICE_ZONE_BOTTOM;
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    fishCollected: 0,
    isGameOver: false,
    isPlaying: false,
    penguinPosition: 0.5,
    isJumping: false,
    objects: [],
    difficulty: 1,
  });

  const animationFrameRef = useRef<number>();
  const lastSpawnTimeRef = useRef(0);
  const jumpTimeoutRef = useRef<number>();
  const objectIdRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVideoSrcRef = useRef<string>('');

  useEffect(() => {
    let animationId: number;
    let lastDrawTime = 0;
    
    const drawKeypoints = (timestamp: number) => {
      if (!canvasRef.current || !videoElement) {
        animationId = requestAnimationFrame(drawKeypoints);
        return;
      }
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const videoSrc = videoElement.srcObject as MediaStream;
      const shouldRedraw = timestamp - lastDrawTime > 100;

      if (shouldRedraw) {
        lastDrawTime = timestamp;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        try {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } catch (e) {
          animationId = requestAnimationFrame(drawKeypoints);
          return;
        }

        if (keypoints.length > 0 && videoElement.videoWidth > 0) {
          ctx.strokeStyle = '#00ff00';
          ctx.fillStyle = '#00ff00';
          ctx.lineWidth = 2;

          const scaleX = canvas.width / videoElement.videoWidth;
          const scaleY = canvas.height / videoElement.videoHeight;

          keypoints.forEach(point => {
            const mirroredX = canvas.width - (point.x * scaleX);
            const y = point.y * scaleY;
            
            ctx.beginPath();
            ctx.arc(mirroredX, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            
            if (point.name) {
              ctx.font = '10px Arial';
              ctx.fillText(point.name!, mirroredX + 6, y - 6);
            }
          });
        }
      }

      animationId = requestAnimationFrame(drawKeypoints);
    };

    animationId = requestAnimationFrame(drawKeypoints);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [videoElement, keypoints]);

  const getLaneX = (lane: number, progress: number) => {
    const vanishingPointX = 50;
    const laneEndX = 20 + lane * 15;
    
    // 线性透视：从消失点到终点的直线
    // 使用非线性进度使移动更自然（近处移动更快）
    const t = 1 - Math.sqrt(1 - progress);
    const x = vanishingPointX + (laneEndX - vanishingPointX) * t;
    
    return Math.max(5, Math.min(95, x));
  };

  const getObjectY = (progress: number) => {
    const startY = vanishingPointY;
    const endY = basePenguinY;
    return startY + (endY - startY) * progress;
  };

  const getObjectScale = (progress: number) => {
    return 0.2 + progress * 0.8;
  };

  const handleJump = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver || gameState.isJumping) return;
    
    setGameState(prev => ({ ...prev, isJumping: true }));
    
    if (jumpTimeoutRef.current) {
      clearTimeout(jumpTimeoutRef.current);
    }
    jumpTimeoutRef.current = window.setTimeout(() => {
      setGameState(prev => ({ ...prev, isJumping: false }));
    }, 500);
  }, [gameState.isPlaying, gameState.isGameOver, gameState.isJumping]);

  const handleMoveLeft = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;
    setGameState(prev => ({ 
      ...prev, 
      penguinPosition: Math.max(0.2, prev.penguinPosition - 0.15) 
    }));
  }, [gameState.isPlaying, gameState.isGameOver]);

  const handleMoveRight = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;
    setGameState(prev => ({ 
      ...prev, 
      penguinPosition: Math.min(0.8, prev.penguinPosition + 0.15) 
    }));
  }, [gameState.isPlaying, gameState.isGameOver]);

  useEffect(() => {
    if (detectedJump) {
      handleJump();
    }
  }, [detectedJump, handleJump]);

  useEffect(() => {
    if (moveX !== 0 && gameState.isPlaying) {
      if (moveX < 0) {
        handleMoveLeft();
      } else {
        handleMoveRight();
      }
    }
  }, [moveX, gameState.isPlaying, handleMoveLeft, handleMoveRight]);

  useEffect(() => {
    if (noseX > 0 && gameState.isPlaying) {
      const normalizedX = 1 - (noseX / 320);
      const clampedX = Math.max(0.05, Math.min(0.95, 0.05 + normalizedX * 0.9));
      setGameState(prev => ({ ...prev, penguinPosition: clampedX }));
    }
  }, [noseX, gameState.isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!gameState.isPlaying || gameState.isGameOver) {
          startGame();
        } else {
          handleJump();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleMoveLeft();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleMoveRight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.isPlaying, gameState.isGameOver, handleJump, handleMoveLeft, handleMoveRight]);

  const startGame = () => {
    objectIdRef.current = 0;
    lastSpawnTimeRef.current = Date.now();
    setGameState({
      score: 0,
      fishCollected: 0,
      isGameOver: false,
      isPlaying: true,
      penguinPosition: 0.5,
      isJumping: false,
      objects: [],
      difficulty: 1,
    });
  };

  useEffect(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;

    let lastTime = Date.now();

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      setGameState(prev => {
        if (!prev.isPlaying || prev.isGameOver) return prev;

        const spawnInterval = Math.max(1000, 2000 - prev.difficulty * 100);
        const newObjects = [...prev.objects];

        if (now - lastSpawnTimeRef.current > spawnInterval) {
          const lane = Math.floor(Math.random() * 5);
          const type = Math.random() > 0.3 ? 'hole' : 'fish';
          newObjects.push({
            id: objectIdRef.current++,
            type,
            lane,
            progress: 0,
            caught: false,
          });
          lastSpawnTimeRef.current = now;
        }

        const moveSpeed = 0.04 * prev.difficulty * deltaTime;
        let collision = false;
        let fishCaught = 0;

        const updatedObjects = newObjects
          .map(obj => ({ ...obj, progress: obj.progress + moveSpeed }))
          .filter(obj => {
            if (obj.progress >= 1) {
              if (obj.progress >= 1.1) {
                return false;
              }

              const penguinPos = prev.penguinPosition;
              const objLanePos = 0.2 + (obj.lane / 4) * 0.6;
              const isNearPenguin = Math.abs(objLanePos - penguinPos) < 0.15;

              if (obj.type === 'fish' && isNearPenguin && prev.isJumping) {
                fishCaught++;
                return false;
              }

              if (obj.type === 'hole' && isNearPenguin && !prev.isJumping) {
                collision = true;
                return false;
              }

              return false;
            }
            return true;
          });

        if (collision) {
          return {
            ...prev,
            isGameOver: true,
            isPlaying: false,
            objects: updatedObjects,
          };
        }

        const newScore = prev.score + 1;
        const newFishCollected = prev.fishCollected + fishCaught;
        const newDifficulty = Math.min(10, 1 + Math.floor(newScore / 10) * 0.5);

        return {
          ...prev,
          objects: updatedObjects,
          score: newScore,
          fishCollected: newFishCollected,
          difficulty: newDifficulty,
        };
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState.isPlaying, gameState.isGameOver]);

  useEffect(() => {
    return () => {
      if (jumpTimeoutRef.current) {
        clearTimeout(jumpTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="game-container" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
      <div className="score-display" style={{ top: 20, right: 20, left: 'auto' }}>
        <div>分数: {gameState.score}</div>
        <div>🐟 鱼: {gameState.fishCollected}</div>
      </div>
      
      <div className="instruction" style={{ top: 100, right: 20, left: 'auto', textAlign: 'right' }}>
        <div>🎮 躲避冰窟，吃小鱼！</div>
        <div>← → 移动 | 空格/上 跳跃</div>
        <div>摄像头跳跃检测</div>
      </div>

      <div className="camera-container" style={{
        bottom: isMobile ? 80 : 20,
        left: 20,
        top: 'auto',
        width: isMobile ? 110 : 200,
        height: isMobile ? 80 : 150,
      }}>
        <canvas 
          ref={canvasRef}
          width={320}
          height={240}
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            pointerEvents: 'none',
            zIndex: 2,
          }} 
        />
        {videoElement && (
          <video 
            ref={el => { 
              if (el && videoElement) {
                el.srcObject = videoElement.srcObject;
              }
            }} 
            autoPlay 
            playsInline 
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{
          position: 'absolute',
          bottom: '5px',
          left: '5px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          fontSize: '10px',
          padding: '3px',
          borderRadius: '3px',
          zIndex: 3,
        }}>
          置信度: {(confidence * 100).toFixed(0)}%
        </div>
      </div>

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        perspective: '500px',
      }}>
        <div style={{
          position: 'absolute',
          top: `${vanishingPointY}%`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 4,
          height: 4,
          background: '#fff',
          borderRadius: '50%',
          boxShadow: '0 0 20px #fff',
        }} />

        <svg style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}>
          {[...Array(5)].map((_, lane) => {
            const laneEndX = 20 + lane * 15;
            const vanishingPointX = 50;
            
            return (
              <line
                key={`grid-${lane}`}
                x1={`${vanishingPointX}%`}
                y1={`${vanishingPointY}%`}
                x2={`${laneEndX}%`}
                y2={`${iceZoneBottom}%`}
                stroke="rgba(150,200,255,0.5)"
                strokeWidth="2"
              />
            );
          })}
          
          {/* 横线 - 增加透视感 */}
          {[0.25, 0.5, 0.75].map((t, i) => {
            const y = vanishingPointY + (iceZoneBottom - vanishingPointY) * t;
            const leftX = getLaneX(0, t);
            const rightX = getLaneX(4, t);
            
            return (
              <line
                key={`h-grid-${i}`}
                x1={`${leftX}%`}
                y1={`${y}%`}
                x2={`${rightX}%`}
                y2={`${y}%`}
                stroke="rgba(150,200,255,0.3)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {gameState.objects.map(obj => {
          const x = getLaneX(obj.lane, obj.progress);
          const y = getObjectY(obj.progress);
          const scale = getObjectScale(obj.progress);
          const size = obj.type === 'hole' ? (isMobile ? 140 : 200) : (isMobile ? 36 : 50);

          return (
            <div
              key={obj.id}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                width: size,
                height: size,
                transition: 'transform 0.05s linear',
              }}
            >
              {obj.type === 'hole' ? (
                <div style={{
                  width: '100%',
                  height: '30%',
                  background: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a1a 100%)',
                  borderRadius: '5px 5px 50% 50%',
                  boxShadow: '0 0 15px rgba(0,0,0,0.9), inset 0 -5px 20px rgba(0,0,50,0.8)',
                  border: '3px solid rgba(100,150,200,0.4)',
                  borderTop: '2px solid rgba(150,200,255,0.2)',
                  clipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
                }} />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '30px',
                  animation: 'fishBounce 0.3s ease-in-out infinite',
                }}>
                  🐟
                </div>
              )}
            </div>
          );
        })}

        <div style={{
          position: 'absolute',
          top: `${basePenguinY + 5}%`,
          left: 0,
          width: '100%',
          height: '20%',
          background: 'linear-gradient(180deg, rgba(100,150,200,0.3) 0%, rgba(100,150,200,0.8) 100%)',
          borderTop: '3px solid rgba(150,200,255,0.5)',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 19%,
                rgba(255,255,255,0.1) 19%,
                rgba(255,255,255,0.1) 20%
              )
            `,
          }} />
        </div>

        <div
          style={{
            position: 'absolute',
            left: `${gameState.penguinPosition * 100}%`,
            top: `${basePenguinY}%`,
            transform: `translate(-50%, -100%) ${gameState.isJumping ? 'translateY(-30px)' : ''}`,
            transition: 'left 0.15s ease-out, transform 0.3s ease-out',
            zIndex: 10,
          }}
        >
          <div style={{
            width: 50,
            height: 60,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 40,
              height: 45,
              background: '#1a1a1a',
              borderRadius: '50% 50% 45% 45%',
            }}>
              <div style={{
                position: 'absolute',
                top: 5,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 30,
                height: 25,
                background: 'white',
                borderRadius: '50%',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 5,
                  left: 5,
                  width: 5,
                  height: 5,
                  background: '#1a1a1a',
                  borderRadius: '50%',
                }} />
                <div style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 5,
                  height: 5,
                  background: '#1a1a1a',
                  borderRadius: '50%',
                }} />
                <div style={{
                  position: 'absolute',
                  top: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 8,
                  height: 5,
                  background: '#FF9800',
                  borderRadius: '50%',
                }} />
              </div>
              <div style={{
                position: 'absolute',
                top: -15,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 30,
                height: 30,
                background: '#1a1a1a',
                borderRadius: '50%',
              }} />
              <div style={{
                position: 'absolute',
                bottom: -5,
                left: 5,
                width: 12,
                height: 8,
                background: '#FF9800',
                borderRadius: '50%',
              }} />
              <div style={{
                position: 'absolute',
                bottom: -5,
                right: 5,
                width: 12,
                height: 8,
                background: '#FF9800',
                borderRadius: '50%',
              }} />
            </div>
            {gameState.isJumping && (
              <div style={{
                position: 'absolute',
                bottom: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '20px',
                animation: 'jumpUp 0.5s ease-out',
              }}>
                ✨
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fishBounce {
          0%, 100% { transform: translateY(0) rotate(-10deg); }
          50% { transform: translateY(-5px) rotate(10deg); }
        }
        @keyframes jumpUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
      `}</style>

      {gameState.isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-title">❄️ 游戏结束 ❄️</div>
          <div className="game-over-score">
            最终得分: {gameState.score}<br />
            收集小鱼: {gameState.fishCollected} 🐟
          </div>
          <button className="start-button" onClick={startGame}>
            重新开始
          </button>
        </div>
      )}

      {!gameState.isPlaying && !gameState.isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-title">🐧 企鹅冰窟历险 🐧</div>
          <div className="game-over-score" style={{ color: '#fff', fontSize: '1rem', lineHeight: 1.8 }}>
            从远处飞来的冰窟和鱼！<br />
            ← → 移动位置<br />
            空格/上 跳跃躲避<br />
            摄像头检测跳跃动作
          </div>
          <button className="start-button" onClick={startGame}>
            开始游戏
          </button>
        </div>
      )}
    </div>
  );
};
