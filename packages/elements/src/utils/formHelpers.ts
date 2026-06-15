// utils/formHelpers.ts
import { isValidPhoneNumber } from 'libphonenumber-js';
import type { PaymentContextValue } from '../contexts/PaymentContext';

// ========== FIELD LABEL HELPERS ==========

/**
 * Central field configuration for all input types
 */
export const FIELD_CONFIG = {
    city: { label: "City", placeholder: "City", name: "city" },
    company_name: { label: "Company name", placeholder: "Company name", name: "companyName" },
    country: { label: "Country", placeholder: "Country", name: "country" },
    email: { label: "Email", placeholder: "Email", name: "email" },
    first_name: { label: "First name", placeholder: "First name", name: "firstName" },
    neighborHood: { label: "Neighborhood", placeholder: "Neighborhood", name: "neighborhood" },
    phone_number: { label: "Phone number", placeholder: "Phone number", name: "phone" },
    postal_code: { label: "Postal code", placeholder: "Postal code", name: "postalCode" },
    state_province: { label: "State/Province", placeholder: "State/Province", name: "stateProvince" },
    street_address: { label: "Street address", placeholder: "Street address", name: "streetAddress" },
    street_number: { label: "Street number", placeholder: "Street number", name: "streetNumber" },
    last_name: { label: "Last name", placeholder: "Last name", name: "lastName" },
    tax_number: { label: "Tax number", placeholder: "Tax number", name: "taxNumber" }
  };


/**
 * Get input type options for select dropdown
 */
export const getInputTypeOptions = () => {
  return Object.entries(FIELD_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
    placeholder: config.placeholder,
    name: config.name
  }));
};

// ========== FIELD LABEL HELPERS ==========

/**
 * Convert technical field names to human-readable labels
 */
export const getFieldLabel = (fieldName: string): string => {
  // Look up config by name
  const config = Object.values(FIELD_CONFIG).find(c => c.name === fieldName);
  if (config) return config.label;

  // Fallback to format field name
  return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};


// ========== VALIDATION HELPERS ==========

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number using libphonenumber-js
 */
export const validatePhoneNumber = (phone: string): { isValid: boolean; error?: string } => {
  try {
    if (!isValidPhoneNumber(phone)) {
      return { isValid: false, error: 'Please enter a valid phone number' };
    }
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid phone number format' };
  }
};

/**
 * Validate postal code (general format)
 */
export const validatePostalCode = (postalCode: string): { isValid: boolean; error?: string } => {
  const generalPostalRegex = /^[A-Z0-9\s\-]{3,10}$/i;
  if (!generalPostalRegex.test(postalCode)) {
    return { isValid: false, error: 'Please enter a valid postal code' };
  }
  return { isValid: true };
};

/**
 * Validate name fields (no numbers/special chars)
 */
