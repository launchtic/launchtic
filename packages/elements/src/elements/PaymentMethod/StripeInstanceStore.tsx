// components/elements/PaymentMethod/StripeInstanceStore.tsx

import React, { useEffect } from 'react';
import { useStripe, useElements } from '@stripe/react-stripe-js';

interface StripeInstanceStoreProps {
  children: React.ReactNode;
}

/**
 * Store Stripe and Elements instances globally
 * So formHelpers.ts can access them during form submission
 */
export const StripeInstanceStore: React.FC<StripeInstanceStoreProps> = ({ children }) => {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    if (stripe && elements) {
      // ✅ Store globally for form submission
      (window as any).__stripe = stripe;
      (window as any).__elements = elements;
      
      console.log('✅ Stripe instances stored globally', {
        stripe: !!stripe,
        elements: !!elements,
        hasCardElement: !!elements.getElement('card')
      });
    } else {
      console.warn('⚠️ Stripe or Elements not ready yet', {
        stripe: !!stripe,
        elements: !!elements
      });
    }
  }, [stripe, elements]);

  // Don't render children until Stripe is ready
  if (!stripe || !elements) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
        <p>Initializing payment...</p>
      </div>
    );
  }

  return <>{children}</>;
};