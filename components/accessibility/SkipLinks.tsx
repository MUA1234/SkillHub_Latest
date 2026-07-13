'use client';

import React from 'react';

/**
 * SkipLinks Component
 *
 * Provides skip navigation links for keyboard users to quickly
 * jump to main content areas without tabbing through all navigation.
 */

interface SkipLink {
  id: string;
  label: string;
}

interface SkipLinksProps {
  links?: SkipLink[];
}

const defaultLinks: SkipLink[] = [
  { id: 'main-content', label: 'Skip to main content' },
  { id: 'navigation', label: 'Skip to navigation' },
];

export const SkipLinks: React.FC<SkipLinksProps> = ({ links = defaultLinks }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="skip-links" aria-label="Skip links">
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          onClick={(e) => handleClick(e, link.id)}
          className="skip-link"
        >
          {link.label}
        </a>
      ))}

      <style jsx>{`
        .skip-links {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 100001;
        }

        .skip-link {
          position: absolute;
          top: -100px;
          left: 0;
          padding: 12px 24px;
          background-color: #1e40af;
          color: white;
          font-weight: 600;
          text-decoration: none;
          border-radius: 0 0 8px 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: top 0.2s ease;
        }

        .skip-link:focus {
          top: 0;
          outline: 3px solid #fbbf24;
          outline-offset: 2px;
        }

        .skip-link:hover {
          background-color: #1e3a8a;
        }

        /* Stack multiple skip links */
        .skip-link:nth-child(2) {
          left: auto;
          right: 300px;
        }

        .skip-link:nth-child(3) {
          left: auto;
          right: 150px;
        }
      `}</style>
    </nav>
  );
};

/**
 * MainContentMarker Component
 *
 * Marks the beginning of main content for skip link navigation.
 * Should be placed at the start of the main content area.
 */
export const MainContentMarker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      {children}
    </main>
  );
};

/**
 * NavigationMarker Component
 *
 * Marks navigation for skip link navigation.
 */
export const NavigationMarker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <nav id="navigation" tabIndex={-1} className="outline-none" aria-label="Main navigation">
      {children}
    </nav>
  );
};

export default SkipLinks;
