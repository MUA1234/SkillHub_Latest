'use client';

import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

/**
 * ScreenReaderAnnouncer Component
 *
 * Provides a way to announce messages to screen readers.
 * Uses ARIA live regions for dynamic content announcements.
 */

interface AnnouncerContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
}

const AnnouncerContext = createContext<AnnouncerContextType | undefined>(undefined);

interface ScreenReaderAnnouncerProps {
  children: ReactNode;
}

export const ScreenReaderAnnouncer: React.FC<ScreenReaderAnnouncerProps> = ({ children }) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (priority === 'assertive') {
      setAssertiveMessage('');
      setTimeout(() => setAssertiveMessage(message), 50);
    } else {
      setPoliteMessage('');
      setTimeout(() => setPoliteMessage(message), 50);
    }
  }, []);

  const announcePolite = useCallback((message: string) => {
    announce(message, 'polite');
  }, [announce]);

  const announceAssertive = useCallback((message: string) => {
    announce(message, 'assertive');
  }, [announce]);

  useEffect(() => {
    if (politeMessage) {
      const timer = setTimeout(() => setPoliteMessage(''), 1000);
      return () => clearTimeout(timer);
    }
  }, [politeMessage]);

  useEffect(() => {
    if (assertiveMessage) {
      const timer = setTimeout(() => setAssertiveMessage(''), 1000);
      return () => clearTimeout(timer);
    }
  }, [assertiveMessage]);

  return (
    <AnnouncerContext.Provider value={{ announce, announcePolite, announceAssertive }}>
      {children}

      {}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>

      {}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
};

/**
 * Hook to access the announcer
 */
export const useAnnounce = (): AnnouncerContextType => {
  const context = useContext(AnnouncerContext);
  if (!context) {
    return {
      announce: () => {},
      announcePolite: () => {},
      announceAssertive: () => {},
    };
  }
  return context;
};

/**
 * RouteAnnouncer Component
 *
 * Automatically announces page changes for screen readers.
 */
export const RouteAnnouncer: React.FC = () => {
  const { announcePolite } = useAnnounce();
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    const checkRoute = () => {
      const newPath = window.location.pathname;
      if (newPath !== currentPath) {
        setCurrentPath(newPath);

        const pageTitle = document.title || newPath.split('/').pop() || 'Page';
        announcePolite(`Navigated to ${pageTitle}`);
      }
    };

    checkRoute();

    window.addEventListener('popstate', checkRoute);

    const observer = new MutationObserver(() => {
      checkRoute();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.removeEventListener('popstate', checkRoute);
      observer.disconnect();
    };
  }, [currentPath, announcePolite]);

  return null;
};

export default ScreenReaderAnnouncer;
