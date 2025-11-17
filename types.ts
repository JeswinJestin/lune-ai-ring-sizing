

export type SizingMethod = 'reference-object' | 'existing-ring' | 'phone-screen' | 'printable' | 'ai-scan';

export interface RingSize {
  us: number | string;
  uk: string;
  eu: number;
  diameter_mm: number;
  circumference_mm: number;
}

export interface CalibrationResult {
  fingerDiameter_mm: number;
  fingerCircumference_mm: number;
  confidence: number;
  imagePreviewUrl: string;
}

export interface MeasurementResult extends CalibrationResult {
  ringSize: RingSize;
  zones?: Array<{
    name: string;
    width_mm: number;
    circumference_mm: number;
    confidence: number;
    error_mm: number;
    points?: Array<{ x: number; y: number }>;
  }>;
}

export type Landmark = {
  x: number;
  y: number;
  z: number;
};

// --- New Types for Image Analysis Pipeline ---

export type Contour = Array<{x: number; y: number}>;

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ReferenceObject {
  type: 'credit_card' | 'phone' | 'coin' | 'ruler' | 'ring';
  dimensions: { width: number; height: number } | null; // in mm
  confidence: number;
  boundingBox: BoundingBox;
  contour: Contour;
}

export interface FingerMeasurement {
  width_pixels: number;
  width_mm?: number;
  circumference_mm?: number;
  confidence: number;
  boundingBox: BoundingBox;
}

export interface AnalysisResult {
    size: RingSize;
    confidence: number;
    method: 'reference_object' | 'no_reference_fallback';
    debugInfo: {
        pixelToMmRatio?: number;
        fingerWidthPx: number;
        referenceObject?: ReferenceObject['type'];
        handedness?: 'Left' | 'Right';
        palmCoveragePct?: number;
        exclusions?: { nailExcluded: boolean };
    };
    zones?: Array<{
        name: string;
        width_mm: number;
        circumference_mm: number;
        confidence: number;
        error_mm: number;
        points?: Array<{ x: number; y: number }>;
    }>;
    visualization?: {
        points?: Array<{ x: number; y: number }>;
        lines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    };
}

export interface CameraGuidance {
  lighting: 'good' | 'dark' | 'bright';
  quality: 'good' | 'blurry';
  objectDetected: boolean;
  fingerDetected: boolean;
  distance: 'good' | 'closer' | 'back';
  message: string;
  objectBox?: BoundingBox;
}
