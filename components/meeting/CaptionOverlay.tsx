'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CaptionOverlay Component
 * Displays live captions for hearing-impaired users
 */

interface Caption {
  id: string;
  text: string;
  speaker: string;
}

interface CaptionOverlayProps {
  captions: Caption[];
  fontSize?: number;
  highContrast?: boolean;
}

export function CaptionOverlay({
  captions,
  fontSize = 100,
  highContrast = false,
}: CaptionOverlayProps) {
  const visibleCaptions = captions.slice(-3);

  const fontSizeClass = fontSize > 150 ? 'text-xl' : fontSize > 120 ? 'text-lg' : 'text-base';

  return (
    <div
      className="absolute bottom-24 left-0 right-0 px-4 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Live captions"
    >
      <div className="max-w-4xl mx-auto space-y-2">
        <AnimatePresence>
          {visibleCaptions.map((caption) => (
            <motion.div
              key={caption.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={`
                px-4 py-3 rounded-lg backdrop-blur-md
                ${
                  highContrast
                    ? 'bg-black text-white border-2 border-white'
                    : 'bg-black/80 text-white'
                }
              `}
            >
              <div className={`${fontSizeClass} leading-relaxed`}>
                <span className="font-semibold text-blue-300">{caption.speaker}: </span>
                <span>{caption.text}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