export const validateName = (name: string): { isValid: boolean; error?: string } => {
    const nameRegex = /^[\p{L}\s\-'\.]+$/u;
    if (!nameRegex.test(name)) {
      return { isValid: false, error: 'Please enter a valid name' };
    }
    return { isValid: true };
  };


/**
 * Check if field is a name field
 */
export const isNameField = (fieldName: string): boolean => {
  return fieldName.toLowerCase() === 'firstname' ||
         fieldName.toLowerCase() === 'lastname';
};

/**
 * Check if field is a phone field
 */
export const isPhoneField = (fieldType?: string): boolean => {
  return fieldType === 'phone_number' || fieldType === 'tel';
};

/**
 * Check if value is empty
 */
export const isEmpty = (value: any): boolean => {
  if (typeof value === 'boolean') return false; // Checkbox values are always valid (true/false)
  return !value || (typeof value === 'string' && value.trim() === '');
};

// ========== FORM DATA HELPERS ==========

/**
 * Collect form data from CraftJS nodes
 */
export const collectFormData = (query: any) => {
  const nodes = query.getNodes();
  const formData: Record<string, any> = {};
  const fieldInfo: Record<string, { name: string; required: boolean; type?: string; validationMessage?: string }> = {};

  Object.values(nodes).forEach((node: any) => {
    if (node.data.displayName === "Field") {
      const props = node.data.props;
      const fieldId = props.htmlAttrId || node.id;
      const fieldName = props.inputDetail?.name || fieldId;
      const isRequired = !props.inputDetail?.isOptional;
      const inputType = props.inputDetail?.type || 'text';

      const element = document.getElementById(fieldId) as HTMLInputElement;
      let value = element?.value || '';

      // Clean phone number (remove spaces)
      if (isPhoneField(inputType)) {
        value = value.replace(/\s/g, '');
      }

      // Same-named fields (a form repeated in hero + footer, or a desktop/
      // mobile breakpoint twin) share one logical value — keep the first
      // non-empty so an empty twin can't clobber a filled field.
      if (!isEmpty(value) || formData[fieldName] === undefined) {
        formData[fieldName] = value;
      }
      fieldInfo[fieldId] = { name: fieldName, required: isRequired, type: inputType };
    } else if (node.data.displayName === "Checkbox") {
      const props = node.data.props;
      const fieldId = props.htmlAttrId || node.id;
      const fieldName = props.htmlAttrId || `checkbox_${fieldId}`;
      const isRequired = !props.isOptional;
      const customValidationMessage = props.validationMessage;

      const element = document.getElementById(fieldId) as HTMLInputElement;
      const isChecked = element?.checked || false;

      formData[fieldName] = isChecked;
      fieldInfo[fieldId] = {
        name: fieldName,
        required: isRequired,
        type: 'checkbox',
        validationMessage: customValidationMessage
      };
    }
  });

  return { formData, fieldInfo };
};

/**
 * Validate all form fields. Name-aware: fields that share an inputDetail.name
 * (a form repeated in hero + footer, or a breakpoint twin) are treated as one
 * logical field — a required name is satisfied when any sibling is filled, and
 * the submitted value is the non-empty one (see collectFormData).
 */
export const validateFormData = (
  formData: Record<string, any>,
  fieldInfo: Record<string, { name: string; required: boolean; type?: string; validationMessage?: string }>
): Record<string, string> => {
  const validationErrors: Record<string, string> = {};

  Object.entries(fieldInfo).forEach(([fieldId, info]) => {
    // Checkbox: keyed by its own htmlAttrId so formData lookup is safe
    if (info.type === 'checkbox') {
      const checked = formData[info.name];
      if (info.required && !checked) {
        validationErrors[fieldId] = info.validationMessage || 'This checkbox must be checked';
      }
      return;
    }

    // Name-aware: use the logical value for this field's name. formData is
    // keyed by name and keeps the non-empty twin, so a duplicate empty field
    // no longer triggers "required" once any sibling with that name is filled.
    let value: string = typeof formData[info.name] === 'string' ? formData[info.name] : '';

    if (isPhoneField(info.type)) {
      value = value.replace(/\s/g, '');
    }

    const fieldLabel = getFieldLabel(info.name);
    const isFieldEmpty = isEmpty(value);

    if (info.required && isFieldEmpty) {
      validationErrors[fieldId] = `${fieldLabel} is required`;
      return;
    }

    if (isFieldEmpty) return;

    // Email validation
    if (info.name.toLowerCase() === 'email') {
      if (!isValidEmail(value)) {
        validationErrors[fieldId] = 'Please enter a valid email address';
      }
    }

    // Phone validation
    else if (isPhoneField(info.type)) {
      const phoneValidation = validatePhoneNumber(value);
      if (!phoneValidation.isValid) {
        validationErrors[fieldId] = phoneValidation.error!;
      }
    }

    // Postal code validation
    else if (info.name.toLowerCase() === 'postalcode') {
      const postalValidation = validatePostalCode(value);
      if (!postalValidation.isValid) {
        validationErrors[fieldId] = postalValidation.error!;
      }
    }

    // Name fields validation
    else if (isNameField(info.name)) {
      const nameValidation = validateName(value);
      if (!nameValidation.isValid) {
        validationErrors[fieldId] = nameValidation.error!;
      }
    }
  });

  return validationErrors;
};

// ========== API HELPERS ==========

/**
 * Handle form redirection after successful submission
 */
export const handleFormRedirection = (
  redirectionType?: string,
  linkUrl?: string,
  apiResult?: any
): void => {
  // Tolerate both new camelCase vocab and legacy snake_case data so existing
  // pages keep working without a data migration.
  const isNextStep      = redirectionType === 'nextStep'      || redirectionType === 'next_step';
  const isCustomUrl     = redirectionType === 'customUrl'     || redirectionType === 'custom_url';
  const isNoRedirection = redirectionType === 'noRedirection' || redirectionType === 'no_redirection';

  if (isNoRedirection) return;

  const getRedirectUrl = (): string | null => {
    if (isNextStep) {
      return apiResult?.data?.nextStepUrl
        || (typeof window !== 'undefined' ? (window as any).data?.nextStepUrl : null)
        || null;
    }
    if (isCustomUrl && linkUrl) {
      return linkUrl;
    }
    return null;
  };

  const url = getRedirectUrl();
  if (!url) return;

  setTimeout(() => {
    window.location.href = url;
  }, 500);
};

// ========== PAYMENT DATA HELPERS ==========

/**
 * Collect payment data from PaymentContext (NOT window.data)
 *
 * @param paymentContext - PaymentContext value (can be null for optin forms)
 * @returns Payment data object or undefined if no payment context
 */
export const collectPaymentData = (paymentContext: PaymentContextValue | null | undefined) => {
  try {
    if (!paymentContext) {
      return undefined;
    }

    return {
      checkedPlanId: paymentContext.selectedPlan?.id || null,
      checkedBumpsIds: paymentContext.selectedBumpIds || [],
      selectedPaymentMethod: paymentContext.selectedPaymentMethod || 'stripe',
      isPhysicalProduct: paymentContext.isPhysicalProduct || false,
      physicalSelection: paymentContext.physicalSelection || null,
      finalPrice: paymentContext.finalPrice ?? 0,
      couponCode: paymentContext.couponCode || null,
      couponDiscountAmount: paymentContext.couponDiscountAmount ?? 0,
    };
  } catch (error) {
    console.error('Error collecting payment data:', error);
    return undefined;
  }
};

// ========== FORM TYPE DETECTION ==========

/**
 * Detect form type based on fields present
 */
export const detectFormType = (formData: Record<string, any>): 'optin' | 'payment_form' => {
  // Use window.data.payment as the authoritative signal for checkout pages
  if (typeof window !== 'undefined' && (window as any).data?.payment != null) {
    return 'payment_form';
  }

  // Fallback: check if payment data exists in form data
  const hasPaymentPlan = formData.checkedPlanId !== null && formData.checkedPlanId !== undefined;
  if (hasPaymentPlan) {
    return 'payment_form';
  }

  return 'optin';
};

// ========== REQUEST STRUCTURING ==========

/**
 * Read the honeypot field's current DOM value. Returns "" when not in the
 * page (e.g. editor preview) or untouched. Bots that auto-fill all visible
 * + invisible inputs will populate it.
 */
const readHoneypot = (): string => {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById('lt-website') as HTMLInputElement | null;
  return el?.value ?? '';
};

/**
 * Structure optin request
 */
export const structureOptinRequest = (formData: Record<string, any>) => {
  const checkBoxIds: string[] = [];
  Object.entries(formData).forEach(([key, value]) => {
    if (key.startsWith('checkbox_') && value === true) checkBoxIds.push(key);
  });

  return {
    optin: {
      funnelStepId: (window as any).data?.funnelStepId ?? null,
      _hp: readHoneypot(),
      fields: {
        email:          formData.email         || '',
        first_name:     formData.firstName     || '',
        last_name:      formData.lastName      || '',
        phone_number:   formData.phone         || '',
        country:        formData.country       || '',
        city:           formData.city          || '',
        postal_code:    formData.postalCode    || '',
        street_address: formData.streetAddress || '',
        street_number:  formData.streetNumber  || '',
        neighborhood:   formData.neighborhood  || '',
        state_province: formData.stateProvince || '',
        company_name:   formData.companyName   || '',
        tax_number:     formData.taxNumber     || '',
      },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isDesktop: window.innerWidth >= 768,
      checkBoxIds,
    }
  };
};

/**
 * Structure payment form request
 */
export const structurePaymentFormRequest = (
  formData: Record<string, any>,
  paymentData: ReturnType<typeof collectPaymentData>
) => {
  if (!paymentData) {
    throw new Error('Payment data is required for payment form');
  }

  return {
    payment_form: {
      funnelStepId: (window as any).data?.funnelStepId ?? null,
      _hp: readHoneypot(),
      customer: {
        fields: {
          email:          formData.email         || '',
          first_name:     formData.firstName     || '',
          surname:        formData.lastName      || '',
          phone_number:   formData.phone         || '',
          country:        formData.country       || '',
          city:           formData.city          || '',
          postcode:       formData.postalCode    || '',
          street_address: formData.streetAddress || '',
          street_number:  formData.streetNumber  || '',
          neighborhood:   formData.neighborhood  || '',
          state_province: formData.stateProvince || '',
          company_name:   formData.companyName   || '',
          tax_number:     formData.taxNumber     || '',
        },
        isDesktop: window.innerWidth >= 768,
      },
      paymentMethod: paymentData.selectedPaymentMethod,
      product: { id: paymentData.checkedPlanId, quantity: 1 },
      orderBumpOffers: paymentData.checkedBumpsIds || [],
      isDesktop: window.innerWidth >= 768,
    }
  };
};

// ========== FORM SUBMISSION ==========

/**
 * Submit form data to backend API
 * Handles both optin and payment forms
 * Now includes Stripe payment confirmation
 */
export const submitFormData = async (
  formData: Record<string, any>,
  fieldInfo: Record<string, { name: string; required: boolean; type?: string; validationMessage?: string }>,
  paymentContext?: PaymentContextValue | null
): Promise<any> => {

  try {
    // 1. Collect payment data from context (if available)
    const paymentData = collectPaymentData(paymentContext);

    // 2. Merge form data with payment data if available
    const fullFormData = paymentData ? { ...formData, ...paymentData } : formData;

    // 3. Detect form type
    const formType = detectFormType(fullFormData);

    // 4. Structure request based on form type
    let structuredPayload;

    if (formType === 'payment_form' && paymentData) {
      structuredPayload = structurePaymentFormRequest(formData, paymentData);
    } else {
      structuredPayload = structureOptinRequest(formData);
    }

    console.log(`[${formType.toUpperCase()}] Structured payload:`, structuredPayload);

    // ============================================
    // PAYMENT FORM: use /api/checkout/intent flow
    // ============================================
    if (formType === 'payment_form' && paymentData) {
      // Guard: must have a price plan (unless it's a physical product — price comes from variant)
      if (!paymentData.checkedPlanId && !paymentData.isPhysicalProduct) {
        throw new Error('Please select a price plan to continue.');
      }

      // Free order: skip card entirely (coupon 100%, $0 product, physical w/ full discount, sub w/ 100% off forever)
      const isFreeOrder = paymentData.finalPrice === 0;
      const isPayPal = paymentData.selectedPaymentMethod === 'paypal';

      // PayPal path — handled by PayPalButtonWrapper; this code path should not be reached for PayPal
      if (isPayPal) {
        throw new Error('PayPal payments are handled by the PayPal button. Please use the PayPal button to complete your purchase.');
      }

      let pmId: string | null = null;
      let stripe: any = null;

      if (!isFreeOrder) {
        stripe = (window as any).__stripe;
        const elements = (window as any).__elements;

        if (!stripe || !elements) {
          throw new Error('Payment not initialized. Please refresh the page.');
        }

        const cardElement = elements.getElement('card');
        if (!cardElement) {
          throw new Error('Card element not found. Please refresh the page.');
        }

        // 5a. Create Stripe PaymentMethod (validates card client-side)
        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            name: `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
            email: formData.email || undefined,
            phone: formData.phone || undefined,
            address: {
              line1: formData.streetAddress || undefined,
              city: formData.city || undefined,
              postal_code: formData.postalCode || undefined,
              country: formData.country || undefined,
            },
          },
        });

        if (pmError) {
          const codeMessages: Record<string, string> = {
            incomplete_number: 'Please enter a complete card number',
            incomplete_expiry: 'Please enter a valid expiration date',
            incomplete_cvc: 'Please enter a valid CVC code',
            invalid_number: 'The card number is invalid',
            invalid_expiry_year_past: 'The expiration year is in the past',
          };
          throw new Error(codeMessages[pmError.code ?? ''] ?? pmError.message ?? 'Invalid card');
        }

        pmId = paymentMethod.id;
      }

      // 5b. POST to /api/checkout/intent
      const intentRes = await fetch('/api/checkout/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnelStepId: (window as any).data?.funnelStepId,
          pricePlanId: paymentData.checkedPlanId,
          paymentMethod: paymentData.selectedPaymentMethod,
          paymentMethodId: pmId,
          physicalProduct: paymentData.isPhysicalProduct ? {
            id: (window as any).data?.payment?.physicalProduct?.id,
            variantId: paymentData.physicalSelection?.variantId ?? null,
            quantity: paymentData.physicalSelection?.quantity ?? 1,
            unitPrice: paymentData.physicalSelection?.unitPrice ?? 0,
          } : undefined,
          customer: {
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone,
            country: formData.country,
            city: formData.city,
            postalCode: formData.postalCode,
            streetAddress: formData.streetAddress,
            streetNumber: formData.streetNumber,
            neighborhood: formData.neighborhood,
            state: formData.stateProvince,
            company: formData.companyName,
            taxNumber: formData.taxNumber,
          },
          shipping: formData.streetAddress ? {
            line1: formData.streetAddress,
            city: formData.city,
            postal_code: formData.postalCode,
            country: formData.country,
          } : undefined,
          couponCode: paymentData.couponCode || null,
          orderBumpIds: paymentData.checkedBumpsIds?.length ? paymentData.checkedBumpsIds : undefined,
        }),
      });

      const intentResult = await intentRes.json();
      if (!intentResult.success) {
        throw new Error(intentResult.error || 'Failed to initialize payment');
      }

      // 5c. Confirm with Stripe (handles 3DS automatically)
      const { clientSecret, orderId, type: intentType, bumpResults } = intentResult;

      if (intentType === 'stripe_confirm') {
        if (!stripe) stripe = (window as any).__stripe;
        const isSetup = typeof clientSecret === 'string' && clientSecret.startsWith('seti_');
        const confirmFn = isSetup ? stripe.confirmCardSetup : stripe.confirmCardPayment;
        const { error: confirmError } = await confirmFn.call(stripe, clientSecret, {
          payment_method: pmId,
        });

        if (confirmError) {
          const codeMessages: Record<string, string> = {
            card_declined: 'Your card was declined. Please try a different card.',
            expired_card: 'Your card has expired. Please use a different card.',
            insufficient_funds: 'Insufficient funds. Please try a different card.',
            incorrect_cvc: 'The CVC code is incorrect.',
          };
          throw new Error(codeMessages[confirmError.code ?? ''] ?? confirmError.message ?? 'Payment failed');
        }
      }

      // 5d. Confirm bump subscriptions (each may require its own Stripe confirmation)
      const bumpOrderIds: string[] = [];
      for (const bump of (bumpResults || [])) {
        if (bump.type === 'stripe_confirm') {
          if (!stripe) stripe = (window as any).__stripe;
          const isSetup = typeof bump.clientSecret === 'string' && bump.clientSecret.startsWith('seti_');
          const confirmFn = isSetup ? stripe.confirmCardSetup : stripe.confirmCardPayment;
          const { error: bumpError } = await confirmFn.call(stripe, bump.clientSecret, {
            payment_method: pmId,
          });
          if (bumpError) {
            const codeMessages: Record<string, string> = {
              card_declined: 'Order bump payment was declined.',
              insufficient_funds: 'Insufficient funds for order bump.',
            };
            throw new Error(codeMessages[bumpError.code ?? ''] ?? bumpError.message ?? 'Order bump payment failed');
          }
        }
        bumpOrderIds.push(bump.orderId);
      }

      // 5e. Notify backend → get nextStepUrl
      const confirmRes = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, bumpOrderIds: bumpOrderIds.length ? bumpOrderIds : undefined }),
      });
      const confirmResult = await confirmRes.json();

      if (!confirmResult.success) {
        throw new Error(confirmResult.error || 'Payment confirmation failed');
      }

      return confirmResult;
    }

    // ============================================
    // OPTIN FORM: POST to /api/submit
    // ============================================
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(structuredPayload),
    });

    const result = await response.json();

    if (!result.success && result.errors?.fields) {
      const mappedErrors: Record<string, string> = {};
      Object.entries(result.errors.fields).forEach(([fieldName, errors]: [string, any]) => {
        const fieldEntry = Object.entries(fieldInfo).find(([, info]) => info.name === fieldName);
        if (fieldEntry) {
          mappedErrors[fieldEntry[0]] = Array.isArray(errors) ? errors[0] : errors;
        }
      });
      const error = new Error('Validation failed');
      (error as any).mappedErrors = mappedErrors;
      (error as any).commonErrors = result.errors.common || [];
      throw error;
    }

    if (!response.ok) throw new Error(result.message || 'Submission failed');

    return result;

  } catch (error) {
    console.error('Submit error:', error);
    throw error;
  }
};

/** @deprecated — use /api/checkout/intent flow instead */
export const handleStripePayment = async (
  paymentResponse: any,
  formData: any,
  stripe: any,
  elements: any
): Promise<any> => {
  try {
    console.log('Confirming payment with Stripe...');

    const paymentMethodId = (window as any).__stripePaymentMethodId;

    if (!paymentMethodId) {
      throw new Error('Payment method not found. Please try again.');
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(
      paymentResponse.client_secret,
      {
        payment_method: paymentMethodId,
      }
    );

    if (error) {
      console.error('Stripe payment error:', error);

      let errorMessage = error.message || 'Payment failed';

      if (error.code === 'card_declined') {
        errorMessage = 'Your card was declined. Please try a different card.';
      } else if (error.code === 'expired_card') {
        errorMessage = 'Your card has expired. Please use a different card.';
      } else if (error.code === 'insufficient_funds') {
        errorMessage = 'Insufficient funds. Please try a different card.';
      } else if (error.code === 'incorrect_cvc') {
        errorMessage = 'The CVC code is incorrect.';
      }

      window.dispatchEvent(new CustomEvent('stripe-card-error', {
        detail: { message: errorMessage }
      }));

      throw new Error(errorMessage);
    }

    if (paymentIntent.status !== 'succeeded') {
      const errorMsg = `Payment ${paymentIntent.status}. Please try again.`;
      window.dispatchEvent(new CustomEvent('stripe-card-error', {
        detail: { message: errorMsg }
      }));
      throw new Error(errorMsg);
    }

    console.log('Payment succeeded:', paymentIntent.id);

    const confirmResponse = await fetch('/api/confirm-stripe-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: paymentResponse.order_id,
        payment_intent_id: paymentIntent.id,
      }),
    });

    const confirmResult = await confirmResponse.json();

    if (!confirmResult.success) {
      const errorMsg = confirmResult.message || 'Failed to confirm payment with server';
      window.dispatchEvent(new CustomEvent('stripe-card-error', {
        detail: { message: errorMsg }
      }));
      throw new Error(errorMsg);
    }

    console.log('Payment confirmed with backend');

    // Cleanup
    delete (window as any).__stripePaymentMethodId;

    return confirmResult;

  } catch (error) {
    console.error('handleStripePayment error:', error);
    throw error;
  }
};
