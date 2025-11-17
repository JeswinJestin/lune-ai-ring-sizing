


import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../Button';
import { 
    ChevronLeftIcon, SettingsIcon, HelpCircleIcon, ZapIcon, GridIcon, RefreshCwIcon, UploadIcon, ArrowRightIcon,
    CheckCircleIcon, SunIcon, AlertTriangleIcon, CloseIcon
} from '../icons/UtilIcons';
import { HandSilhouetteIcon } from '../icons/MethodIcons';
import type { SizingMethod, CameraGuidance, Landmark } from '../../types';
import { createFilters } from '../../lib/tracking/kalman';
import { analyzeCameraFrame } from '../../lib/ai/cameraGuidance';

// Declare MediaPipe types for TypeScript
declare global {
  interface Window {
    Hands: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    Camera: any;
  }
}

type CameraStatus = 'idle' | 'initializing' | 'permission_denied' | 'error' | 'live' | 'preview';
type FacingMode = 'environment' | 'user';

interface CameraProps {
    onCapture: (imageBlob: Blob) => void;
    onCancel: () => void;
    method: SizingMethod | null;
}

const FeedbackItem: React.FC<{ status: 'good' | 'warn' | 'bad'; goodText: string; warnText: string; badText?: string }> = ({ status, goodText, warnText, badText }) => {
    const Icon = status === 'good' ? CheckCircleIcon : AlertTriangleIcon;
    const color = status === 'good' ? 'text-success' : 'text-warning';
    const text = status === 'good' ? goodText : (status === 'warn' ? warnText : badText || warnText);

    return (
        <div className={`flex items-center gap-2 transition-colors duration-300 ${color}`}>
            <Icon className="w-5 h-5" />
            <span className="font-medium">{text}</span>
        </div>
    );
};

