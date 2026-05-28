import React, { useEffect, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { Stripe } from '@stripe/stripe-js';
import { StripeInstanceStore } from './StripeInstanceStore';
import { StripeCardInput } from './StripeCardInput';

export const StripeCardWrapper: React.FC = () => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeStripe = async () => {
      try {
        // ✅ NEW: Check if Stripe was preloaded
        if ((window as any).__stripePromise) {
          console.log('✅ Using preloaded Stripe instance');
          setStripePromise((window as any).__stripePromise);
          setIsLoading(false);
          return;
        }

        // ✅ NEW: Check if there was a preload error
        if ((window as any).__stripeError) {
          console.error('Stripe preload failed:', (window as any).__stripeError);
          setError('Failed to initialize payment system');
          setIsLoading(false);
          return;
        }

        // ✅ NEW: Wait for preload to complete (fallback)
        console.log('⏳ Waiting for Stripe to preload...');
        
        const waitForStripe = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Stripe initialization timeout'));
          }, 10000);

          const checkReady = () => {
            if ((window as any).__stripeReady) {
              clearTimeout(timeout);
              resolve();
            } else if ((window as any).__stripeError) {
              clearTimeout(timeout);
              reject((window as any).__stripeError);
            } else {
              setTimeout(checkReady, 100);
            }
          };

          checkReady();
        });

        await waitForStripe;

        if ((window as any).__stripePromise) {
          setStripePromise((window as any).__stripePromise);
        } else {
          throw new Error('Stripe promise not found after preload');
        }

        setIsLoading(false);

      } catch (error) {
        console.error('Failed to initialize Stripe:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    initializeStripe();
  }, []);

  if (isLoading) {
    return (
      <div style={{ 
        padding: '16px', 
        textAlign: 'center',
        color: '#666',
        fontSize: '14px'
      }}>
        <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
        Initializing payment system...
      </div>
    );
  }

  if (error || !stripePromise) {
    return (
      <div style={{ 
        padding: '16px', 
        textAlign: 'center', 
        color: '#d32f2f',
        backgroundColor: '#ffebee',
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
        {error || 'Failed to load payment system. Please refresh the page.'}
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripeInstanceStore>
        <StripeCardInput />
      </StripeInstanceStore>
    </Elements>
  );
};