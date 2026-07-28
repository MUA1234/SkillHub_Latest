'use client';

import { useState, useEffect } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';

export default function DebugAccessibilityPage() {
  const [localStorageData, setLocalStorageData] = useState<{ [key: string]: any }>({});
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { preferences, hasCompletedOnboarding } = useAccessibility();

  useEffect(() => {
    const data: { [key: string]: any } = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const value = localStorage.getItem(key);
          data[key] = value ? JSON.parse(value) : value;
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
    }

    setLocalStorageData(data);

    try {
      const userStr = localStorage.getItem('current_user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch (error) {
      console.error('Failed to parse current_user:', error);
    }
  }, []);

  const clearAllAccessibilitySettings = () => {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('accessibility') || key.includes('a11y')) {
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-cream-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Accessibility Settings Debugger</h1>

        {}
        <div className="bg-cream-50 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current User</h2>
          {currentUser ? (
            <div className="space-y-2">
              <p><strong>ID:</strong> {currentUser.id}</p>
              <p><strong>Name:</strong> {currentUser.full_name || currentUser.name}</p>
              <p><strong>Email:</strong> {currentUser.email}</p>
              <p><strong>Role:</strong> {currentUser.role}</p>
            </div>
          ) : (
            <p className="text-espresso/55">No user logged in</p>
          )}
        </div>

        {}
        <div className="bg-cream-50 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Active Accessibility Preferences</h2>
          <div className="space-y-2">
            <p><strong>Onboarding Completed:</strong> {hasCompletedOnboarding ? 'Yes' : 'No'}</p>
            <p><strong>Font Size:</strong> {preferences.font_size}%</p>
            <p><strong>Font Family:</strong> {preferences.font_family}</p>
            <p><strong>High Contrast:</strong> {preferences.high_contrast ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Reduced Motion:</strong> {preferences.reduced_motion ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Focus Mode:</strong> {preferences.focus_mode ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Text-to-Speech:</strong> {preferences.text_to_speech ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Reading Guide:</strong> {preferences.reading_guide ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Color Blind Mode:</strong> {preferences.color_blind_mode}</p>
          </div>
        </div>

        {}
        <div className="bg-cream-50 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">localStorage Contents</h2>
          <div className="space-y-4">
            {Object.entries(localStorageData).map(([key, value]) => (
              <div key={key} className="border-b pb-3">
                <p className="font-semibold text-sm text-espresso mb-1">{key}</p>
                <pre className="text-xs bg-cream-100 p-2 rounded overflow-x-auto">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {}
        <div className="bg-cream-50 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">User-Specific Accessibility Keys</h2>
          <div className="space-y-2">
            {Object.keys(localStorageData)
              .filter(key => key.includes('accessibility') || key.includes('a11y'))
              .map(key => (
                <div key={key} className="flex items-center justify-between p-2 bg-terracotta/10 rounded">
                  <span className="font-mono text-sm">{key}</span>
                  <button
                    onClick={() => {
                      localStorage.removeItem(key);
                      window.location.reload();
                    }}
                    className="text-coral hover:text-coral text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            {Object.keys(localStorageData).filter(key =>
              key.includes('accessibility') || key.includes('a11y')
            ).length === 0 && (
              <p className="text-espresso/55">No accessibility settings found in localStorage</p>
            )}
          </div>
        </div>

        {}
        <div className="bg-cream-50 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="space-y-3">
            <button
              onClick={clearAllAccessibilitySettings}
              className="w-full bg-coral hover:bg-coral-400 text-white px-4 py-2 rounded"
            >
              Clear All Accessibility Settings
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-terracotta hover:bg-terracotta-500 text-white px-4 py-2 rounded"
            >
              Refresh Page
            </button>
            <a
              href="/students/accessibility/choose-track"
              className="block w-full bg-forest hover:bg-forest-400 text-white px-4 py-2 rounded text-center"
            >
              Go to Choose Dashboard
            </a>
            <a
              href="/students/settings/accessibility"
              className="block w-full bg-mustard-400 hover:bg-mustard-500 text-espresso border-2 border-espresso px-4 py-2 rounded-full text-center font-semibold shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
            >
              Go to Accessibility Settings
            </a>
          </div>
        </div>

        {}
        <div className="bg-mustard/15 border border-mustard/40 rounded-lg p-6 mt-6">
          <h3 className="font-semibold mb-2">How to Use This Page:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Check which user is currently logged in</li>
            <li>View active accessibility preferences</li>
            <li>Inspect localStorage to see user-specific keys</li>
            <li>Clear settings if needed to test fresh state</li>
            <li>Test logout/login with different users to verify isolation</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
