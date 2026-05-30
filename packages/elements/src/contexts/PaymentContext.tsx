"use client";
// contexts/PaymentContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { validateCoupon as validateCouponAPI } from '../lib/pageApi';

// ========== TYPES ==========
interface PricePlan {
  id: number | string;
  name: string;
  description?: string | null;
  directChargeAmount: number;
  currency: string;
  isLimited: boolean;
  type: string;
  taxBehavior: string;
  interval?: string | null;
  trialDays?: number | null;
}

interface OrderBump {
  id: string;
  label: string;
  displayName: string;
  amount: number;
  currency: string;
  type: string;
  interval: string | null;
  trialDays: number | null;
  shippingFee: number;
}

interface PaymentState {
  // Selected items
  selectedPlan: PricePlan | null;
  selectedBumpIds: string[];
  selectedPaymentMethod: string;
  couponCode: string;

  // Price breakdown
  basePrice: number;
  couponDiscount: number;
  couponDiscountAmount: number;
  bumpTotal: number;
  finalPrice: number;
  taxAmount: number;
  shippingFee: number;

  // Status
  isCouponValid: boolean;
  isProcessing: boolean;
  couponError: string;

  // Available options
  availablePlans: PricePlan[];
  availableBumps: OrderBump[];

  // Physical product
  physicalSelection: { variantId: string | null; quantity: number; unitPrice: number };
  isPhysicalProduct: boolean;
}

interface PaymentContextValue extends PaymentState {
  // Actions
  selectPlan: (plan: PricePlan) => void;
  toggleOrderBump: (bumpId: string) => void;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => void;
  resetPayment: () => void;
  selectPaymentMethod: (method: string) => void;
  updatePhysicalSelection: (opts: Partial<{ variantId: string | null; quantity: number; unitPrice: number }>) => void;
}

// ========== CONTEXT ==========
const PaymentContext = createContext<PaymentContextValue | null>(null);

