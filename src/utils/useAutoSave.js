import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Auto-save hook for form data
 * @param {string} storageKey - Unique key for localStorage
 * @param {Object} formData - Current form data
 * @param {Function} setFormData - Function to update form data
 * @param {number} delay - Auto-save delay in milliseconds (default: 2000)
 * @param {Function} onAutoSave - Optional callback for additional auto-save logic
 * @param {boolean} enabled - When false, skip load/save (keeps storage untouched)
 * @returns {Object} - { isSaving, lastSaved, clearSavedData, markAsSubmitted, flushSave }
 */
export const useAutoSave = (storageKey, formData, setFormData, delay = 2000, onAutoSave = null, enabled = true) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const timeoutRef = useRef(null);
  const previousDataRef = useRef(null);
  const isSubmittedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const formDataRef = useRef(formData);
  const enabledRef = useRef(enabled);
  const storageKeyRef = useRef(storageKey);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  // Store setFormData in ref to avoid dependency issues
  const setFormDataRef = useRef(setFormData);
  useEffect(() => {
    setFormDataRef.current = setFormData;
  }, [setFormData]);

  const persistNow = useCallback((data) => {
    if (isSubmittedRef.current) return false;
    if (!data || Object.keys(data).length === 0) return false;
    try {
      const saveData = {
        data,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(storageKeyRef.current, JSON.stringify(saveData));
      previousDataRef.current = JSON.parse(JSON.stringify(data));
      setLastSaved(new Date(saveData.timestamp));
      return true;
    } catch (error) {
      console.warn('Failed to auto-save data:', error);
      return false;
    }
  }, []);

  /** Flush pending/current form to localStorage immediately (e.g. on modal close). */
  const flushSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsSaving(false);
    return persistNow(formDataRef.current);
  }, [persistNow]);

  // Re-enable draft lifecycle when the sheet/form becomes active again after a successful submit
  useEffect(() => {
    if (enabled) {
      isSubmittedRef.current = false;
    }
  }, [enabled]);

  // When drafting is turned off (sheet closed), flush any pending debounce so X/close never drops data
  useEffect(() => {
    if (enabled) return undefined;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      persistNow(formDataRef.current);
      setIsSaving(false);
    }
    return undefined;
  }, [enabled, persistNow]);

  // Load saved data when enabled (and on storage key change)
  useEffect(() => {
    if (!enabled) return;
    if (isSubmittedRef.current) return; // Don't load if form was just submitted

    isLoadingRef.current = true;
    // Use requestAnimationFrame for non-blocking load
    requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsedData = JSON.parse(saved);
          if (parsedData.data && Object.keys(parsedData.data).length > 0) {
            // Set previous data ref to prevent autosave from triggering
            previousDataRef.current = JSON.parse(JSON.stringify(parsedData.data));
            // Use another RAF to ensure UI is responsive
            requestAnimationFrame(() => {
              setFormDataRef.current(parsedData.data);
              setLastSaved(new Date(parsedData.timestamp));
              isLoadingRef.current = false;
            });
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to load auto-saved data:', error);
      }
      isLoadingRef.current = false;
    });
  }, [storageKey, enabled]);

  // Store onAutoSave in a ref to prevent it from being a dependency
  const onAutoSaveRef = useRef(onAutoSave);
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);

  // Auto-save when form data changes (debounced)
  useEffect(() => {
    if (!enabled) return;
    if (isSubmittedRef.current) return;
    if (isLoadingRef.current) return;

    const currentDataString = JSON.stringify(formData);
    const previousDataString = JSON.stringify(previousDataRef.current);
    if (currentDataString === previousDataString) {
      return;
    }

    if (!formData || Object.keys(formData).length === 0) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsSaving(true);

    timeoutRef.current = setTimeout(async () => {
      try {
        const ok = persistNow(formData);
        if (ok && onAutoSaveRef.current && typeof onAutoSaveRef.current === 'function') {
          try {
            await onAutoSaveRef.current(formData);
          } catch (error) {
            console.warn('Additional auto-save callback failed:', error);
          }
        }

        if (ok && storageKey.includes('protocol_draft_')) {
          window.dispatchEvent(new CustomEvent('tpp:protocol-autosaved', {
            detail: { storageKey, formData }
          }));
        }
      } finally {
        setIsSaving(false);
        timeoutRef.current = null;
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        // Flush on dependency change / unmount so pending edits are not dropped
        if (enabledRef.current && !isSubmittedRef.current) {
          persistNow(formDataRef.current);
        }
        setIsSaving(false);
      }
    };
  }, [formData, storageKey, delay, enabled, persistNow]);

  // Clear saved data
  const clearSavedData = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setLastSaved(null);
      previousDataRef.current = null;
    } catch (error) {
      console.warn('Failed to clear auto-saved data:', error);
    }
  }, [storageKey]);

  // Mark as submitted (prevents loading on next mount)
  const markAsSubmitted = useCallback(() => {
    isSubmittedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    clearSavedData();
  }, [clearSavedData]);

  // Update form data helper
  const updateFormData = useCallback((updates) => {
    if (typeof updates === 'function') {
      setFormData(prev => {
        const newData = updates(prev);
        return newData;
      });
    } else {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }, [setFormData]);

  return {
    isSaving,
    lastSaved,
    clearSavedData,
    markAsSubmitted,
    updateFormData,
    flushSave
  };
};

export default useAutoSave;
