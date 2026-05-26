/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// --- TYPES & INTERFACES ---

interface ExtendedWindow extends Window {
    webkitAudioContext?: typeof AudioContext;
}

interface VisionState {
    poseLandmarker: any;
    lastVideoTime: number;
    results: any;
    prevY: number;
    prevTime: number;
    smoothedVelocity: number;
    peakVelocity: number;
    JUMP_VELOCITY_THRESHOLD: number;
    lastPredictionTime: number;
}

// Entity Interfaces for Pooling
interface GameObject {
    active: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    // Specific props
    color?: string;
}

interface GameEngineState {
    gameRunning: boolean;
    canRestart: boolean;
    score: number;
    gameSpeed: number;
    lastTime: number;
    // Pools
    obstaclePool: Cactus[];
    groundPool: GroundDetail[];
    spawnTimer: number;
    groundSpawnTimer: number;
    animationId: number;
    visionAnimationId: number;
    dino: DinoEntity;
    hasStarted: boolean;
    cameraReady: boolean;
}

interface DinoEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    dy: number;
    grounded: boolean;
    jumpTimer: number;
    legState: boolean;
    animTimer: number;
    jump: () => boolean;
    update: (dt: number, onStep?: () => void) => void;
    draw: (ctx: CanvasRenderingContext2D) => void;
    reset: () => void;
}

// --- CONSTANTS ---

const GAME_CONFIG = {
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 500,
    GROUND_Y: 442,
    GRAVITY: 4000,
    JUMP_FORCE: 1000,
    INITIAL_SPEED: 400,
    MAX_SPEED: 1200,
    SPEED_INCREMENT: 10,
    DINO_START_X: 80,
    DINO_GROUND_Y: 400,
    VISION_FPS: 30,
    COLORS: {
        PRIMARY: '#535353',
        ACCENT: '#ff5252',
        FOCUS: '#F59E0B',
        WHITE: '#ffffff',
    }
};

// --- AUDIO SYNTHESIS ---

const SoundSynth = {
    ctx: null as AudioContext | null,
    bufferCache: {} as Record<string, AudioBuffer>,
    
    init: () => {
        if (!SoundSynth.ctx) {
            const Win = window as ExtendedWindow;
            SoundSynth.ctx = new (window.AudioContext || Win.webkitAudioContext)();
        }
        if (SoundSynth.ctx.state === 'suspended') {
            SoundSynth.ctx.resume();
        }

        if (!SoundSynth.bufferCache['step']) {
            SoundSynth.bufferCache['step'] = SoundSynth.createNoiseBuffer(0.04);
        }
        if (!SoundSynth.bufferCache['roar']) {
            SoundSynth.bufferCache['roar'] = SoundSynth.createNoiseBuffer(0.8);
        }
    },

    createNoiseBuffer: (duration: number): AudioBuffer => {
        const ctx = SoundSynth.ctx!;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    },

    playJump: () => {
        const ctx = SoundSynth.ctx;
        if (!ctx) return;
        
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
        
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        osc.start(t);
        osc.stop(t + 0.1);
    },

    playStep: () => {
        const ctx = SoundSynth.ctx;
        if (!ctx || !SoundSynth.bufferCache['step']) return;
        
        const t = ctx.currentTime;
        const noise = ctx.createBufferSource();
        noise.buffer = SoundSynth.bufferCache['step'];
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + 0.04);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, t); 
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        noise.start(t);
    },

    playRoar: () => {
        const ctx = SoundSynth.ctx;
        if (!ctx || !SoundSynth.bufferCache['roar']) return;
        
        const t = ctx.currentTime;
        
        const noise = ctx.createBufferSource();
        noise.buffer = SoundSynth.bufferCache['roar'];
        
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, t);
        noiseFilter.frequency.linearRampToValueAtTime(100, t + 0.6);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.08, t);
        noiseGain.gain.linearRampToValueAtTime(0, t + 0.6);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.6);
        
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.08, t);
        oscGain.gain.linearRampToValueAtTime(0, t + 0.6);

        osc.connect(oscGain);
        oscGain.connect(ctx.destination);

        noise.start(t);
        osc.start(t);
        noise.stop(t + 0.6);
        osc.stop(t + 0.6);
    }
};

