import React, { useState, useEffect } from 'react';
import { CardElement } from '@stripe/react-stripe-js';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#32325d',
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a',
    },
  },
  hidePostalCode: true,
};

export const StripeCardInput: React.FC = () => {
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for error events
    const handleError = (event: any) => {
      setCardError(event.detail.message);
    };

    // Listen for clear error events
    const handleClearError = () => {
      setCardError(null);
    };

    window.addEventListener('stripe-card-error', handleError);
    window.addEventListener('stripe-card-clear-error', handleClearError);

    return () => {
      window.removeEventListener('stripe-card-error', handleError);
      window.removeEventListener('stripe-card-clear-error', handleClearError);
    };
  }, []);

  return (
    <div style={{
      padding: '16px',
      border: cardError ? '1px solid #fa755a' : '1px solid #e0e0e0',
      borderRadius: '4px',
      marginTop: '12px',
      backgroundColor: '#fff'
    }}>
      <CardElement options={CARD_ELEMENT_OPTIONS} />
      
      {cardError && (
        <div style={{
          color: '#fa755a',
          fontSize: '13px',
          marginTop: '8px'
        }}>
          {cardError}
        </div>
      )}
    </div>
  );
};