'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';

/**
 * ReadingRuler Component
 *
 * A visual aid that follows the mouse cursor to help users track
 * the line they're reading. Especially helpful for users with
 * dyslexia, ADHD, or visual tracking difficulties.
 */
export const ReadingRuler: React.FC = () => {
  const { preferences } = useAccessibility();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (!preferences.reading_ruler) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [preferences.reading_ruler, handleMouseMove, handleMouseLeave]);

  if (!preferences.reading_ruler || !isVisible) return null;

  const rulerHeight = 60;
  const overlayOpacity = 0.7;

  return (
    <>
      {}
      <div
        className="fixed left-0 right-0 pointer-events-none z-[99990] transition-all duration-75"
        style={{
          top: 0,
          height: Math.max(0, position.y - rulerHeight / 2),
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
        }}
      />

      {}
      <div
        className="fixed left-0 right-0 pointer-events-none z-[99990] border-y-2 border-yellow-400"
        style={{
          top: position.y - rulerHeight / 2,
          height: rulerHeight,
          boxShadow: '0 0 10px rgba(255, 200, 0, 0.5)',
        }}
      />

      {}
      <div
        className="fixed left-0 right-0 bottom-0 pointer-events-none z-[99990] transition-all duration-75"
        style={{
          top: position.y + rulerHeight / 2,
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
        }}
      />

      {}
      <div
        className="fixed left-0 w-8 pointer-events-none z-[99991] flex items-center justify-center"
        style={{
          top: position.y - 10,
          height: 20,
        }}
      >
        <div className="w-0 h-0 border-t-8 border-b-8 border-l-8 border-transparent border-l-yellow-400" />
      </div>
    </>
  );
};

/**
 * TextMask Component
 *
 * An alternative reading aid that shows only the current line
 * and masks everything else. Useful for users who are easily
 * distracted by surrounding text.
 */
export const TextMask: React.FC = () => {
  const { preferences } = useAccessibility();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (!preferences.text_mask) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [preferences.text_mask, handleMouseMove, handleMouseLeave]);

  if (!preferences.text_mask || !isVisible) return null;

  const windowWidth = 600;
  const windowHeight = 40;

  return (
    <div className="fixed inset-0 pointer-events-none z-[99990]">
      {}
      <svg className="w-full h-full">
        <defs>
          <mask id="text-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={Math.max(0, position.x - windowWidth / 2)}
              y={position.y - windowHeight / 2}
              width={windowWidth}
              height={windowHeight}
              rx="4"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.8)"
          mask="url(#text-mask)"
        />
      </svg>

      {}
      <div
        className="fixed border-2 border-blue-400 rounded pointer-events-none"
        style={{
          left: Math.max(0, position.x - windowWidth / 2),
          top: position.y - windowHeight / 2,
          width: windowWidth,
          height: windowHeight,
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
        }}
      />
    </div>
  );
};

/**
 * FocusHighlight Component
 *
 * Highlights the paragraph or element the user is currently hovering over,
 * making it easier to focus on the current content.
 */
export const FocusHighlight: React.FC = () => {
  const { preferences } = useAccessibility();
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const readableElements = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV'];
    let element: HTMLElement | null = target;

    while (element && !readableElements.includes(element.tagName)) {
      element = element.parentElement;
    }

    if (element && element.textContent && element.textContent.trim().length > 10) {
      setHighlightRect(element.getBoundingClientRect());
    } else {
      setHighlightRect(null);
    }
  }, []);

  useEffect(() => {
    if (!preferences.focus_highlight) return;

    document.addEventListener('mouseover', handleMouseOver);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
    };
  }, [preferences.focus_highlight, handleMouseOver]);

  if (!preferences.focus_highlight || !highlightRect) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99989] rounded transition-all duration-150"
      style={{
        left: highlightRect.left - 8,
        top: highlightRect.top - 4,
        width: highlightRect.width + 16,
        height: highlightRect.height + 8,
        backgroundColor: 'rgba(255, 255, 0, 0.15)',
        border: '2px solid rgba(255, 200, 0, 0.4)',
        boxShadow: '0 0 10px rgba(255, 200, 0, 0.2)',
      }}
    />
  );
};

export default ReadingRuler;