// --- GAME ENTITIES (POOLED) ---

class GroundDetail {
    active: boolean = false;
    x: number = 0;
    y: number = 0;
    width: number = 0;
    height: number = 2;

    spawn(startX: number) {
        this.x = startX;
        this.y = GAME_CONFIG.GROUND_Y + 3 + Math.random() * 45;
        this.width = Math.random() > 0.5 ? 3 : 7;
        this.active = true;
    }

    update(dt: number, speed: number) {
        if (!this.active) return;
        this.x -= speed * dt;
        if (this.x < -this.width) this.active = false;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;
        // Optimization: Assume context color is already set to PRIMARY
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);
    }
}

class Cactus {
    active: boolean = false;
    x: number = 0;
    y: number = 210;
    width: number = 0;
    height: number = 0;

    spawn(startX: number) {
        this.x = startX;
        this.y = GAME_CONFIG.GROUND_Y - 32;
        this.width = 20 + Math.random() * 15;
        this.height = 30 + Math.random() * 20;
        this.active = true;
    }

    update(dt: number, speed: number) {
        if (!this.active) return;
        this.x -= speed * dt;
        if (this.x < -this.width) this.active = false;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;
        const ix = Math.floor(this.x);
        const iy = Math.floor(this.y);
        const w3 = Math.floor(this.width / 3);
        const h = Math.floor(this.height);
        
        // Main stem
        ctx.fillRect(ix + w3, iy, w3, h);
        // Left arm
        ctx.fillRect(ix, iy + 10, w3, 5); 
        ctx.fillRect(ix, iy + 5, 5, 10);
        // Right arm
        ctx.fillRect(ix + 2*w3, iy + 15, w3, 5);
        ctx.fillRect(ix + Math.floor(this.width) - 5, iy + 5, 5, 15);
    }
}

// Pool Helpers
const getFromPool = <T extends { active: boolean }>(pool: T[], factory: () => T): T => {
    const item = pool.find(p => !p.active);
    if (item) return item;
    const newItem = factory();
    pool.push(newItem);
    return newItem;
};

const createDino = (): DinoEntity => ({
    x: GAME_CONFIG.DINO_START_X,
    y: GAME_CONFIG.DINO_GROUND_Y,
    width: 40,
    height: 43,
    dy: 0,
    grounded: false,
    jumpTimer: 0,
    legState: false,
    animTimer: 0,
    
    reset() {
        this.y = GAME_CONFIG.DINO_GROUND_Y;
        this.dy = 0;
        this.grounded = true;
        this.jumpTimer = 0;
        this.legState = false;
        this.animTimer = 0;
    },

    draw(ctx: CanvasRenderingContext2D) {
        // Optimization: Use Math.floor for sharp pixels
        const ix = Math.floor(this.x);
        const iy = Math.floor(this.y);

        ctx.fillStyle = GAME_CONFIG.COLORS.PRIMARY;
        // Body
        ctx.fillRect(ix + 10, iy, 20, 25);
        // Head
        ctx.fillRect(ix + 15, iy - 10, 25, 18);
        // Tail
        ctx.fillRect(ix, iy + 5, 10, 5);
        
        // Legs Animation
        if (!this.grounded) {
            ctx.fillRect(ix + 10, iy + 25, 5, 10);
            ctx.fillRect(ix + 25, iy + 25, 5, 10);
        } else if (this.legState) {
            ctx.fillRect(ix + 10, iy + 25, 5, 18);
            ctx.fillRect(ix + 25, iy + 25, 5, 10);
        } else {
            ctx.fillRect(ix + 10, iy + 25, 5, 10);
            ctx.fillRect(ix + 25, iy + 25, 5, 18);
        }

        ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        ctx.fillRect(ix + 30, iy - 5, 3, 3); // Eye
        
        // Reset color to primary for next draw calls
        ctx.fillStyle = GAME_CONFIG.COLORS.PRIMARY;
    },

    jump() {
        if (this.grounded && this.jumpTimer <= 0) {
            this.dy = -GAME_CONFIG.JUMP_FORCE;
            this.grounded = false;
            this.jumpTimer = 0.1;
            return true;
        }
        return false;
    },

    update(dt: number, onStep?: () => void) {
        if (this.jumpTimer > 0) this.jumpTimer -= dt;

        this.animTimer += dt;
        if (this.animTimer > 0.1) {
            this.legState = !this.legState;
            this.animTimer = 0;
            if (this.grounded && onStep) onStep();
        }

        this.dy += GAME_CONFIG.GRAVITY * dt;
        this.y += this.dy * dt;

        if (this.y > GAME_CONFIG.DINO_GROUND_Y) {
            this.y = GAME_CONFIG.DINO_GROUND_Y;
            this.dy = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }
    }
});