// ========== PROVIDER ==========
export const PaymentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  // ========== INITIALIZE FROM WINDOW.DATA (ONE-TIME ONLY) ==========
  // On UPSELL/DOWNSELL pages there is no full `payment` shape — the renderer
  // exposes a single offer at `window.data.upsell`. Project it into the same
  // PricePlan shape so OfferPrice/OfferButton can render the LIVE DB price
  // instead of whatever literal the designer typed in the editor.
  const upsellAsPlan = (): PricePlan | null => {
    try {
      const u = (window as any)?.data?.upsell;
      if (!u || u.amount === undefined) return null;
      return {
        id:                  u.pricePlanId,
        name:                u.name ?? "Offer",
        directChargeAmount:  u.amount,
        currency:            u.currency ?? "usd",
        isLimited:           false,
        type:                u.type ?? "ONE_TIME",
        taxBehavior:         "inclusive",
        interval:            u.interval ?? null,
        trialDays:           u.trialDays ?? null,
      };
    } catch {
      return null;
    }
  };

  const getInitialPlans = (): PricePlan[] => {
    try {
      const checkoutPlans = window?.data?.payment?.offer?.pricePlans || [];
      if (checkoutPlans.length > 0) return checkoutPlans;
      const u = upsellAsPlan();
      return u ? [u] : [];
    } catch {
      return [];
    }
  };

  const getInitialBumps = (): OrderBump[] => {
    try {
      const bumps: any[] = window?.data?.payment?.orderBumps || [];
      return bumps.map((b: any): OrderBump | null => {
        if (b.offerType === "PHYSICAL" && b.physicalProduct) {
          return {
            id: b.id, label: b.label, displayName: b.physicalProduct.name ?? "",
            amount: b.physicalProduct.price,
            currency: b.physicalProduct.currency,
            type: "ONE_TIME", interval: null, trialDays: null,
            shippingFee: b.shippingFee ?? 0,
          };
        }
        if (!b.pricePlan) return null;
        return {
          id: b.id, label: b.label, displayName: b.pricePlan.name,
          amount: b.pricePlan.amount,
          currency: b.pricePlan.currency,
          type: b.pricePlan.type,
          interval: b.pricePlan.interval ?? null,
          trialDays: b.pricePlan.trialDays ?? null,
          shippingFee: 0,
        };
      }).filter((b): b is OrderBump => b !== null);
    } catch {
      return [];
    }
  };

  const getInitialSelectedPlan = (): PricePlan | null => {
    try {
      const plans = getInitialPlans();
      const checkedPlanId = window?.data?.payment?.checkedPlanId;

      if (checkedPlanId && plans.length > 0) {
        const plan = plans.find(p => p.id === checkedPlanId);
        return plan || plans[0];
      }

      return plans.length > 0 ? plans[0] : null;
    } catch {
      return null;
    }
  };

  const getInitialSelectedBumps = (): string[] => {
    try {
      return window?.data?.payment?.checkedBumpsIds || [];
    } catch {
      return [];
    }
  };

  const getInitialSelectedPaymentMethod = (): string => {
    try {
      return window?.data?.payment?.selectedPaymentMethod || 'stripe';
    } catch {
      return 'stripe';
    }
  };

  // ========== PHYSICAL PRODUCT ==========
  const physicalProductData = (() => { try { return (window as any)?.data?.payment?.physicalProduct ?? null; } catch { return null; } })();
  const isPhysicalProduct = !!physicalProductData;

  // ========== STATE ==========
  const [availablePlans] = useState<PricePlan[]>(getInitialPlans);
  const [availableBumps] = useState<OrderBump[]>(getInitialBumps);
  const [selectedPlan, setSelectedPlan] = useState<PricePlan | null>(getInitialSelectedPlan);
  const [selectedBumpIds, setSelectedBumpIds] = useState<string[]>(getInitialSelectedBumps);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(getInitialSelectedPaymentMethod);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponType, setCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [isCouponValid, setIsCouponValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [couponError, setCouponError] = useState('');

  const [physicalSelection, setPhysicalSelection] = useState<{
    variantId: string | null; quantity: number; unitPrice: number;
  }>({
    variantId: null,
    quantity: 1,
    unitPrice: physicalProductData?.price ?? 0,
  });

  const updatePhysicalSelection = useCallback((opts: Partial<{ variantId: string | null; quantity: number; unitPrice: number }>) => {
    setPhysicalSelection(prev => ({ ...prev, ...opts }));
  }, []);

  // ========== CALCULATED VALUES ==========
  const basePrice = isPhysicalProduct
    ? physicalSelection.unitPrice * physicalSelection.quantity
    : (selectedPlan?.directChargeAmount ?? 0);

  const taxAmount = 0;
  const shippingFee: number = isPhysicalProduct ? ((window as any)?.data?.payment?.shippingFee ?? 0) : 0;

  const couponDiscountAmount = isCouponValid
    ? couponType === 'fixed'
      ? Math.min(couponDiscount, basePrice)
      : Math.round(basePrice * couponDiscount / 100)
    : 0;

  // Calculate bumps total (amount + shipping per bump)
  const bumpTotal = availableBumps
    .filter(bump => selectedBumpIds.includes(bump.id))
    .reduce((sum, bump) => sum + bump.amount + bump.shippingFee, 0);

  const finalPrice = Math.max(0, basePrice + shippingFee - couponDiscountAmount + bumpTotal);

  // ========== ACTIONS ==========

  const selectPlan = useCallback((plan: PricePlan) => {
    setSelectedPlan(plan);
    console.log('Plan selected:', plan.name, `$${plan.directChargeAmount}`);
  }, []);

  const toggleOrderBump = useCallback((bumpId: string) => {
    setSelectedBumpIds(prev => {
      const newIds = prev.includes(bumpId)
        ? prev.filter(id => id !== bumpId)
        : [...prev, bumpId];

      console.log('Bumps updated:', newIds);
      return newIds;
    });
  }, []);

  const applyCoupon = useCallback(async (code: string) => {
    if (!code.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }

    setIsProcessing(true);
    setCouponError('');

    try {
      console.log('Validating coupon:', code);

      const result = await validateCouponAPI(code);

      if (result.valid) {
        setCouponCode(code);
        setCouponDiscount(result.discount);
        setCouponType(result.type);
        setIsCouponValid(true);
        setCouponError('');
        console.log('Coupon applied:', code, result.type === 'fixed' ? `$${result.discount/100} off` : `${result.discount}% off`);
      } else {
        setCouponError(result.message || 'Invalid coupon code');
        setIsCouponValid(false);
        console.log('Coupon invalid:', code);
      }
    } catch (error) {
      setCouponError('Failed to validate coupon. Please try again.');
      setIsCouponValid(false);
      console.error('Coupon validation error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeCoupon = useCallback(() => {
    setCouponCode('');
    setCouponDiscount(0);
    setCouponType('percentage');
    setIsCouponValid(false);
    setCouponError('');
    console.log('Coupon removed');
  }, []);

  const selectPaymentMethod = useCallback((method: string) => {
    setSelectedPaymentMethod(method);
    console.log('Payment method selected:', method);
  }, []);

  const resetPayment = useCallback(() => {
    setSelectedPlan(getInitialSelectedPlan());
    setSelectedBumpIds(getInitialSelectedBumps());
    setSelectedPaymentMethod(getInitialSelectedPaymentMethod());
    setCouponCode('');
    setCouponDiscount(0);
    setCouponType('percentage');
    setIsCouponValid(false);
    setCouponError('');
    console.log('Payment state reset');
  }, []);

  // ========== EFFECTS ==========

  useEffect(() => {
    console.log('Price breakdown:', {
      base: basePrice,
      discount: couponDiscountAmount,
      bumps: bumpTotal,
      final: finalPrice
    });
  }, [basePrice, couponDiscountAmount, bumpTotal, finalPrice]);

  // PayPal does not support recurring bumps (industry standard, see Kartra/CF/GHL).
  // When user switches to PayPal, drop any selected SUBSCRIPTION/FREE_TRIAL bumps.
  useEffect(() => {
    if (selectedPaymentMethod !== 'paypal') return;
    setSelectedBumpIds(prev => {
      const next = prev.filter(id => {
        const bump = availableBumps.find(b => b.id === id);
        return !bump || bump.type === 'ONE_TIME';
      });
      return next.length === prev.length ? prev : next;
    });
  }, [selectedPaymentMethod, availableBumps]);

  // ========== PROVIDER VALUE ==========
  const value: PaymentContextValue = {
    // State
    selectedPlan,
    selectedBumpIds,
    selectedPaymentMethod,
    couponCode,
    basePrice,
    couponDiscount,
    couponDiscountAmount,
    bumpTotal,
    finalPrice,
    taxAmount,
    shippingFee,
    isCouponValid,
    isProcessing,
    couponError,
    availablePlans,
    availableBumps,
    physicalSelection,
    isPhysicalProduct,

    // Actions
    selectPlan,
    toggleOrderBump,
    applyCoupon,
    removeCoupon,
    resetPayment,
    selectPaymentMethod,
    updatePhysicalSelection,
  };

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};

// ========== HOOKS ==========

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within PaymentProvider');
  }
  return context;
};

