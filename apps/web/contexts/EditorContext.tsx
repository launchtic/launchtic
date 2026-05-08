"use client";
// src/contexts/EditorContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { savePage } from '../lib/pageApi';

interface PageData {
  code: string;
  content: string;
}

interface EditorContextType {
  pageData: PageData;
  isSaving: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  markAsChanged: () => void;
  updatePage: (content: string) => Promise<void>;
  stepType: string;
  meta: Record<string, any> | null;
  saveMeta: (meta: Record<string, any>) => Promise<void>;
  context: { type: string };
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

interface EditorProviderProps {
  children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  // Page State
  const [pageData, setPageData] = useState<PageData>({
    code: '',
    content: ''
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stepType, setStepType] = useState<string>("OPTIN");
  const [meta, setMeta] = useState<Record<string, any> | null>(null);

  // Unsaved Changes State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  const isInitializedRef = useRef<boolean>(false);
  const initializationTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize data from window.data.pageData
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      // Reset initialization flag when loading
      isInitializedRef.current = false;

      try {
        const windowPageData = (window as any).data?.pageData;
        console.log('Window data:', (window as any).data);

        if (windowPageData) {
          setPageData({
            code:    windowPageData.code,
            content: typeof windowPageData.content === 'string'
              ? windowPageData.content
              : JSON.stringify(windowPageData.content || {})
          });
          setStepType(windowPageData.stepType ?? "OPTIN");
          setMeta(windowPageData.meta ?? null);
          setHasUnsavedChanges(false);
        }
      } catch (error) {
        console.error('Failed to initialize data:', error);
      } finally {
        setIsLoading(false);

        initializationTimer.current = setTimeout(() => {
          console.log('Editor initialized - now tracking changes');
          isInitializedRef.current = true;
        }, 1000);
      }
    };

    initializeData();

    return () => {
      if (initializationTimer.current) {
        clearTimeout(initializationTimer.current);
      }
    };
  }, []);

  const markAsChanged = useCallback(() => {
    if (!isInitializedRef.current) {
      console.log('Skipping change during initialization');
      return;
    }

    console.log('Content changed - marking as unsaved');
    setHasUnsavedChanges(true);
  }, []);

  const updatePage = useCallback(async (content: string): Promise<void> => {
    const updatedData = { ...pageData, content };
    setPageData(updatedData);

    if (!updatedData.code) {
      console.warn('Page code is missing, cannot save to API');
      return;
    }

    setIsSaving(true);

    try {
      const response = await savePage(updatedData.code, updatedData.content);

      if (response.success) {
        console.log('Page saved successfully:', response);
        setHasUnsavedChanges(false);
      } else {
        console.error('Failed to save page:', response.message);
        throw new Error(response.message || 'Failed to save page');
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [pageData]);

  const saveMeta = useCallback(async (newMeta: Record<string, any>) => {
    setMeta(newMeta);
    await fetch((window as any).data?.saveUrl, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ meta: newMeta }),
    });
  }, []);

  const contextValue: EditorContextType = {
    pageData,
    isSaving,
    isLoading,
    hasUnsavedChanges,
    markAsChanged,
    updatePage,
    stepType,
    meta,
    saveMeta,
    context: { type: (window as any).data?.pageData?.type || 'page' },
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditorContext = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within EditorProvider');
  }
  return context;
};
