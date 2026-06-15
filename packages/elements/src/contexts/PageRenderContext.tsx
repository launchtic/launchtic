"use client";
// contexts/PageRenderContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  collectFormData,
  validateFormData,
  submitFormData,
  handleFormRedirection
} from '../utils/formHelpers';
import { useSafePayment } from './PaymentContext';

interface PageRenderContextValue {
  errors: Record<string, string>;
  submitForm: (redirectionType?: string, linkUrl?: string, query?: any) => Promise<any>;
  isSubmitting: boolean;
  clearError: (fieldId: string) => void;
  setErrors: (errors: Record<string, string>) => void;
}

const PageRenderContext = createContext<PageRenderContextValue | null>(null);

export const PageRenderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get payment context (safe - works with or without PaymentProvider)
  const paymentContext = useSafePayment();

  const clearError = useCallback((fieldId: string) => {
    setErrors(prev => {
      const { [fieldId]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const setErrorsCallback = useCallback((newErrors: Record<string, string>) => {
    setErrors(newErrors);
  }, []);

  const submitForm = useCallback(async (redirectionType?: string, linkUrl?: string, query?: any) => {
    if (!query) {
      console.error('Query object is required for form submission');
      return;
    }

    // 1. Collect form data (customer info)
    const { formData, fieldInfo } = collectFormData(query);

    // 2. Validate using helper
    const validationErrors = validateFormData(formData, fieldInfo);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      console.log('Form data:', formData);
      console.log('Field info:', fieldInfo);
      console.log('Payment context:', paymentContext);

      // 3. Submit with payment context (formHelpers will extract payment data)
      const result = await submitFormData(formData, fieldInfo, paymentContext);
      console.log('API response:', result);

      // Handle redirection using helper
      handleFormRedirection(redirectionType, linkUrl, result);

      // Return result for PaymentButton to access nextStepUrl
      return result;

    } catch (error) {
      console.error('Submit failed:', error);

      // Handle mapped field errors from API (validation)
      if ((error as any).mappedErrors) {
        setErrors((error as any).mappedErrors);
        // Re-throw so callers (PaymentButton) know submission failed
        throw error;
      }

      // Re-throw all other errors so PaymentButton can display them
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [paymentContext]);

  return (
    <PageRenderContext.Provider value={{
      errors,
      submitForm,
      isSubmitting,
      clearError,
      setErrors: setErrorsCallback
    }}>
      {children}
    </PageRenderContext.Provider>
  );
};

export const usePageRender = () => {
  const context = useContext(PageRenderContext);
  return context;
};