export const Camera = ({ onCapture, onCancel, method }: CameraProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handsRef = useRef<any>(null);
    const filtersRef = useRef<{ kalman: any[]; smooth: any[] } | null>(null);
    const perfRef = useRef<{ frameCount: number; lastTs: number; avgMs: number; accuracy: number; errorFrames: number }>({ frameCount: 0, lastTs: performance.now(), avgMs: 0, accuracy: 0, errorFrames: 0 });
    const viewTransformRef = useRef<{ mirroredX: boolean; mirroredY: boolean; rotationRad: number }>({ mirroredX: false, mirroredY: false, rotationRad: 0 });
    
    const [status, setStatus] = useState<CameraStatus>('initializing');
    const [cameraError, setCameraError] = useState<{ title: string; message: string } | null>(null);
    const [facingMode, setFacingMode] = useState<FacingMode>('environment');
    const [gridOn, setGridOn] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [isFlashing, setIsFlashing] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
    const [guidance, setGuidance] = useState<CameraGuidance | null>(null);
    const [restartCounter, setRestartCounter] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // AI Scan specific state
    const [isHandDetected, setIsHandDetected] = useState(false);
    const [aiStatusText, setAiStatusText] = useState('Place your hand inside the outline.');
    const [aiHints, setAiHints] = useState<string[]>([]);
    const [placementState, setPlacementState] = useState<'too_close'|'too_far'|'angle_bad'|'spacing_bad'|'ok'>('too_far');
    const [overlayConfidence, setOverlayConfidence] = useState(0);
    const [overlayHanded, setOverlayHanded] = useState<'Left'|'Right'|'Unknown'>('Unknown');
    const [overlayPalmCov, setOverlayPalmCov] = useState<number>(0);
    const [liveDims, setLiveDims] = useState<null | { knuckle: number; mid: number; tip: number; cirKnuckle: number; cirMid: number; cirTip: number }>(null);
    const hudLastRef = useRef<number>(0);
    const landmarkBufferRef = useRef<Landmark[][]>([]);
    const calibPxPerMmRef = useRef<number | null>(null);


    const isCardMethod = method === 'reference-object';
    const isAiScanMethod = method === 'ai-scan';

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // AI Scan hand tracking effect
    useEffect(() => {
        if (status !== 'live' || !isAiScanMethod || typeof window.Hands === 'undefined' || !overlayCanvasRef.current || !videoRef.current) return;
        
        let isMounted = true;
        const video = videoRef.current;
        const canvas = overlayCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if(!ctx) return;
        filtersRef.current = createFilters(21);
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth || video.clientWidth;
        offscreen.height = video.videoHeight || video.clientHeight;
        const octx = offscreen.getContext('2d');

        const onResults = (results: any) => {
            if (!isMounted) return;
            const t0 = performance.now();
            canvas.width = video.videoWidth || video.clientWidth;
            canvas.height = video.videoHeight || video.clientHeight;

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const computed = getComputedStyle(video);
            const transformStr = computed.transform;
            let mirroredX = false;
            let rotationRad = 0;
            if (transformStr && transformStr !== 'none') {
                const m = transformStr.match(/matrix\(([^)]+)\)/);
                if (m) {
                    const vals = m[1].split(',').map(v => parseFloat(v.trim()));
                    const a = vals[0];
                    const b = vals[1];
                    const c = vals[2];
                    const d = vals[3];
                    mirroredX = a < 0;
                    rotationRad = Math.atan2(b, a);
                }
            }
            viewTransformRef.current = { mirroredX, mirroredY: false, rotationRad };
            if (rotationRad !== 0) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(rotationRad);
                ctx.translate(-canvas.width / 2, -canvas.height / 2);
            }
            if (mirroredX) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            
            let handInCorrectPosition = false;
            let hints: string[] = [];

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks: Landmark[] = results.multiHandLandmarks[0];
                const handedness = (results.multiHandedness && results.multiHandedness[0] && results.multiHandedness[0].label) || 'Unknown';
                setOverlayHanded(handedness);
                
                const tx = (x: number) => x;
                const ty = (y: number) => y;
                // multi-frame averaging for stability
                const buf = landmarkBufferRef.current;
                buf.push(landmarks);
                if (buf.length > 5) buf.shift();
                const agg: Landmark[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }));
                for (let i=0;i<agg.length;i++) {
                    let ax = 0, ay = 0, az = 0;
                    for (const f of buf) { ax += f[i].x; ay += f[i].y; az += f[i].z; }
                    agg[i].x = ax / buf.length; agg[i].y = ay / buf.length; agg[i].z = az / buf.length;
                }
                let varSum = 0;
                for (let i=0;i<landmarks.length;i++) {
                    const dxv = landmarks[i].x - agg[i].x;
                    const dyv = landmarks[i].y - agg[i].y;
                    varSum += dxv*dxv + dyv*dyv;
                }
                const varianceScore = Math.sqrt(varSum / landmarks.length);
                let minX = 1.0, minY = 1.0, maxX = 0.0, maxY = 0.0;
                for (const landmark of agg) {
                    const nx = tx(landmark.x);
                    const ny = ty(landmark.y);
                    minX = Math.min(minX, nx);
                    minY = Math.min(minY, ny);
                    maxX = Math.max(maxX, nx);
                    maxY = Math.max(maxY, ny);
                }
                const handCenterX = (minX + maxX) / 2;
                const handCenterY = (minY + maxY) / 2;
                const handWidthNorm = (maxX - minX);
                const handHeightNorm = (maxY - minY);
                const widthPx = handWidthNorm * canvas.width;
                const heightPx = handHeightNorm * canvas.height;

                const targetXMin = 0.28, targetXMax = 0.72;
                const targetYMin = 0.20, targetYMax = 0.80;
                const minWidthPx = canvas.width * 0.22;
                const maxWidthPx = canvas.width * 0.45;
                const wrist = agg[0];
                const middleTip = agg[12];
                const dx = (middleTip.x - wrist.x) * canvas.width;
                const dy = (middleTip.y - wrist.y) * canvas.height;
                const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
                const angleOk = angle > 60 && angle < 120;
                const tipIdx = [4,8,12,16,20];
                const mcpIdx = [2,5,9,13,17];
                const centers = tipIdx.map((t,i) => {
                    const tip = agg[t];
                    const mcp = agg[mcpIdx[i]];
                    const cx = (tip.x + mcp.x)/2;
                    const cy = (tip.y + mcp.y)/2;
                    const f = filtersRef.current!;
                    const k = f.kalman[t];
                    const s = f.smooth[t];
                    const sm = s.smooth(tx(cx), ty(cy));
                    const pr = k.predict();
                    const up = k.update(sm[0], sm[1]);
                    return { x: up[0], y: up[1] };
                });
                const tips = tipIdx.map((t) => {
                    const tip = agg[t];
                    const f = filtersRef.current!;
                    const k = f.kalman[t];
                    const s = f.smooth[t];
                    const sm = s.smooth(tx(tip.x), ty(tip.y));
                    const pr = k.predict();
                    const up = k.update(sm[0], sm[1]);
                    return { x: up[0], y: up[1] };
                });
                const sorted = tips.slice().sort((a,b)=>a.x-b.x);
                let spacingOk = true;
                for (let i=1;i<sorted.length;i++) {
                    const dxc = Math.abs(sorted[i].x - sorted[i-1].x) * canvas.width;
                    if (dxc < widthPx * 0.10) spacingOk = false;
                }

                const inTarget = handCenterX > targetXMin && handCenterX < targetXMax && handCenterY > targetYMin && handCenterY < targetYMax;
                const sizeOk = widthPx >= minWidthPx && widthPx <= maxWidthPx;
                handInCorrectPosition = inTarget && sizeOk && angleOk && spacingOk && varianceScore < 0.01;

                if (!sizeOk) {
                    hints.push(widthPx < minWidthPx ? 'Move closer' : 'Move farther');
                }
                if (!angleOk) hints.push('Rotate palm to face camera');
                if (!spacingOk) hints.push('Spread fingers slightly');
                if (!inTarget) hints.push('Center hand in guide');

                const mappedPreview = agg.map(l => ({ x: tx(l.x), y: ty(l.y), z: l.z }));
                window.drawConnectors(ctx, mappedPreview, window.HAND_CONNECTIONS, { color: '#C9A668', lineWidth: 1 });
                window.drawLandmarks(ctx, mappedPreview, { color: '#E8E8EA', lineWidth: 1, radius: 2 });

                if (handInCorrectPosition) {
                    setAiStatusText('Great! Hold perfectly still.');
                    setPlacementState('ok');
                    const mapped = agg.map(l => ({ x: tx(l.x), y: ty(l.y), z: l.z }));
                    window.drawConnectors(ctx, mapped, window.HAND_CONNECTIONS, { color: '#C9A668', lineWidth: 2 });
                    const labels = ['T','I','M','R','P'];
                    centers.forEach((c, idx) => {
                        ctx.fillStyle = '#C9A668';
                        ctx.font = '12px monospace';
                        ctx.fillText(labels[idx], c.x * canvas.width + 4, c.y * canvas.height - 4);
                    });
                    ctx.fillStyle = '#00E5FF';
                    tips.forEach(pt => {
                        ctx.beginPath();
                        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 3, 0, Math.PI * 2);
                        ctx.fill();
                    });
                    const PALM_INDEX = 5;
                    const PALM_PINKY = 17;
                    const RING_MCP = 13;
                    const RING_PIP = 14;
                    const RING_DIP = 15;
                    const RING_TIP = 16;
                const d = (a: any, b: any) => Math.hypot((a.x-b.x)*canvas.width, (a.y-b.y)*canvas.height);
                const palmPoly = [agg[0], agg[5], agg[9], agg[13], agg[17]];
                let area = 0;
                for (let i = 0; i < palmPoly.length; i++) {
                    const p1 = palmPoly[i];
                    const p2 = palmPoly[(i+1) % palmPoly.length];
                    area += (p1.x*canvas.width) * (p2.y*canvas.height) - (p2.x*canvas.width) * (p1.y*canvas.height);
                }
                area = Math.abs(area) / 2;
                const cov = Math.max(0, Math.min(100, (area / (canvas.width * canvas.height)) * 100));
                setOverlayPalmCov(cov);
                    const palmPx = d(agg[PALM_INDEX], agg[PALM_PINKY]);
                    let pixelToMm = palmPx > 0 ? 79.0 / palmPx : 0;
                    if (calibPxPerMmRef.current) pixelToMm = 1 / calibPxPerMmRef.current;
                    const lenKnucklePx = d(agg[RING_MCP], agg[RING_PIP]);
                    const lenMidPx = d(agg[RING_PIP], agg[RING_DIP]);
                    const lenTipPx = d(agg[RING_DIP], agg[RING_TIP]);
                    const wrist3 = agg[0];
                    const idxMcp = agg[5];
                    const pnkMcp = agg[17];
                    const v1 = { x: idxMcp.x - wrist3.x, y: idxMcp.y - wrist3.y, z: idxMcp.z - wrist3.z };
                    const v2 = { x: pnkMcp.x - wrist3.x, y: pnkMcp.y - wrist3.y, z: pnkMcp.z - wrist3.z };
                    const n = { x: v1.y*v2.z - v1.z*v2.y, y: v1.z*v2.x - v1.x*v2.z, z: v1.x*v2.y - v1.y*v2.x };
                    const nz = Math.abs(n.z);
                    const norm = Math.sqrt(n.x*n.x + n.y*n.y + n.z*n.z) || 1;
                    const cosTilt = nz / norm;
                    const tiltComp = 1 / Math.max(0.85, Math.min(1.0, cosTilt));
                    const widthKnuckleMm = lenKnucklePx * 0.82 * pixelToMm * tiltComp;
                    const widthMidMm = lenMidPx * 0.78 * pixelToMm * tiltComp;
                    const rawTip = lenTipPx * 0.68 * pixelToMm * tiltComp;
                    const widthTipMm = Math.min(widthMidMm * 0.95, rawTip);
                    const now = performance.now();
                    if (now - hudLastRef.current > 100) {
                        hudLastRef.current = now;
                        setLiveDims({ knuckle: widthKnuckleMm, mid: widthMidMm, tip: widthTipMm, cirKnuckle: widthKnuckleMm * Math.PI, cirMid: widthMidMm * Math.PI, cirTip: widthTipMm * Math.PI });
                        const confBase = 50;
                        const conf = Math.max(0, Math.min(100, confBase + (sizeOk ? 10 : 0) + (angleOk ? 15 : 0) + (spacingOk ? 15 : 0) + (inTarget ? 10 : 0)));
                        setOverlayConfidence(conf);
                    }
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = '12px monospace';
                    ctx.fillText(`${widthKnuckleMm.toFixed(1)}mm`, tx(agg[RING_PIP].x)*canvas.width+6, ty(agg[RING_PIP].y)*canvas.height-6);
                    ctx.fillText(`${widthMidMm.toFixed(1)}mm`, tx(agg[RING_DIP].x)*canvas.width+6, ty(agg[RING_DIP].y)*canvas.height-6);
                    ctx.fillText(`${widthTipMm.toFixed(1)}mm`, tx(agg[RING_TIP].x)*canvas.width+6, ty(agg[RING_TIP].y)*canvas.height-6);
                } else {
                    if (!sizeOk) setPlacementState(widthPx < minWidthPx ? 'too_far' : 'too_close');
                    else if (!angleOk) setPlacementState('angle_bad');
                    else if (!spacingOk) setPlacementState('spacing_bad');
                    else if (varianceScore >= 0.0025) hints.push('Hold steady');
                }
            }
            
            if (!handInCorrectPosition) {
                setAiStatusText('Place your hand inside the outline.');
            }
            
            setIsHandDetected(!!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0));
            setAiHints(hints);
            ctx.restore();
            const t1 = performance.now();
            const ms = t1 - t0;
            const pr = perfRef.current;
            pr.frameCount += 1;
            pr.avgMs = pr.avgMs * 0.95 + ms * 0.05;
        };

        const hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        hands.onResults(onResults);
        handsRef.current = hands;

        let frameRequest: number;
        let lastCalibCheck = 0;
        async function detectionLoop() {
            if (isMounted && video.readyState >= 2) {
                if (octx) {
                    offscreen.width = video.videoWidth || video.clientWidth;
                    offscreen.height = video.videoHeight || video.clientHeight;
                    octx.filter = 'contrast(1.1) saturate(1.05) brightness(1.04)';
                    octx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
                    await hands.send({ image: offscreen });
                } else {
                    await hands.send({ image: video });
                }
                const now = performance.now();
                if (now - lastCalibCheck > 500) {
                    lastCalibCheck = now;
                    try {
                        const g = await analyzeCameraFrame(video);
                        if (g?.objectBox) {
                            calibPxPerMmRef.current = g.objectBox.width > 0 ? g.objectBox.width / 85.6 : null;
                        }
                    } catch {}
                }
            }
            if (isMounted) {
                frameRequest = requestAnimationFrame(detectionLoop);
            }
        }
        detectionLoop();
        
        return () => {
            isMounted = false;
            cancelAnimationFrame(frameRequest);
            hands.close();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

    }, [status, isAiScanMethod]);
    
    useEffect(() => {
        if (status !== 'live' || !videoRef.current || !isCardMethod) return;

        let animationFrameId: number;
        const video = videoRef.current;
        const canvas = overlayCanvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;

        const guidanceLoop = async () => {
            if (video.readyState >= 2) { 
                try {
                    const newGuidance = await analyzeCameraFrame(video);
                    setGuidance(newGuidance);
                    if (canvas && ctx) {
                        canvas.width = video.videoWidth || video.clientWidth;
                        canvas.height = video.videoHeight || video.clientHeight;
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        if (newGuidance.objectBox) {
                            const b = newGuidance.objectBox;
                            const pxToMm = 85.6 / b.width;
                            const refPx = Math.max(12, Math.min(Math.round(pxToMm * 20), Math.floor(canvas.width * 0.2)));
                            ctx.strokeStyle = '#C9A668';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(b.x, b.y, b.width, b.height);
                            ctx.fillStyle = '#C9A668';
                            ctx.font = '12px monospace';
                            ctx.fillText('85.6mm', b.x + b.width + 6, b.y + 12);
                            ctx.strokeStyle = '#00E5FF';
                            ctx.strokeRect(b.x + b.width + 12, b.y, refPx, refPx);
                            ctx.fillStyle = '#00E5FF';
                            ctx.fillText('20mm ref', b.x + b.width + 14, b.y + refPx + 14);
                        }
                    }
                } catch (e) {
                    console.warn("Guidance analysis failed for frame:", e);
                }
            }
            animationFrameId = requestAnimationFrame(guidanceLoop);
        };

        guidanceLoop();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [status, isCardMethod]);

    useEffect(() => {
        let isMounted = true;
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const initializeCamera = async () => {
            stopStream();
            setStatus('initializing');
            setCameraError(null);

            try {
                const constraints: MediaStreamConstraints = {
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false
                };
                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                if (!isMounted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }
                
                streamRef.current = mediaStream;
                videoElement.srcObject = mediaStream;

                await new Promise<void>((resolve) => {
                    videoElement.addEventListener('playing', () => {
                         if (!isMounted) return resolve();
                        try {
                            const track = mediaStream.getVideoTracks()[0];
                            if ((track?.getCapabilities() as any)?.zoom) {
                                setZoomRange((track.getCapabilities() as any).zoom);
                                setZoomLevel((track.getSettings() as any).zoom || 1);
                            }
                        } catch (e) {
                            console.warn("Could not read camera zoom capabilities:", e);
                        } finally {
                           if(isMounted) setStatus('live');
                           resolve();
                        }
                    }, { once: true });
                });
            } catch (err: any) {
                console.error("Camera Initialization Error:", err);
                if (!isMounted) return;
                const errors = {
                    NotAllowedError: { title: 'Camera Access Denied', message: "To continue, please allow camera access in your browser's settings for this site.", status: 'permission_denied' },
                    NotFoundError: { title: 'No Camera Found', message: 'No camera was found on your device. Please connect a camera and try again.', status: 'error' },
                    NotReadableError: { title: 'Camera In Use', message: 'The camera is currently in use by another application. Please close other apps and retry.', status: 'error' }
                };
                const errorInfo = errors[err.name as keyof typeof errors] || { title: 'Camera Error', message: 'Could not start the camera. It might be in use by another app or not supported.', status: 'error' };
                setCameraError({ title: errorInfo.title, message: errorInfo.message });
                setStatus(errorInfo.status as CameraStatus);
            }
        };

        initializeCamera();

        return () => {
            isMounted = false;
            stopStream();
        };
    }, [facingMode, restartCounter, stopStream, isAiScanMethod]);


    const handleCapture = useCallback(() => {
        if (videoRef.current && canvasRef.current) {
            setIsFlashing(true);
            setTimeout(() => setIsFlashing(false), 200);

            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            const currentFacingMode = isAiScanMethod ? 'user' : facingMode;
            if (currentFacingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const dataUrl = URL.createObjectURL(blob);
                        setCapturedImage(dataUrl);
                        setStatus('preview');
                        stopStream();
                    }
                },
                'image/jpeg',
                0.95
            );
        }
    }, [stopStream, facingMode, isAiScanMethod]);

    const handleRetake = useCallback(() => {
        if(capturedImage) URL.revokeObjectURL(capturedImage);
        setCapturedImage(null);
        setRestartCounter(c => c + 1);
    }, [capturedImage]);

    const handleUsePhoto = useCallback(async () => {
        if (capturedImage) {
            const blob = await (await fetch(capturedImage)).blob();
            onCapture(blob);
        }
    }, [capturedImage, onCapture]);
    
    const handleToggleFlash = useCallback(async () => {
        if (!streamRef.current) return;
        const track = streamRef.current.getVideoTracks()[0];
        if (track?.getCapabilities().torch) {
            try {
                const newFlashState = !flashOn;
                await track.applyConstraints({ advanced: [{ torch: newFlashState }] });
                setFlashOn(newFlashState);
            } catch(e) { console.error("Failed to toggle flash:", e); }
        } else {
            alert("Flash not available on this device.");
        }
    }, [flashOn]);

    const handleUploadClick = () => fileInputRef.current?.click();
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setCapturedImage(event.target?.result as string);
                setStatus('preview');
                stopStream();
            };
            reader.readAsDataURL(file);
        }
    };

    const renderGuidanceOverlay = () => {
        if (isCardMethod) {
            const isReady = guidance?.message.startsWith('✅');
            const handDetected = guidance?.fingerDetected;
            const cardDetected = guidance?.objectDetected;

            return (
                <>
                    <div className="absolute top-3 left-3 pointer-events-none z-20">
                        <div className={`text-white text-xs bg-black/40 px-3 py-2 rounded-lg shadow transition-all duration-300 ${isReady ? 'ring-1 ring-success/40' : ''}`}>
                            {guidance?.message || 'Align Hand & Card in Outlines'}
                        </div>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none p-8">
                        <div className={`w-3/5 aspect-[1.4] rounded-3xl border-2 transition-all duration-300 ${handDetected ? 'border-bronze-400 border-solid animate-glow-bronze' : 'border-white/50 border-dashed'}`}></div>
                        <div className={`w-2/5 aspect-[1.586] rounded-lg border-2 transition-all duration-300 ${cardDetected ? 'border-bronze-400 border-solid animate-glow-bronze' : 'border-white/50 border-dashed'}`}></div>
                    </div>
                </>
            );
        }
        if (isAiScanMethod) {
            return (
                 <>
                    <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div className={`w-3/5 aspect-square rounded-2xl border-2 ${isHandDetected ? 'border-bronze-400 animate-glow-bronze' : 'border-white/40 border-dashed'}`}></div>
                    </div>
                </>
            );
        }
        return null;
    };
    
    const renderControls = () => {
        const isCaptureDisabled = (isCardMethod && guidance?.message !== "✅ Perfect! Tap to capture") || (isAiScanMethod && !isHandDetected);
        
        return (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent z-20">
                {isAiScanMethod && (
                    <div className="text-center mb-4 transition-opacity duration-300 max-w-md mx-auto" key={aiStatusText}>
                        <p className={`font-semibold p-2 rounded-lg inline-block ${isHandDetected ? 'text-success' : 'text-white'}`}>{aiStatusText}</p>
                        {aiHints.length > 0 && (
                          <div className="mt-2 text-sm text-silver-300">
                            {aiHints.join(' · ')}
                          </div>
                        )}
                    </div>
                )}
                <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-4 items-center">
                        <button onClick={() => setGridOn(!gridOn)} className="control-btn" aria-pressed={gridOn}><GridIcon className={`${gridOn ? 'text-bronze-400' : 'text-white'}`} /></button>
                        <button onClick={handleToggleFlash} className="control-btn" aria-pressed={flashOn}><ZapIcon className={`${flashOn ? 'text-bronze-400' : 'text-white'}`} /></button>
                    </div>
                    <button 
                        onClick={handleCapture} 
                        disabled={isCaptureDisabled}
                        className="w-20 h-20 rounded-full bg-white border-4 border-black/20 ring-4 ring-white/30 shadow-2xl transition-all duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Capture Photo"
                    />
                    <div className="flex flex-col gap-4 items-center">
                        <button onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')} className="control-btn" aria-label="Switch camera"><RefreshCwIcon /></button>
                        <button onClick={handleUploadClick} className="control-btn" aria-label="Upload photo"><UploadIcon /></button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,image/heic,image/heif" className="hidden" />
                    </div>
                </div>
            </div>
        );
    };
    
    const renderPreview = () => (
        <div className="w-full h-full relative animate-[fadeIn_0.3s_ease-out]">
            {capturedImage && <img src={capturedImage} alt="Captured preview" className="w-full h-full object-contain" />}
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6">
                <Button onClick={handleRetake} variant="secondary" className="!px-8 !py-4 text-lg">Retake</Button>
                <Button onClick={handleUsePhoto} variant="primary" className="!px-8 !py-4 text-lg">Use This Photo <ArrowRightIcon className="inline ml-2" /></Button>
            </div>
        </div>
    );

    const renderInitialState = () => (
        <div className="flex flex-col items-center justify-center text-center p-8">
            {status === 'initializing' && <>
                <div className="relative w-16 h-16 mb-4">
                    <div className="absolute inset-0 border-4 border-platinum-300/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-t-platinum-300 rounded-full animate-spin"></div>
                </div>
                <p className="text-lg">Starting Camera...</p>
            </>}
            {(status === 'permission_denied' || status === 'error') && cameraError && <>
                <h3 className={`text-2xl font-semibold mb-2 ${status === 'error' ? 'text-error' : ''}`}>{cameraError.title}</h3>
                <p className="max-w-md mb-6 text-silver-400">{cameraError.message}</p>
                <div className="flex gap-4">
                    <Button onClick={onCancel} variant="secondary">Go Back</Button>
                    <Button onClick={() => setRestartCounter(c => c + 1)}>
                        {status === 'permission_denied' ? 'Retry Access' : 'Try Again'}
                    </Button>
                </div>
            </>}
        </div>
    );
    
    const HelpModal = () => (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-30 flex items-center justify-center p-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="bg-midnight-500 border border-platinum-300/20 rounded-2xl p-6 max-w-sm w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display text-2xl text-silver-100">Quick Guide</h3>
                    <button onClick={() => setShowHelp(false)} className="text-silver-400 hover:text-white"><CloseIcon/></button>
                </div>
                {isAiScanMethod ? (
                    <div className="space-y-3 text-silver-300">
                        <p>1. Use your front-facing camera for the AI Scan.</p>
                        <p>2. Hold your hand flat, with your palm facing the camera.</p>
                        <p>3. Position your hand inside the guide outline until it glows.</p>
                        <p>4. Hold steady until the capture button is enabled, then tap to measure!</p>
                    </div>
                ) : (
                     <div className="space-y-3 text-silver-300">
                        <p>1. Place a known-size reference object on a flat, well-lit surface.</p>
                        <p>2. Place your ring finger next to the object.</p>
                        <p>3. Align both within the on-screen guides.</p>
                        <p>4. Follow the real-time feedback and tap to capture when ready!</p>
                    </div>
                )}
            </div>
        </div>
    );

    const SettingsModal = () => (
         <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-30 flex items-center justify-center p-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="bg-midnight-500 border border-platinum-300/20 rounded-2xl p-6 max-w-sm w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display text-2xl text-silver-100">Settings</h3>
                    <button onClick={() => setShowSettings(false)} className="text-silver-400 hover:text-white"><CloseIcon/></button>
                </div>
                 <div className="space-y-4 text-silver-300">
                    <div className="flex justify-between items-center">
                        <label htmlFor="grid-toggle">Show Alignment Grid</label>
                        <button
                            id="grid-toggle"
                            role="switch"
                            aria-checked={gridOn}
                            onClick={() => setGridOn(!gridOn)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${gridOn ? 'bg-bronze-400' : 'bg-midnight-400'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${gridOn ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <p className="text-sm text-silver-500 pt-2 border-t border-platinum-300/10">More settings will be available soon.</p>
                </div>
            </div>
        </div>
    );

    const currentFacingMode = facingMode;

    return (
        <div className="fixed inset-0 bg-midnight-900 text-silver-200 z-50 flex flex-col items-center justify-center animate-[fadeInUp_0.3s_ease-out]">
            {isFlashing && <div className="absolute inset-0 bg-white z-50 animate-fadeOut"></div>}
            {showHelp && <HelpModal />}
            {showSettings && <SettingsModal />}
            <canvas ref={canvasRef} className="hidden"></canvas>
            
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${status === 'live' ? 'opacity-100' : 'opacity-0'} ${currentFacingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            {status === 'live' && (
                <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/40 pointer-events-none"></div>
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20">
                        <button onClick={onCancel} className="control-btn"><ChevronLeftIcon /></button>
                        {zoomRange && <div className="bg-black/50 text-white text-xs font-mono px-3 py-1 rounded-full backdrop-blur-sm">{zoomLevel.toFixed(1)}x</div>}
                        <div className="flex items-center gap-3">
                           <button className="control-btn" onClick={() => setShowSettings(true)}><SettingsIcon /></button>
                           <button className="control-btn" onClick={() => setShowHelp(true)}><HelpCircleIcon /></button>
                        </div>
                    </div>
                    {renderGuidanceOverlay()}
                    {gridOn && (
                        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-10">
                            {[...Array(9)].map((_, i) => <div key={i} className="border border-white/20"></div>)}
                        </div>
                    )}
                    {isCardMethod && guidance && (
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-sm p-4 pointer-events-none z-10">
                            <div className="text-white text-sm bg-black/60 p-4 rounded-lg backdrop-blur-sm grid grid-cols-2 gap-x-4 gap-y-3">
                                <FeedbackItem status={guidance.lighting === 'good' ? 'good' : 'warn'} goodText="Lighting Good" warnText="Poor Lighting" />
                                <FeedbackItem status={guidance.quality === 'good' ? 'good' : 'warn'} goodText="Hold Steady" warnText="Blurry Image" />
                                <FeedbackItem status={guidance.objectDetected ? 'good' : 'warn'} goodText="Reference Object Visible" warnText="Object Not Found" />
                                <FeedbackItem status={guidance.fingerDetected ? 'good' : 'warn'} goodText="Finger Visible" warnText="Finger Not Clear" />
                            </div>
                        </div>
                    )}
                    {isAiScanMethod && (
                        <>
                          <div className="absolute sm:bottom-28 bottom-32 right-3 pointer-events-none z-20">
                            <div className="bg-black/40 text-white text-xs px-3 py-2 rounded-lg shadow space-y-1">
                              <div className="flex items-center gap-2"><span>Avg frame</span><span className="font-mono">{perfRef.current.avgMs.toFixed(1)}ms</span></div>
                              <div className="flex items-center gap-2"><span>Confidence</span>
                                <div className="w-24 h-1.5 bg-white/20 rounded"><div className="h-1.5 bg-success rounded" style={{ width: `${overlayConfidence}%` }}></div></div>
                              </div>
                              <div className="flex items-center gap-2"><span>Hand</span><span className="font-mono">{overlayHanded}</span></div>
                              <div className="flex items-center gap-2"><span>Palm cov</span><span className="font-mono">{overlayPalmCov.toFixed(0)}%</span></div>
                            </div>
                          </div>
                          {liveDims && (
                            <div className="absolute sm:bottom-28 bottom-32 left-3 pointer-events-none z-20">
                              <div className="bg-black/40 text-white text-xs px-3 py-2 rounded-lg shadow space-y-1">
                                <div className="font-semibold">Measurements</div>
                                <div>Knuckle: {liveDims.knuckle.toFixed(1)}mm · {liveDims.cirKnuckle.toFixed(1)}mm</div>
                                <div>Mid: {liveDims.mid.toFixed(1)}mm · {liveDims.cirMid.toFixed(1)}mm</div>
                                <div>Tip: {liveDims.tip.toFixed(1)}mm · {liveDims.cirTip.toFixed(1)}mm (excl nail)</div>
                              </div>
                            </div>
                          )}
                        </>
                    )}
                    {renderControls()}
                </>
            )}

            {status === 'preview' && renderPreview()}

            {(status === 'initializing' || status === 'permission_denied' || status === 'error') && renderInitialState()}
        </div>
    );
};

const style = document.createElement('style');
style.innerHTML = `
.control-btn {
    width: 48px; height: 48px; border-radius: 9999px;
    background-color: rgba(22,22,29,0.5);
    display: flex; align-items: center; justify-content: center;
    color: white; transition: all 0.2s; backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
}
.control-btn:hover { background-color: rgba(22,22,29,0.7); transform: scale(1.1); }
.control-btn:active { transform: scale(0.95); }
.control-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;
document.head.appendChild(style);
