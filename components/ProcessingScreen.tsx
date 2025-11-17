
import React, { useState, useEffect } from 'react';
import type { SizingMethod } from '../types';

interface ProcessingScreenProps {
  method: SizingMethod | null;
  progress?: number;
  message?: string;
}

const analysisSteps: Record<SizingMethod, string[]> = {
  'reference-object': [
    "Detecting reference object...",
    "Calibrating pixel-to-mm ratio...",
    "Isolating finger from background...",
    "Measuring finger width at knuckle...",
    "Finalizing measurement..."
  ],
  'ai-scan': [
    "Detecting hand landmarks...",
    "Analyzing hand geometry...",
    "Calibrating from palm geometry...",
    "Calculating finger-to-knuckle ratios...",
    "Cross-referencing sizing database...",
    "Finalizing measurement..."
  ],
  'existing-ring': [
    "Analyzing diameter...",
    "Calculating circumference...",
    "Matching to size chart..."
  ],
  'phone-screen': [
    "Accessing device dimensions...",
    "Calibrating screen reference...",
    "Estimating finger size..."
  ],
  'printable': [], // Not applicable
};

export const ProcessingScreen = ({ method, progress = 0, message }: ProcessingScreenProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = method ? analysisSteps[method] : ["Processing your measurement..."];
  
  useEffect(() => {
    if (steps.length <= 1) return;

    const interval = setInterval(() => {
      setStepIndex(prevIndex => {
        if (prevIndex < steps.length - 1) {
          return prevIndex + 1;
        }
        clearInterval(interval);
        return prevIndex;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [steps]);

  return (
    <div className="w-full max-w-3xl mx-auto p-8 text-center animate-[fadeInUp_0.3s_ease-out]">
      <div className="flex flex-col items-center justify-center">
        <div className="relative w-28 h-28 mb-8">
          <svg className="absolute inset-0" viewBox="0 0 100 100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <circle cx="50" cy="50" r="45" stroke="rgba(206,206,210,0.2)" strokeWidth="6" fill="none" />
            <circle cx="50" cy="50" r="45" stroke="#C9A668" strokeWidth="6" fill="none" strokeDasharray={`${Math.max(0, Math.min(100, progress))} 100`} transform="rotate(-90 50 50)" />
            <text x="50" y="55" textAnchor="middle" fill="#E8E8EA" fontSize="16" fontFamily="monospace">{Math.round(progress)}%</text>
          </svg>
        </div>
        <h2 className="font-display text-3xl text-silver-100 mb-4">{message || 'Analyzing your perfect fit...'}</h2>
        <div className="w-full bg-midnight-400/70 rounded-full h-1.5 mb-2">
          <div className="bg-bronze-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}></div>
        </div>
        <div className="text-silver-400 max-w-md h-12 transition-opacity duration-300">
          <p key={steps[stepIndex]}>{steps[stepIndex]}</p>
        </div>
      </div>
    </div>
  );
};
