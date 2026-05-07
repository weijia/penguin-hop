import { useState, useEffect, useCallback, useRef } from 'react';
import { Penguin } from './Penguin';
import { IceHole } from './IceHole';
import { Snowflake } from './Snowflake';
import { usePoseDetection } from '../hooks/usePoseDetection';

interface GameState {
  score: number;
  isGameOver: boolean;
  isPlaying: boolean;
  penguinLeft: number;
  penguinBottom: number;
  isJumping: boolean;
  holes: { id: number; left: number }[];
  gameSpeed: number;
}

const GAME_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 1200;
const GAME_HEIGHT = typeof window !== 'undefined' ? window.innerHeight : 800;
const PLATFORM_HEIGHT = 120;
const PENGUIN_WIDTH = 60;
const HOLE_WIDTH = 80;
const HOLE_GAP_MIN = 200;
const HOLE_GAP_MAX = 400;

export const Game = () => {
  const { 
    isJumping: detectedJump, 
    videoElement, 
    keypoints, 
    confidence,
    noseY,
    lastY 
  } = usePoseDetection();
  
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    isGameOver: false,
    isPlaying: false,
    penguinLeft: 100,
    penguinBottom: PLATFORM_HEIGHT,
    isJumping: false,
    holes: [],
    gameSpeed: 3,
  });

  const jumpVelocityRef = useRef(0);
  const lastHoleIdRef = useRef(0);
  const animationFrameRef = useRef<number>();
  const lastHoleTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoElement && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 320;
        canvas.height = 240;
      }
    }
  }, [videoElement]);

  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#00ff00';
    ctx.lineWidth = 2;

    const scaleX = canvas.width / videoElement.videoWidth;
    const scaleY = canvas.height / videoElement.videoHeight;

    keypoints.forEach(point => {
      const x = point.x * scaleX;
      const y = point.y * scaleY;
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      if (point.name) {
        ctx.font = '10px Arial';
        ctx.fillText(point.name, x + 5, y - 5);
      }
    });

    if (noseY > 0) {
      const y = noseY * scaleY;
      ctx.strokeStyle = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, [keypoints, videoElement, noseY]);

  const generateSnowflakes = () => {
    const flakes = [];
    for (let i = 0; i < 30; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 10,
        duration: 5 + Math.random() * 10,
        size: 3 + Math.random() * 8,
      });
    }
    return flakes;
  };

  const snowflakes = generateSnowflakes();

  const handleJump = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver || gameState.isJumping) return;
    
    setGameState(prev => ({ ...prev, isJumping: true }));
    jumpVelocityRef.current = 15;
  }, [gameState.isPlaying, gameState.isGameOver, gameState.isJumping]);

  useEffect(() => {
    if (detectedJump) {
      handleJump();
    }
  }, [detectedJump, handleJump]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!gameState.isPlaying || gameState.isGameOver) {
          startGame();
        } else {
          handleJump();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.isPlaying, gameState.isGameOver, handleJump]);

  const startGame = () => {
    setGameState({
      score: 0,
      isGameOver: false,
      isPlaying: true,
      penguinLeft: 100,
      penguinBottom: PLATFORM_HEIGHT,
      isJumping: false,
      holes: [{ id: 0, left: GAME_WIDTH + 100 }],
      gameSpeed: 3,
    });
    lastHoleIdRef.current = 1;
    lastHoleTimeRef.current = Date.now();
    jumpVelocityRef.current = 0;
  };

  const endGame = () => {
    setGameState(prev => ({ ...prev, isGameOver: true, isPlaying: false }));
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  useEffect(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;

    const gameLoop = () => {
      setGameState(prev => {
        const newHoles = prev.holes
          .map(hole => ({ ...hole, left: hole.left - prev.gameSpeed }))
          .filter(hole => hole.left > -HOLE_WIDTH);

        const now = Date.now();
        const timeSinceLastHole = now - lastHoleTimeRef.current;
        const minTimeBetweenHoles = Math.max(800, 2000 - prev.score * 50);

        if (timeSinceLastHole > minTimeBetweenHoles && newHoles.length < 5) {
          const lastHole = newHoles[newHoles.length - 1];
          const lastHoleRight = lastHole ? lastHole.left + HOLE_WIDTH : GAME_WIDTH;
          const gap = HOLE_GAP_MIN + Math.random() * (HOLE_GAP_MAX - HOLE_GAP_MIN);
          newHoles.push({
            id: lastHoleIdRef.current++,
            left: lastHoleRight + gap,
          });
          lastHoleTimeRef.current = now;
        }

        let newBottom = prev.penguinBottom;
        let newIsJumping = prev.isJumping;

        if (jumpVelocityRef.current > 0 || prev.isJumping) {
          jumpVelocityRef.current -= 0.8;
          newBottom += jumpVelocityRef.current;
          newIsJumping = true;

          if (newBottom <= PLATFORM_HEIGHT) {
            newBottom = PLATFORM_HEIGHT;
            newIsJumping = false;
            jumpVelocityRef.current = 0;
          }
        }

        const penguinRight = prev.penguinLeft + PENGUIN_WIDTH;
        const penguinCenter = prev.penguinLeft + PENGUIN_WIDTH / 2;

        for (const hole of newHoles) {
          const holeRight = hole.left + HOLE_WIDTH;
          if (
            penguinRight > hole.left &&
            prev.penguinLeft < holeRight &&
            newBottom <= PLATFORM_HEIGHT + 10
          ) {
            if (!(penguinCenter > hole.left && penguinCenter < holeRight)) {
              const newScore = prev.score + 1;
              return {
                ...prev,
                holes: newHoles,
                penguinBottom: newBottom,
                isJumping: newIsJumping,
                score: newScore,
                gameSpeed: Math.min(8, 3 + Math.floor(newScore / 5) * 0.5),
              };
            } else {
              endGame();
              return prev;
            }
          }
        }

        return {
          ...prev,
          holes: newHoles,
          penguinBottom: newBottom,
          isJumping: newIsJumping,
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

  return (
    <div className="game-container">
      <div className="score-display">分数: {gameState.score}</div>
      
      <div className="instruction">
        <div>🎮 跳起来躲避冰窟!</div>
        <div>摄像头检测你的跳跃动作</div>
        <div>或按空格键/上键跳跃</div>
      </div>

      <div className="camera-container" ref={videoContainerRef}>
        <video 
          ref={el => { 
            if (el && videoElement) {
              el.srcObject = videoElement.srcObject;
            }
          }} 
          autoPlay 
          playsInline 
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <canvas 
          ref={canvasRef}
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            pointerEvents: 'none',
            transform: 'scaleX(-1)'
          }} 
        />
        <div style={{
          position: 'absolute',
          bottom: '5px',
          left: '5px',
          right: '5px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          fontSize: '10px',
          padding: '3px',
          borderRadius: '3px',
        }}>
          置信度: {(confidence * 100).toFixed(0)}% | 鼻Y: {noseY.toFixed(0)}
        </div>
      </div>

      {snowflakes.map(flake => (
        <Snowflake
          key={flake.id}
          left={flake.left}
          delay={flake.delay}
          duration={flake.duration}
          size={flake.size}
        />
      ))}

      <div className="mountain" style={{ left: '10%' }} />
      <div className="mountain small" style={{ left: '18%' }} />
      <div className="mountain snow" style={{ left: '60%' }} />
      <div className="mountain" style={{ left: '75%' }} />

      {gameState.holes.map(hole => (
        <IceHole key={hole.id} left={hole.left} />
      ))}

      <Penguin
        left={gameState.penguinLeft}
        bottom={gameState.penguinBottom}
        isJumping={gameState.isJumping}
      />

      <div className="ice-platform" />

      {gameState.isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-title">❄️ 游戏结束 ❄️</div>
          <div className="game-over-score">最终得分: {gameState.score}</div>
          <button className="start-button" onClick={startGame}>
            重新开始
          </button>
        </div>
      )}

      {!gameState.isPlaying && !gameState.isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-title">🐧 企鹅跳冰窟 🐧</div>
          <div className="game-over-score" style={{ color: '#fff' }}>
            使用摄像头检测跳跃动作来控制企鹅
          </div>
          <button className="start-button" onClick={startGame}>
            开始游戏
          </button>
        </div>
      )}
    </div>
  );
};