interface DinoGameProps {
    playerName?: string;
    onGameOver?: (score: number) => void;
    autoEnableCamera?: boolean;
    onCameraReady?: () => void;
}

const DinoGame: React.FC<DinoGameProps> = ({ playerName = 'Player', onGameOver, autoEnableCamera, onCameraReady }) => {
    // --- REFS ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const outputCanvasRef = useRef<HTMLCanvasElement>(null);
    const jumpSignalRef = useRef<HTMLDivElement>(null);
    
    // --- REACT STATE ---
    const [isLoading, setIsLoading] = useState(true);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [showVision, setShowVision] = useState(true);
    const [gameRunning, setGameRunning] = useState(false);
    const [canRestart, setCanRestart] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    const mutedRef = useRef(false);

    // Countdown logic
    useEffect(() => {
        if (cameraReady && !hasStarted && countdown === null) {
            setCountdown(6);
        }
    }, [cameraReady, hasStarted, countdown]);

    useEffect(() => {
        if (countdown !== null && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            manualStart();
            setCountdown(null);
        }
    }, [countdown]);

    // --- ENGINE STATE (Mutable) ---
    const engineRef = useRef<GameEngineState>({
        gameRunning: false,
        canRestart: false,
        score: 0,
        gameSpeed: GAME_CONFIG.INITIAL_SPEED,
        lastTime: 0,
        // Pre-allocate pools
        obstaclePool: Array.from({ length: 10 }, () => new Cactus()),
        groundPool: Array.from({ length: 50 }, () => new GroundDetail()),
        spawnTimer: 0,
        groundSpawnTimer: 0,
        animationId: 0,
        visionAnimationId: 0,
        dino: createDino(),
        hasStarted: false,
        cameraReady: false
    });

    // --- VISION STATE (Mutable) ---
    const visionRef = useRef<VisionState>({
        poseLandmarker: null,
        lastVideoTime: -1,
        results: undefined,
        prevY: 0,
        prevTime: 0,
        smoothedVelocity: 0,
        peakVelocity: 0,
        JUMP_VELOCITY_THRESHOLD: 2.5,
        lastPredictionTime: 0
    });

    useEffect(() => {
        mutedRef.current = isMuted;
    }, [isMuted]);

    // --- GAME LOGIC ---

    const spawnObstacle = (dt: number) => {
        const engine = engineRef.current;
        engine.spawnTimer -= dt;
        
        if (engine.spawnTimer <= 0) {
            const r = Math.random();
            let count = r > 0.8 ? 3 : (r > 0.5 ? 2 : 1);

            let nextX = GAME_CONFIG.CANVAS_WIDTH; 

            for (let i = 0; i < count; i++) {
                const cactus = getFromPool(engine.obstaclePool, () => new Cactus());
                cactus.spawn(nextX);
                nextX += cactus.width + (5 + Math.random() * 20); 
            }
            
            engine.spawnTimer = 1.0 + (count * 0.4) + Math.random() * 1.2; 
            
            if(engine.gameSpeed < GAME_CONFIG.MAX_SPEED) {
                engine.gameSpeed += GAME_CONFIG.SPEED_INCREMENT; 
            }
        }
    };

    const spawnGroundDetails = (dt: number) => {
        const engine = engineRef.current;
        engine.groundSpawnTimer -= dt;
        if (engine.groundSpawnTimer <= 0) {
            const detail = getFromPool(engine.groundPool, () => new GroundDetail());
            detail.spawn(GAME_CONFIG.CANVAS_WIDTH);
            engine.groundSpawnTimer = 0.05 + Math.random() * 0.2; 
        }
    };

    const gameOver = () => {
        const engine = engineRef.current;
        engine.gameRunning = false;
        engine.canRestart = false;
        
        setGameRunning(false);
        setCanRestart(false); 
        
        if (!mutedRef.current) {
            SoundSynth.playRoar();
        }
        
        setTimeout(() => {
            engine.canRestart = true;
            setCanRestart(true);
            if (onGameOver) {
                onGameOver(Math.floor(engine.score / 10));
            }
        }, 1500);
    };

    const runGameLoop = (timestamp: number) => {
        const engine = engineRef.current;
        if (!engine.gameRunning) return;

        if (!engine.lastTime) engine.lastTime = timestamp;
        // Cap Delta Time to prevent huge jumps on frame drops (0.1s max)
        const dt = Math.min((timestamp - engine.lastTime) / 1000, 0.1); 
        engine.lastTime = timestamp;

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { alpha: false })!; // Optimize for no transparency

        // 1. Draw Background (Clear)
        ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set global styles for the frame
        ctx.strokeStyle = GAME_CONFIG.COLORS.PRIMARY;
        ctx.fillStyle = GAME_CONFIG.COLORS.PRIMARY;
        ctx.lineWidth = 2;

        // 2. Draw Ground Line
        ctx.beginPath();
        ctx.moveTo(0, GAME_CONFIG.GROUND_Y);
        ctx.lineTo(canvas.width, GAME_CONFIG.GROUND_Y);
        ctx.stroke();

        // 3. Logic & Draw Ground Details
        spawnGroundDetails(dt);
        // Using For loop instead of forEach for perf
        for(let i = 0; i < engine.groundPool.length; i++) {
            const detail = engine.groundPool[i];
            if (detail.active) {
                detail.update(dt, engine.gameSpeed);
                detail.draw(ctx);
            }
        }

        // 4. Logic & Draw Dino
        engine.dino.update(dt, () => {
            if (!mutedRef.current) SoundSynth.playStep();
        });
        engine.dino.draw(ctx);

        // 5. Logic & Draw Obstacles
        spawnObstacle(dt);
        const dino = engine.dino;
        const padding = 10;
        
        for(let i = 0; i < engine.obstaclePool.length; i++) {
            const obs = engine.obstaclePool[i];
            if (obs.active) {
                obs.update(dt, engine.gameSpeed);
                obs.draw(ctx);
                
                // Collision Detection (Active obstacles only)
                if (
                    dino.x < obs.x + obs.width - padding &&
                    dino.x + dino.width > obs.x + padding &&
                    dino.y < obs.y + obs.height - padding &&
                    dino.y + dino.height > obs.y + padding
                ) {
                    gameOver();
                    // Don't return, let the frame finish drawing
                }
            }
        }

        // 6. Draw Score
        if (engine.gameRunning) { // Double check in case of game over mid-loop
            engine.score += 60 * dt;
            const scoreStr = `${playerName.toUpperCase()} ${Math.floor(engine.score/10).toString().padStart(5, '0')}`;
            // Font is set once ideally, but to be safe:
            ctx.font = "16px 'Press Start 2P'";
            ctx.textAlign = "right";
            ctx.fillText(scoreStr, canvas.width - 20, 30);
            
            engine.animationId = requestAnimationFrame(runGameLoop);
        }
    };

    const resetGame = () => {
        const engine = engineRef.current;
        
        // Deactivate all pool items
        engine.obstaclePool.forEach(p => p.active = false);
        engine.groundPool.forEach(p => p.active = false);
        
        // Populate initial ground
        for (let x = 0; x < GAME_CONFIG.CANVAS_WIDTH; x += 30 + Math.random() * 60) {
            const detail = getFromPool(engine.groundPool, () => new GroundDetail());
            detail.spawn(x);
        }

        engine.score = 0;
        engine.canRestart = false;
        engine.gameSpeed = GAME_CONFIG.INITIAL_SPEED;
        engine.spawnTimer = 0;
        engine.groundSpawnTimer = 0;
        engine.dino.reset();
        engine.lastTime = 0;
        engine.gameRunning = true;
        
        setGameRunning(true);
        setCanRestart(false);
        
        runGameLoop(0);
    };

    const manualStart = () => {
        SoundSynth.init();
        setHasStarted(true);
        engineRef.current.hasStarted = true;
        resetGame();
    };

    const handleJumpSignal = () => {
        if (jumpSignalRef.current) {
            jumpSignalRef.current.classList.add('active');
            setTimeout(() => jumpSignalRef.current?.classList.remove('active'), 200);
        }

        const engine = engineRef.current;
        if (engine.gameRunning) {
            const jumped = engine.dino.jump();
            if (jumped && !mutedRef.current) {
                SoundSynth.playJump();
            }
        } else if (!engine.gameRunning && engine.canRestart) {
            resetGame();
        } else if (!engine.hasStarted && engine.cameraReady) {
            manualStart();
        }
    };

    // --- VISION LOGIC ---

    const predictWebcam = () => {
        const video = videoRef.current;
        const outCanvas = outputCanvasRef.current;
        const engine = engineRef.current;
        
        if (!video || !outCanvas || !visionRef.current.poseLandmarker) {
            engine.visionAnimationId = requestAnimationFrame(predictWebcam);
            return;
        }

        // Fix: Ensure video has valid dimensions before processing
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            engine.visionAnimationId = requestAnimationFrame(predictWebcam);
            return;
        }

        const now = performance.now();
        const timeSinceLast = now - visionRef.current.lastPredictionTime;
        const frameInterval = 1000 / GAME_CONFIG.VISION_FPS;

        if (timeSinceLast < frameInterval) {
            engine.visionAnimationId = requestAnimationFrame(predictWebcam);
            return;
        }
        visionRef.current.lastPredictionTime = now;

        const state = visionRef.current;
        const { poseLandmarker } = state;

        if (outCanvas.width !== video.videoWidth || outCanvas.height !== video.videoHeight) {
            outCanvas.width = video.videoWidth;
            outCanvas.height = video.videoHeight;
        }

        const outCtx = outCanvas.getContext('2d', { alpha: true })!;
        
        let didUpdate = false;
        if (state.lastVideoTime !== video.currentTime) {
            state.lastVideoTime = video.currentTime;
            try {
                state.results = poseLandmarker.detectForVideo(video, now);
                didUpdate = true;
            } catch (err) {
                console.error("MediaPipe detection error:", err);
            }
        }
        
        outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
        
        if (state.results && state.results.landmarks && state.results.landmarks.length > 0) {
            const landmarks = state.results.landmarks[0];
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];

            outCtx.beginPath();
            outCtx.moveTo(leftShoulder.x * outCanvas.width, leftShoulder.y * outCanvas.height);
            outCtx.lineTo(rightShoulder.x * outCanvas.width, rightShoulder.y * outCanvas.height);
            outCtx.strokeStyle = GAME_CONFIG.COLORS.ACCENT;
            outCtx.lineWidth = 3;
            outCtx.stroke();

            outCtx.fillStyle = '#00FF00';
            // Simple loop
            const shoulders = [leftShoulder, rightShoulder];
            for (let i = 0; i < shoulders.length; i++) {
                outCtx.beginPath();
                outCtx.arc(shoulders[i].x * outCanvas.width, shoulders[i].y * outCanvas.height, 5, 0, 2 * Math.PI);
                outCtx.fill();
            }

            if (didUpdate) {
                const currentY = (leftShoulder.y + rightShoulder.y) / 2;
                const shoulderDist = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
                
                const currentTime = video.currentTime;
                let currentVelocity = 0;

                if (state.prevTime > 0 && currentTime > state.prevTime) {
                    const dt = currentTime - state.prevTime; 
                    const dy = state.prevY - currentY; 
                    const normalizedDy = dy / shoulderDist;
                    currentVelocity = normalizedDy / dt;
                }
                
                state.smoothedVelocity = state.smoothedVelocity * 0.5 + currentVelocity * 0.5;
                
                if (state.smoothedVelocity > state.peakVelocity) {
                    state.peakVelocity = state.smoothedVelocity;
                } else {
                    state.peakVelocity *= 0.95;
                }

                state.prevY = currentY;
                state.prevTime = currentTime;
                
                if (state.smoothedVelocity > state.JUMP_VELOCITY_THRESHOLD) {
                    handleJumpSignal();
                }
            }

            drawDebugOverlay(outCtx, state);
        }

        engine.visionAnimationId = requestAnimationFrame(predictWebcam);
    };

    const drawDebugOverlay = (ctx: CanvasRenderingContext2D, state: VisionState) => {
        const barH = 100;
        const barW = 15;
        const barX = 20; 
        const barY = 50;
        const maxVal = state.JUMP_VELOCITY_THRESHOLD * 1.5;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barY, barW, barH);

        const threshPixel = (state.JUMP_VELOCITY_THRESHOLD / maxVal) * barH;
        const threshY = barY + barH - threshPixel;
        ctx.fillStyle = 'red';
        ctx.fillRect(barX - 5, threshY, barW + 10, 2);

        const fillRatio = Math.min(Math.max(state.smoothedVelocity / maxVal, 0), 1);
        const currentH = fillRatio * barH;
        
        const isCrossing = state.smoothedVelocity > state.JUMP_VELOCITY_THRESHOLD;
        ctx.fillStyle = isCrossing ? '#00FF00' : '#FFFF00';
        ctx.fillRect(barX, barY + barH - currentH, barW, currentH);

        const peakRatio = Math.min(Math.max(state.peakVelocity / maxVal, 0), 1);
        const peakH = peakRatio * barH;
        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)'; 
        ctx.fillRect(barX, barY + barH - peakH, barW, 2);

        ctx.save();
        ctx.scale(-1, 1); 
        ctx.fillStyle = '#00FF00';
        ctx.font = '12px monospace';
        ctx.fillText(`VEL : ${state.smoothedVelocity.toFixed(2)}`, -(barX + 70), barY + barH + 20);
        ctx.fillStyle = 'red';
        ctx.fillText(`THR : ${state.JUMP_VELOCITY_THRESHOLD.toFixed(2)}`, -(barX + 70), barY + barH + 35);
        ctx.restore();
    };

    const enableCam = async () => {
        SoundSynth.init();
        if (!visionRef.current.poseLandmarker) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240 }
            });
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.addEventListener("loadeddata", () => {
                    predictWebcam();
                    setCameraReady(true);
                    engineRef.current.cameraReady = true;
                    if (onCameraReady) onCameraReady();
                });
            }
        } catch(err) {
            console.error(err);
            alert("Please enable camera access to play!");
        }
    };

    useEffect(() => {
        const initMediaPipe = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
                );
                
                visionRef.current.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });

                setIsLoading(false);
                setModelLoaded(true);
                
                if (autoEnableCamera) {
                    // Slight delay to ensure refs are ready
                    setTimeout(enableCam, 100);
                }
            } catch (err) {
                console.error(err);
                setIsLoading(false);
            }
        };

        initMediaPipe();

        return () => {
            cancelAnimationFrame(engineRef.current.animationId);
            cancelAnimationFrame(engineRef.current.visionAnimationId);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-4 relative">
            
            {/* GAME CANVAS */}
            <div className="relative group/game">
                <canvas 
                    ref={canvasRef} 
                    width={GAME_CONFIG.CANVAS_WIDTH} 
                    height={GAME_CONFIG.CANVAS_HEIGHT}
                    className="bg-white border-4 border-[#333] rounded-xl shadow-[8px_8px_0_0_#333] max-w-full transition-transform"
                />

                {/* MUTE BUTTON */}
                <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`group absolute top-[4%] left-[2.5%] z-20 w-[3%] h-auto text-[#535353] hover:text-[#333] transition-colors focus:outline-none focus:ring-2 focus:ring-[${GAME_CONFIG.COLORS.FOCUS}] rounded-sm aspect-square`}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                    style={{ minWidth: '1px' }}
                >
                    {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                            <line x1="23" y1="9" x2="17" y2="15"></line>
                            <line x1="17" y1="9" x2="23" y2="15"></line>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    )}
                    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[#333] text-white text-[0.65rem] font-press-start rounded opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-sm z-30">
                        {isMuted ? "Unmute" : "Mute"}
                    </span>
                </button>
                
                {/* START SCREEN */}
                {(!gameRunning && !canRestart && !hasStarted) && (
                    <div className="absolute top-0 left-0 w-full h-full bg-black/40 flex flex-col items-center justify-center z-10 rounded-lg text-center backdrop-blur-sm">
                        {!cameraReady ? (
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 border-4 border-white border-t-game-accent rounded-full animate-spin mb-6"></div>
                                <p className="font-press-start text-xs text-white uppercase tracking-widest">Initializing AI Sensor...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="text-white text-[120px] font-press-start drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] animate-pulse">
                                    {countdown}
                                </div>
                                <div className="bg-game-accent text-white px-8 py-3 rounded-xl border-4 border-white font-press-start text-xs uppercase tracking-[0.2em] shadow-2xl">
                                    Prepare to Jump!
                                </div>
                            </div>
                        )}
                        {!cameraReady && !isLoading && !autoEnableCamera && (
                            <button 
                                onClick={enableCam}
                                className="mt-8 px-10 py-5 bg-game-accent text-white border-4 border-white rounded-xl font-press-start text-sm hover:scale-110 active:scale-95 transition-all shadow-2xl"
                            >
                                ENABLE CAMERA
                            </button>
                        )}
                    </div>
                )}

                {/* GAME OVER SCREEN */}
                {(hasStarted && !gameRunning) && (
                    <div className="absolute top-0 left-0 w-full h-full bg-black/50 flex flex-col items-center justify-center z-10 rounded-lg text-center p-2 md:p-4">
                        <div className="text-white text-base md:text-xl font-press-start mb-2 opacity-80">{playerName}</div>
                        <div className="text-white text-xl md:text-3xl font-press-start mb-3 md:mb-6 drop-shadow-md">GAME OVER</div>
                        <div className="text-white text-xs md:text-sm font-press-start mb-2 md:mb-4 animate-pulse drop-shadow-md">
                            {canRestart ? "JUMP TO RESTART" : "..."}
                        </div>
                        <div className="text-white/90 text-[8px] font-press-start bg-black/40 p-1 md:p-2 rounded">
                            Powered By <a href="https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker" target="_blank" rel="noopener noreferrer" className={`text-[${GAME_CONFIG.COLORS.FOCUS}] no-underline hover:underline focus:outline-none focus:ring-2 focus:ring-[${GAME_CONFIG.COLORS.FOCUS}] rounded-sm`}>MediaPipe Pose Landmarker</a>
                        </div>
                    </div>
                )}
            </div>

            {/* VISION PIP CONTAINER (Top Right) */}
            <div 
                className={`fixed top-6 right-6 w-[200px] h-[150px] border-4 border-white rounded-xl overflow-hidden bg-black shadow-2xl z-40 transition-all duration-500 scale-100 hover:scale-105 active:scale-95 ${showVision ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none'}`}
            >
                <video 
                    ref={videoRef} 
                    className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]" 
                    autoPlay 
                    playsInline
                ></video>
                <canvas 
                    ref={outputCanvasRef} 
                    className="absolute top-0 left-0 w-full h-full scale-x-[-1]"
                ></canvas>
                <div 
                    ref={jumpSignalRef}
                    className="absolute top-3 right-3 w-4 h-4 bg-white/20 border border-white/30 rounded-full transition-all duration-100 [&.active]:bg-game-accent [&.active]:scale-125 [&.active]:shadow-[0_0_15px_#ff5252]"
                ></div>
                
                {/* PIP Labels */}
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/40 backdrop-blur-md rounded text-[6px] text-white font-press-start uppercase tracking-tighter">
                    V-SENSOR
                </div>
            </div>
        </div>
    );
};

export default DinoGame;