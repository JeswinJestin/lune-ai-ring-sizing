import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from './Button';
// Fix: Import missing ArrowRightIcon.
import { CloseIcon, HeartIcon, CameraIcon, SlidersIcon, ArrowUpIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, RefreshCwIcon, SaveIcon, TrashIcon } from './icons/UtilIcons';
import type { MeasurementResult, Landmark } from '../types';
import { ARLayerCatalog, type ARLayerRing } from '../lib/ar/catalog';

const rings: ARLayerRing[] = ARLayerCatalog;

interface Ring extends ARLayerRing {}

interface ARTryOnProps {
  result: MeasurementResult;
  onBack: () => void;
}

type RingSettings = {
  positionOffset: { x: number; y: number };
  rotation: number;
  zoom: number;
};

// Helper to calculate distance between two 3D landmarks
const getDistance = (p1: Landmark, p2: Landmark): number => {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
};

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

const SWIPE_THRESHOLD = 100; // pixels to swipe down to dismiss

export const ARTryOn = ({ result, onBack }: ARTryOnProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<any>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const screenshotCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef(result);

  const [selectedRing, setSelectedRing] = useState(rings[0]);
  const [error, setError] = useState<string | null>(null);
  const [favoriteRings, setFavoriteRings] = useState<number[]>([]);
  
  // State for dynamic AR positioning and scaling
  const [dynamicRingSize, setDynamicRingSize] = useState<number | null>(null);
  const [ringPosition, setRingPosition] = useState<{ x: number, y: number } | null>(null);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  // State for user adjustments
  const [positionOffset, setPositionOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const rotationEmaRef = useRef<number>(0);
  const [isPalmFacing, setIsPalmFacing] = useState<boolean>(false);
  const [zoom, setZoom] = useState(1);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [savedSettings, setSavedSettings] = useState<Record<number, RingSettings>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle');
  const [gemClipPath, setGemClipPath] = useState<string | null>(null);
  const [gemOpacity, setGemOpacity] = useState<number>(1);
  const ringContainerRef = useRef<HTMLDivElement>(null);
  const gemImgRef = useRef<HTMLImageElement>(null);
  const ringSizeRef = useRef<number | null>(null);

  // State for swipe-to-dismiss gesture
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchDeltaY, setTouchDeltaY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const onResults = useCallback((results: any) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && videoRef.current) {
        setIsHandDetected(true);
        const landmarks = results.multiHandLandmarks[0];
        const handed = (results.multiHandedness && results.multiHandedness[0] && results.multiHandedness[0].label) || 'Unknown';
        const video = videoRef.current;
        const cs = getComputedStyle(video);
        const mirrored = cs.transform && cs.transform.includes('matrix') ? parseFloat(cs.transform.split('(')[1].split(',')[0]) < 0 : true;
        const tx = (x: number) => (mirrored ? (1 - x) : x);

        // --- Dynamic Scaling Logic ---
        const palmWidthInPixels = getDistance(landmarks[5], landmarks[17]);
        const AVG_PALM_WIDTH_MM = 79.0;
        
        if (palmWidthInPixels > 0) {
            const livePixelsPerMm = (palmWidthInPixels * video.clientWidth) / AVG_PALM_WIDTH_MM;
            const newRingSizePx = resultRef.current.fingerDiameter_mm * livePixelsPerMm;
            ringSizeRef.current = newRingSizePx;
            if (ringContainerRef.current) {
              const size = (newRingSizePx ?? 0) || 0;
              if (size > 0) {
                ringContainerRef.current.style.width = `${size}px`;
                ringContainerRef.current.style.height = `${size}px`;
              }
            }
        }

        const RING_MCP = landmarks[13];
        const RING_PIP = landmarks[14];
        const RING_DIP = landmarks[15];
        const RING_TIP = landmarks[16];
        const videoWidth = video.clientWidth;
        const videoHeight = video.clientHeight;
        
        const cx = tx(((RING_PIP.x + RING_DIP.x) / 2)) * videoWidth;
        const cy = ((RING_PIP.y + RING_DIP.y) / 2) * videoHeight;
        if (!ringPosition) setRingPosition({ x: cx, y: cy });
        if (ringContainerRef.current) {
          ringContainerRef.current.style.top = `${cy + positionOffset.y}px`;
          ringContainerRef.current.style.left = `${cx + positionOffset.x}px`;
        }

        const dx = (tx(RING_TIP.x) - tx(RING_MCP.x)) * videoWidth;
        const dy = (RING_TIP.y - RING_MCP.y) * videoHeight;
        const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        const desiredRotation = angleDeg + 90; // band perpendicular to finger axis
        const ema = rotationEmaRef.current * 0.7 + desiredRotation * 0.3;
        rotationEmaRef.current = ema;
        if (ringContainerRef.current) {
          const rot = ema + rotation;
          ringContainerRef.current.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
        }

        const palmZAvg = (landmarks[0].z + landmarks[5].z + landmarks[9].z + landmarks[13].z + landmarks[17].z) / 5;
        const tipZAvg = (landmarks[4].z + landmarks[8].z + landmarks[12].z + landmarks[16].z + landmarks[20].z) / 5;
        const palmFacing = palmZAvg < tipZAvg;
        setIsPalmFacing(palmFacing);

        const pixDist2D = (a: any, b: any) => Math.hypot((tx(a.x) - tx(b.x)) * videoWidth, (a.y - b.y) * videoHeight);
        const fingerWidthPx = pixDist2D(RING_PIP, RING_DIP) * 0.78;
        const axisLen = Math.hypot(dx, dy) || 1;
        const ux = dx / axisLen; // along finger
        const uy = dy / axisLen;
        const pxv = { x: -uy, y: ux }; // perpendicular unit
        const halfW = Math.max(4, fingerWidthPx / 2);
        const p1 = { x: cx + pxv.x * halfW, y: cy + pxv.y * halfW };
        const p2 = { x: cx - pxv.x * halfW, y: cy - pxv.y * halfW };
        const occlLength = Math.max(halfW * 1.4, fingerWidthPx);
        const p3 = { x: p2.x + ux * occlLength, y: p2.y + uy * occlLength };
        const p4 = { x: p1.x + ux * occlLength, y: p1.y + uy * occlLength };

        const clip = `polygon(${p1.x}px ${p1.y}px, ${p2.x}px ${p2.y}px, ${p3.x}px ${p3.y}px, ${p4.x}px ${p4.y}px)`;
        if (gemImgRef.current) {
          if (palmFacing) {
            gemImgRef.current.style.opacity = '0';
          } else {
            const depthDelta = tipZAvg - palmZAvg;
            const vis = Math.max(0.25, Math.min(1.0, 0.5 + depthDelta * 1.5));
            gemImgRef.current.style.opacity = `${vis}`;
          }
          gemImgRef.current.style.clipPath = clip;
          const light = Math.max(0.85, Math.min(1.15, 1.0 + (tipZAvg - palmZAvg) * 0.6));
          gemImgRef.current.style.filter = `drop-shadow(0 3px 6px rgba(0,0,0,0.4)) saturate(1.05) brightness(${light})`;
        }
        
    } else {
        setIsHandDetected(false);
        setRingPosition(null);
        if (gemImgRef.current) {
          gemImgRef.current.style.clipPath = '';
          gemImgRef.current.style.opacity = '1';
          gemImgRef.current.style.filter = 'drop-shadow(0 3px 6px rgba(0,0,0,0.4)) saturate(1.05)';
        }
    }
  }, []);
  
  useEffect(() => {
    if (typeof window.Hands === 'undefined' || typeof window.Camera === 'undefined') {
        setError("AI libraries could not be loaded. Please check your connection and try again.");
        return;
    }
    const hands = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);
    handsRef.current = hands;

    let camera: any = null;
    if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
                if(videoRef.current) {
                    await hands.send({ image: videoRef.current });
                }
            },
            width: 1280,
            height: 720,
            facingMode: 'user'
        });
        camera.start().catch((err: Error) => {
            console.error("Camera start error:", err);
            setError("Could not access camera. Please check permissions.");
        });

        return () => {
            if (camera) {
              camera.stop();
            }
            hands.close();
        };
    }
  }, [onResults]);


  useEffect(() => {
    try {
      const storedFavorites = localStorage.getItem('lune_favorite_rings');
      if (storedFavorites) {
        setFavoriteRings(JSON.parse(storedFavorites));
      }
      const storedSettings = localStorage.getItem('lune_ring_settings');
      if (storedSettings) {
        setSavedSettings(JSON.parse(storedSettings));
      }
    } catch (e) {
      console.error("Failed to parse data from localStorage", e);
    }
  }, []);

  const toggleFavorite = (ringId: number) => {
    setFavoriteRings(prevFavorites => {
      const newFavorites = prevFavorites.includes(ringId)
        ? prevFavorites.filter(id => id !== ringId)
        : [...prevFavorites, ringId];
      localStorage.setItem('lune_favorite_rings', JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  const sortedRings = useMemo(() => {
    return [...rings].sort((a, b) => {
        const aIsFav = favoriteRings.includes(a.id);
        const bIsFav = favoriteRings.includes(b.id);
        if (aIsFav && !bIsFav) return -1;
        if (!aIsFav && bIsFav) return 1;
        return 0;
    });
  }, [favoriteRings]);

  const handleRingSelect = useCallback((ring: Ring) => {
    setSelectedRing(ring);
    
    const settings = savedSettings[ring.id];
    if (settings) {
      setPositionOffset(settings.positionOffset);
      setRotation(settings.rotation);
      setZoom(settings.zoom);
    } else {
      setPositionOffset({ x: 0, y: 0 });
      setRotation(0);
      setZoom(1);
    }
    
    const element = document.getElementById(`ring-item-${ring.id}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [savedSettings]);
  
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    setTouchStartY(clientY);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    const delta = clientY - touchStartY;
    setTouchDeltaY(Math.max(0, delta));
  }, [isDragging, touchStartY]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    if (touchDeltaY > SWIPE_THRESHOLD) {
      onBack();
    }
    setIsDragging(false);
    setTouchDeltaY(0);
    setTouchStartY(0);
  }, [isDragging, touchDeltaY, onBack]);
  
  const AVG_DIAMETER_MM = 17.3;
  const BASE_VISUAL_SIZE_PX = 80;
  const heuristicScale = result.ringSize.diameter_mm / AVG_DIAMETER_MM;
  const fallbackRingSize = BASE_VISUAL_SIZE_PX * heuristicScale;
  
  const baseRingSize = dynamicRingSize ?? fallbackRingSize;
  const holeRatio = selectedRing.innerHoleRatio ?? 0.60;
  const requiredOuterPx = baseRingSize / holeRatio; // ensures ≥2mm material thickness visually
  const finalRingSize = requiredOuterPx * zoom;

  const handleScreenshot = () => {
    if (!videoRef.current || !screenshotCanvasRef.current || !selectedRing || !ringPosition) {
      alert("Please ensure your hand is visible to take a screenshot.");
      return;
    }

    const video = videoRef.current;
    const canvas = screenshotCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const bandImage = new Image();
    const gemImage = new Image();
    bandImage.src = selectedRing.layers.band;
    gemImage.src = selectedRing.layers.gem;

    bandImage.onload = () => {
      const draw = () => {
        const finalX = ringPosition.x + positionOffset.x;
        const finalY = ringPosition.y + positionOffset.y;
        
        ctx.translate(finalX, finalY);
        ctx.rotate(rotation * Math.PI / 180);
        if (bandImage.complete) ctx.drawImage(bandImage, -finalRingSize / 2, -finalRingSize / 2, finalRingSize, finalRingSize);
        if (gemImage.complete) ctx.drawImage(gemImage, -finalRingSize / 2, -finalRingSize / 2, finalRingSize, finalRingSize);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 300);

        const link = document.createElement('a');
        link.download = 'lune-try-on.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      if (gemImage.complete) draw(); else gemImage.onload = draw;
    };
    
    bandImage.onerror = () => {
      alert("Could not load ring image for screenshot. Please try again.");
    };
  };

  const handleSaveSettings = () => {
    const newSettings = {
      ...savedSettings,
      [selectedRing.id]: { positionOffset, rotation, zoom }
    };
    setSavedSettings(newSettings);
    localStorage.setItem('lune_ring_settings', JSON.stringify(newSettings));
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('idle'), 1500);
  };

  const handleClearSettings = () => {
    const newSettings = { ...savedSettings };
    delete newSettings[selectedRing.id];
    setSavedSettings(newSettings);
    localStorage.setItem('lune_ring_settings', JSON.stringify(newSettings));
    setPositionOffset({ x: 0, y: 0 });
    setRotation(0);
    setZoom(1);
  };

  const resetPosition = () => {
    const saved = savedSettings[selectedRing.id];
    setPositionOffset(saved ? saved.positionOffset : { x: 0, y: 0 });
  };
  const resetRotation = () => {
    const saved = savedSettings[selectedRing.id];
    setRotation(saved ? saved.rotation : 0);
  };
  const resetZoom = () => {
    const saved = savedSettings[selectedRing.id];
    setZoom(saved ? saved.zoom : 1);
  };

  if (error) {
    return (
      <div className="text-center p-8 bg-midnight-500 rounded-lg shadow-lg">
        <p className="text-error mb-4">{error}</p>
        <Button onClick={onBack} variant="secondary">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-midnight-900 relative flex items-center justify-center animate-[fadeInUp_0.5s_ease-out] overflow-hidden">
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"></video>
      <canvas ref={screenshotCanvasRef} className="hidden"></canvas>
      {isFlashing && <div className="absolute inset-0 bg-white/80 z-50 animate-fadeOut pointer-events-none"></div>}
      
      <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-yellow-500/20 text-yellow-300 text-xs px-3 py-1 rounded-full border border-yellow-500/40 backdrop-blur-sm z-20">
        This feature is currently in its testing stage.
      </div>

      {!isHandDetected && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 p-6 rounded-2xl text-white text-center pointer-events-none z-10 backdrop-blur-lg border border-white/10">
            <p className="font-semibold text-lg">Show your hand to the camera</p>
            <p className="text-sm opacity-80 mt-1">We'll scale and place the ring automatically!</p>
         </div>
      )}
      
      {selectedRing && ringPosition && (
        <div 
          ref={ringContainerRef}
          className="absolute pointer-events-none flex items-center justify-center transition-transform duration-50 ease-linear will-change-transform contain-layout"
          style={{ 
            width: `${finalRingSize}px`, 
            height: `${finalRingSize}px`,
            top: `${ringPosition.y + positionOffset.y}px`,
            left: `${ringPosition.x + positionOffset.x}px`,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`
          }}
        >
            <img src={selectedRing.layers.band} alt={selectedRing.name} className="absolute inset-0 w-full h-full" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }} />
            <img 
              ref={gemImgRef}
              src={selectedRing.layers.gem} 
              alt={selectedRing.name} 
              className="absolute inset-0 w-full h-full"
              style={{ 
                opacity: gemOpacity, 
                clipPath: gemClipPath || undefined, 
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4)) saturate(1.05)'
              }} 
            />
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-silver-300 bg-black/40 px-2 py-1 rounded">
              {Math.round((selectedRing.targetCoveragePct ?? 80))}% coverage · ≥{(selectedRing.minThickness_mm ?? 2).toFixed(1)}mm
            </div>
        </div>
      )}
      
      <div className="absolute top-5 right-5 z-20 flex flex-col gap-3">
        <button onClick={onBack} className="w-12 h-12 rounded-full bg-midnight-400/60 backdrop-blur-xl border border-platinum-300/20 flex items-center justify-center text-silver-300 transition-all duration-300 hover:border-platinum-300/40 hover:bg-midnight-400/80 hover:scale-110 active:scale-95" aria-label="Close AR view">
          <CloseIcon className="w-6 h-6" />
        </button>
        <button onClick={handleScreenshot} className="w-12 h-12 rounded-full bg-midnight-400/60 backdrop-blur-xl border border-platinum-300/20 flex items-center justify-center text-silver-300 transition-all duration-300 hover:border-platinum-300/40 hover:bg-midnight-400/80 hover:scale-110 active:scale-95" aria-label="Take Screenshot">
          <CameraIcon className="w-6 h-6" />
        </button>
      </div>

      {showAdjustments && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 w-full max-w-sm mx-auto bg-midnight-600/90 backdrop-blur-xl rounded-2xl p-4 space-y-4 z-20 border border-white/10 animate-[fadeInUp_0.3s_ease-out]">
            <div className="space-y-4">
                <div>
                    <label className="block text-center text-silver-300 text-xs font-medium uppercase tracking-wider mb-2">Position</label>
                    <div className="grid grid-cols-3 gap-2 items-center justify-items-center w-36 mx-auto text-silver-200">
                        <div></div>
                        <button onClick={() => setPositionOffset(p => ({...p, y: p.y - 2}))} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Nudge Up"><ArrowUpIcon className="w-5 h-5"/></button>
                        <div></div>
                        <button onClick={() => setPositionOffset(p => ({...p, x: p.x - 2}))} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Nudge Left"><ArrowLeftIcon className="w-5 h-5"/></button>
                        <button onClick={resetPosition} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Reset Position"><RefreshCwIcon className="w-5 h-5"/></button>
                        <button onClick={() => setPositionOffset(p => ({...p, x: p.x + 2}))} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Nudge Right"><ArrowRightIcon className="w-5 h-5"/></button>
                        <div></div>
                        <button onClick={() => setPositionOffset(p => ({...p, y: p.y + 2}))} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Nudge Down"><ArrowDownIcon className="w-5 h-5"/></button>
                        <div></div>
                    </div>
                </div>
                <div>
                    <label className="block text-center text-silver-300 text-xs font-medium uppercase tracking-wider mb-2">Rotation</label>
                    <div className="flex items-center gap-2">
                      <input
                          type="range"
                          min="-45"
                          max="45"
                          step="1"
                          value={rotation}
                          onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                          className="w-full h-2 bg-midnight-400 rounded-lg appearance-none cursor-pointer range-lg accent-bronze-400"
                      />
                      <button onClick={resetRotation} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Reset Rotation"><RefreshCwIcon className="w-5 h-5"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-center text-silver-300 text-xs font-medium uppercase tracking-wider mb-2">Adjust Scale (Zoom)</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="0.75"
                            max="1.25"
                            step="0.01"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-2 bg-midnight-400 rounded-lg appearance-none cursor-pointer range-lg accent-bronze-400"
                        />
                        <button onClick={resetZoom} className="p-2 bg-midnight-500/50 rounded-md hover:bg-midnight-500 transition-colors" aria-label="Reset Scale"><RefreshCwIcon className="w-5 h-5"/></button>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 pt-4 border-t border-platinum-300/10">
                <Button onClick={handleSaveSettings} variant="secondary" className="w-full !py-2 text-sm">
                  {saveStatus === 'saving' ? 'Saved!' : <><SaveIcon className="w-4 h-4 mr-2"/> Save Fit</>}
                </Button>
                {savedSettings[selectedRing.id] && (
                  <Button onClick={handleClearSettings} variant="ghost" className="w-full !py-2 text-sm !text-error/80 hover:!text-error hover:!bg-error/10">
                    <TrashIcon className="w-4 h-4 mr-2"/> Clear Saved Fit
                  </Button>
                )}
            </div>
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-4 flex flex-col gap-4 cursor-grab active:cursor-grabbing"
        style={{
            transform: `translateY(${touchDeltaY}px)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
        onTouchEnd={handleDragEnd}
        onMouseDown={(e) => handleDragStart(e.clientY)}
        onMouseMove={(e) => handleDragMove(e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="w-full flex justify-center">
          <button 
            onClick={() => setShowAdjustments(s => !s)} 
            className="bg-midnight-600/80 backdrop-blur-lg rounded-xl p-3 text-silver-200 font-medium flex items-center justify-center border border-platinum-300/10 hover:border-platinum-300/30 transition-colors"
          >
            <SlidersIcon className="w-5 h-5 mr-2" />
            Adjust Position & Rotation
          </button>
        </div>

        <div ref={carouselRef} className="w-full overflow-x-auto pb-4 pt-2 px-4 snap-x snap-mandatory flex gap-3 no-scrollbar" style={{WebkitOverflowScrolling: 'touch'}}>
          {sortedRings.map(ring => (
            <div
              key={ring.id}
              id={`ring-item-${ring.id}`}
              onClick={() => handleRingSelect(ring)}
              className={`relative snap-center flex-shrink-0 w-24 h-32 rounded-2xl p-2 cursor-pointer transition-all duration-300 border-2 bg-black/20 ${selectedRing.id === ring.id ? 'border-bronze-400 scale-105' : 'border-platinum-300/20'}`}
            >
              <div className="w-full h-20 rounded-xl bg-midnight-500 mb-1 flex items-center justify-center overflow-hidden">
                <img src={ring.layers.band} alt={ring.name} className="w-16 h-16 object-contain" />
              </div>
              <p className="text-xs text-center text-silver-200 font-medium truncate">{ring.name}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(ring.id);
                }}
                className={`absolute top-0 right-0 m-1 p-1 rounded-full transition-colors ${favoriteRings.includes(ring.id) ? 'text-error' : 'text-silver-400 hover:text-white'}`}
                aria-label={favoriteRings.includes(ring.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <HeartIcon filled={favoriteRings.includes(ring.id)} className="w-5 h-5"/>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