export const useSafePayment = (): PaymentContextValue => {
  try {
    return usePayment();
  } catch {
    // No PaymentProvider (editor mode) - return mock data from window.data
    const plans = window?.data?.payment?.offer?.pricePlans || [];
    const rawBumps: any[] = window?.data?.payment?.orderBumps || [];
    const selectedMethod = window?.data?.payment?.selectedPaymentMethod || 'stripe';

    const bumps: OrderBump[] = rawBumps.map((b: any): OrderBump | null => {
      if (b.offerType === "PHYSICAL" && b.physicalProduct) {
        return {
          id: b.id, label: b.label, displayName: b.physicalProduct.name ?? "",
          amount: b.physicalProduct.price,
          currency: b.physicalProduct.currency,
          type: "ONE_TIME", interval: null, trialDays: null,
          shippingFee: b.shippingFee ?? 0,
        };
      }
      if (!b.pricePlan) return null;
      return {
        id: b.id, label: b.label, displayName: b.pricePlan.name,
        amount: b.pricePlan.amount,
        currency: b.pricePlan.currency,
        type: b.pricePlan.type,
        interval: b.pricePlan.interval ?? null,
        trialDays: b.pricePlan.trialDays ?? null,
        shippingFee: 0,
      };
    }).filter((b): b is OrderBump => b !== null);

    const physProd = (window as any)?.data?.payment?.physicalProduct ?? null;
    const isPhysicalProduct = !!physProd;
    const unitPrice = physProd?.price ?? 0;
    const quantity = 1;
    const basePrice = isPhysicalProduct ? unitPrice * quantity : (plans[0]?.directChargeAmount ?? 0);
    const taxAmount = 0;
    const finalPrice = Math.max(0, basePrice);

    return {
      // State (read from window.data for preview)
      selectedPlan: plans[0] || null,
      selectedBumpIds: [],
      selectedPaymentMethod: selectedMethod,
      couponCode: '',
      basePrice,
      couponDiscount: 0,
      couponDiscountAmount: 0,
      bumpTotal: 0,
      finalPrice,
      taxAmount,
      shippingFee: isPhysicalProduct ? ((window as any)?.data?.payment?.shippingFee ?? 0) : 0,
      isCouponValid: false,
      isProcessing: false,
      couponError: '',
      availablePlans: plans,
      availableBumps: bumps,
      physicalSelection: { variantId: null, quantity: 1, unitPrice },
      isPhysicalProduct,

      // Actions (no-ops in editor mode)
      selectPlan: () => {},
      toggleOrderBump: () => {},
      applyCoupon: async () => {},
      removeCoupon: () => {},
      resetPayment: () => {},
      selectPaymentMethod: () => {},
      updatePhysicalSelection: () => {},
    };
  }
};

// ========== EXPORTS ==========
export type { PaymentContextValue, PricePlan, OrderBump };
