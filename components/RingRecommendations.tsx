import React from 'react';
import type { RingData } from '../lib/ringData';
import { Button } from './Button';
import { ChevronLeftIcon } from './icons/UtilIcons';

interface RingRecommendationsProps {
  rings: RingData[];
  onBack: () => void;
}

export const RingRecommendations = ({ rings, onBack }: RingRecommendationsProps) => {
  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 text-center animate-[fadeInUp_0.5s_ease-out]">
      <div className="relative mb-12">
        <h1 className="font-display text-display-md md:text-display-lg text-silver-100">Styles for You</h1>
        <p className="text-lg text-silver-400 mt-2">Based on your size, we think you'll love these styles.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {rings.map((ring, index) => (
          <div 
            key={ring.id}
            className="group relative bg-gradient-to-br from-midnight-500 to-midnight-700 border border-platinum-300/10 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-platinum-300/20"
            style={{ animation: `fadeInUp 0.5s ease-out ${index * 100}ms forwards`, opacity: 0 }}
          >
            <div className="aspect-square w-full overflow-hidden">
              <img 
                src={ring.image} 
                alt={ring.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
              />
            </div>
            <div className="p-6 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-bronze-400">{ring.style}</span>
              <h3 className="font-display text-2xl text-silver-100 mt-1 mb-2">{ring.name}</h3>
              <p className="text-silver-400 text-sm mb-4 h-20">{ring.description}</p>
              <Button variant="secondary" className="w-full">View Details</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};