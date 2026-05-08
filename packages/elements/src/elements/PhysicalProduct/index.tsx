import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { UserComponent } from "@craftjs/core";
import styled, { css, keyframes } from "styled-components";
import { PhysicalProductProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { PhysicalProductSettings } from "./PhysicalProductSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { Indicator } from "../../editor/common/Indicator";
import { useSafePayment } from "../../contexts/PaymentContext";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductOption { id: string; name: string; values: string[] }
interface ProductVariant {
  id: string; name: string; combination: string[];
  sku: string | null; price: number | null; image: string | null;
}
interface PhysicalProductData {
  id: string; name: string; description: string | null;
  images: string[]; price: number; currency: string;
  options: ProductOption[]; variants: ProductVariant[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPrice = (cents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
};

const findVariant = (
  variants: ProductVariant[], options: ProductOption[], selectedOptions: Record<string, string>
): ProductVariant | null => {
  if (!variants.length || !options.length) return null;
  const target = options.map((opt) => selectedOptions[opt.id] ?? "");
  return variants.find((v) => v.combination.length === target.length && v.combination.every((val, i) => val === target[i])) ?? null;
};

// ─── Styled Components ───────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0 } to { opacity: 1 }`;

const Container = styled.div<{ $mobile: boolean }>`
  display: flex;
  gap: 24px;
  align-items: flex-start;
  flex-direction: ${({ $mobile }) => ($mobile ? "column" : "row")};
  @media (max-width: 600px) { flex-direction: column; }
`;

const ImageSection = styled.div<{ $mobile: boolean }>`
  flex: 0 0 auto;
  width: ${({ $mobile }) => ($mobile ? "100%" : "260px")};
  @media (max-width: 600px) { width: 100%; }
`;

const ImageBox = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #f4f4f4;
  border-radius: 10px;
  overflow: hidden;
  cursor: zoom-in;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ProductImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s;
  ${ImageBox}:hover & { transform: scale(1.03); }
`;

const ImagePlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #bbb;
  gap: 8px;
  font-size: 13px;
  cursor: default;
`;

const CarouselBtn = styled.button<{ $side: "left" | "right" }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${({ $side }) => $side === "left" ? "left: 8px;" : "right: 8px;"}
  background: rgba(0,0,0,0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  z-index: 2;
  transition: background 0.15s;
  &:hover { background: rgba(0,0,0,0.8); }
`;

const ThumbnailRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
`;

const Thumb = styled.div<{ $active: boolean }>`
  width: 52px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid ${({ $active }) => ($active ? "#1976d2" : "transparent")};
  background: #f0f0f0;
  flex-shrink: 0;
  transition: border-color 0.15s;
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  &:hover { border-color: #90caf9; }
`;

const InfoSection = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ProductName = styled.div<{
  $fontSize: number; $color: string;
  $lineHeight?: number; $fontFamily?: string; $fontStyle?: string;
}>`
  font-weight: 700;
  font-size: ${({ $fontSize }) => $fontSize}px;
  color: ${({ $color }) => $color};
  line-height: ${({ $lineHeight }) => $lineHeight ? `${$lineHeight}px` : "1.3"};
  ${({ $fontFamily }) => $fontFamily ? `font-family: ${$fontFamily};` : ""}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? "font-style: italic;" : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "") || "700"};` : ""}
`;

const PriceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PriceBadge = styled.span<{
  $fontSize: number; $color: string;
  $lineHeight?: number; $fontFamily?: string; $fontStyle?: string;
}>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: ${({ $fontSize }) => $fontSize}px;
  color: ${({ $color }) => $color};
  font-weight: 600;
  ${({ $lineHeight }) => $lineHeight ? `line-height: ${$lineHeight}px;` : ""}
  ${({ $fontFamily }) => $fontFamily ? `font-family: ${$fontFamily};` : ""}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? "font-style: italic;" : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "") || "600"};` : ""}
`;

const CurrencyLabel = styled.span`
  font-size: 0.72em;
  font-weight: 500;
  opacity: 0.7;
  text-transform: uppercase;
  background: rgba(0,0,0,0.07);
  padding: 2px 5px;
  border-radius: 4px;
`;

const Description = styled.div<{
  $fontSize: number; $color: string;
  $lineHeight?: number; $fontFamily?: string; $fontStyle?: string;
}>`
  font-size: ${({ $fontSize }) => $fontSize}px;
  color: ${({ $color }) => $color};
  line-height: ${({ $lineHeight }) => $lineHeight ? `${$lineHeight}px` : "1.6"};
  ${({ $fontFamily }) => $fontFamily ? `font-family: ${$fontFamily};` : ""}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? "font-style: italic;" : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
`;

const QuantityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const QuantityLabel = styled.span` font-size: 14px; font-weight: 500; `;

const QuantityControl = styled.div`
  display: flex;
  align-items: center;
  border: 1.5px solid #d0d0d0;
  border-radius: 8px;
  overflow: hidden;
`;

const QtyButton = styled.button`
  width: 34px;
  height: 34px;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  padding: 0;
  &:hover { background: #e8e8e8; }
  &:disabled { opacity: 0.35; cursor: default; }
`;

const QtyValue = styled.span`
  min-width: 38px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  padding: 0 4px;
`;

const OptionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const OptionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const OptionGroupLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #333;
`;

const PillsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Pill = styled.button<{
  $selected: boolean;
  $color?: string; $selectedColor?: string;
  $borderColor?: string; $selectedBorderColor?: string;
}>`
  padding: 6px 16px;
  border-radius: 20px;
  border: 1.5px solid ${({ $selected, $borderColor, $selectedBorderColor }) =>
    $selected ? ($selectedBorderColor ?? "#1976d2") : ($borderColor ?? "#d0d0d0")};
  background: ${({ $selected, $color, $selectedColor }) =>
    $selected ? ($selectedColor ?? "#1976d2") : ($color ?? "transparent")};
  color: ${({ $selected }) => ($selected ? "#fff" : "inherit")};
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  &:hover {
    border-color: ${({ $selectedBorderColor }) => $selectedBorderColor ?? "#1976d2"};
    background: ${({ $selected, $selectedColor }) =>
      $selected ? ($selectedColor ?? "#1565c0") : "rgba(25,118,210,0.08)"};
  }
`;

// ─── Zoom / Lightbox ─────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.15s ease;
`;

const ZoomImg = styled.img`
  max-width: min(90vw, 900px);
  max-height: 75vh;
  object-fit: contain;
  border-radius: 8px;
  user-select: none;
`;

const ZoomNav = styled.button<{ $side: "left" | "right" }>`
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  ${({ $side }) => $side === "left" ? "left: 16px;" : "right: 16px;"}
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  &:hover { background: rgba(255,255,255,0.3); }
`;

const ZoomClose = styled.button`
  position: fixed;
  top: 16px;
  right: 20px;
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: rgba(255,255,255,0.3); }
`;

const ZoomThumbs = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  overflow-x: auto;
  max-width: min(90vw, 900px);
  padding-bottom: 4px;
`;

const ZoomThumb = styled.div<{ $active: boolean }>`
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid ${({ $active }) => ($active ? "#fff" : "transparent")};
  opacity: ${({ $active }) => ($active ? 1 : 0.55)};
  flex-shrink: 0;
  transition: opacity 0.15s, border-color 0.15s;
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  &:hover { opacity: 1; }
`;

function ImageZoomModal({
  images,
  initialIdx,
  onClose,
}: {
  images: string[];
  initialIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIdx);
  const count = images.length;

  const prev = useCallback(() => setIdx((i) => (i - 1 + count) % count), [count]);
  const next = useCallback(() => setIdx((i) => (i + 1) % count), [count]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  const content = (
    <Overlay onClick={onClose}>
      <ZoomClose onClick={onClose} type="button">✕</ZoomClose>
      <ZoomImg
        src={images[idx]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {count > 1 && (
        <>
          <ZoomNav $side="left" type="button" onClick={(e) => { e.stopPropagation(); prev(); }}>
            <i className="fas fa-chevron-left" />
          </ZoomNav>
          <ZoomNav $side="right" type="button" onClick={(e) => { e.stopPropagation(); next(); }}>
            <i className="fas fa-chevron-right" />
          </ZoomNav>
          <ZoomThumbs onClick={(e) => e.stopPropagation()}>
            {images.map((url, i) => (
              <ZoomThumb key={i} $active={i === idx} onClick={() => setIdx(i)}>
                <img src={url} alt="" draggable={false} />
              </ZoomThumb>
            ))}
          </ZoomThumbs>
        </>
      )}
    </Overlay>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_PRODUCT: PhysicalProductData = {
  id: "demo",
  name: "Product Name",
  description: "Product description goes here.",
  images: [],
  price: 2900,
  currency: "USD",
  options: [{ id: "opt-demo", name: "Size", values: ["S", "M", "L", "XL"] }],
  variants: [],
};

// ─── Component ───────────────────────────────────────────────────────────────

export const PhysicalProduct: UserComponent<PhysicalProductProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("physicalProduct", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  const isMobile = viewMode === "mobile";
  const { updatePhysicalSelection } = useSafePayment();

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);

  const resolvedMargin = getValueByViewMode(viewMode, props.margin, props.mobileMargin);
  const resolvedAppearance = getAppearanceByViewMode(viewMode, props.appearance);

  const nameFontSize = getValueByViewMode(viewMode, props.nameFontSize, props.mobileNameFontSize) ?? 20;
  const nameLineHeight = getValueByViewMode(viewMode, props.nameLineHeight, props.mobileNameLineHeight);
  const nameColor = getValueByViewMode(viewMode, props.nameColor, props.mobileNameColor) ?? "rgba(0,0,0,1)";
  const priceFontSize = getValueByViewMode(viewMode, props.priceFontSize, props.mobilePriceFontSize) ?? 18;
  const priceLineHeight = getValueByViewMode(viewMode, props.priceLineHeight, props.mobilePriceLineHeight);
  const priceColor = getValueByViewMode(viewMode, props.priceColor, props.mobilePriceColor) ?? "rgba(0,0,0,1)";
  const descriptionFontSize = getValueByViewMode(viewMode, props.descriptionFontSize, props.mobileDescriptionFontSize) ?? 14;
  const descriptionLineHeight = getValueByViewMode(viewMode, props.descriptionLineHeight, props.mobileDescriptionLineHeight);
  const descriptionColor = getValueByViewMode(viewMode, props.descriptionColor, props.mobileDescriptionColor) ?? "rgba(80,80,80,1)";

  // 1. Always read real data from window.data.payment; fall back to demo
  const product: PhysicalProductData =
    (typeof window !== "undefined" ? (window as any)?.data?.payment?.physicalProduct : null) ?? DEMO_PRODUCT;

  const images = product.images ?? [];
  const options = product.options ?? [];
  const variants = product.variants ?? [];
  const imageCount = images.length;
  const safeIdx = imageCount > 0 ? Math.min(currentImageIdx, imageCount - 1) : 0;

  const selectedVariant = findVariant(variants, options, selectedOptions);
  const displayPrice = selectedVariant?.price != null ? selectedVariant.price : product.price;

  useEffect(() => {
    if (variants.length > 0) {
      const first = variants[0];
      const firstOpts: Record<string, string> = {};
      options.forEach((opt: any, i: number) => {
        firstOpts[opt.id] = first.combination?.[i] ?? opt.values?.[0] ?? '';
      });
      setSelectedOptions(firstOpts);
      updatePhysicalSelection({ variantId: first.id, quantity: 1, unitPrice: first.price ?? product.price });
    } else {
      updatePhysicalSelection({ variantId: null, quantity: 1, unitPrice: product.price });
    }
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOptionSelect = (optionId: string, value: string) => {
    const next = { ...selectedOptions, [optionId]: value };
    setSelectedOptions(next);
    const variant = findVariant(variants, options, next);
    updatePhysicalSelection({
      variantId: variant?.id ?? null,
      unitPrice: variant?.price ?? product.price,
    });
  };

  const handleQtyChange = (delta: number) => {
    const next = Math.max(1, quantity + delta);
    setQuantity(next);
    updatePhysicalSelection({ quantity: next });
  };

  return (
    <DelayedRender delay={props.delay}>
      <ElementDrag elementType="PhysicalProduct">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedMargin}
          $mobileMargin={props.mobileMargin}
          $appearance={resolvedAppearance}
          $cssDefault=""
        >
          {((enabled && isActive) || (enabled && isHover)) && <Indicator name="Physical Product" />}

          <Container $mobile={isMobile} id={props.htmlAttrId || elementId}>
            {/* ── Image section ── */}
            <ImageSection $mobile={isMobile}>
              <ImageBox onClick={() => imageCount > 0 && !enabled && setZoomIdx(safeIdx)}>
                {imageCount > 0 ? (
                  <>
                    <ProductImage src={images[safeIdx]} alt={product.name} />
                    {imageCount > 1 && (
                      <>
                        <CarouselBtn
                          $side="left" type="button"
                          onClick={(e) => { e.stopPropagation(); setCurrentImageIdx((i) => (i - 1 + imageCount) % imageCount); }}
                        >
                          <i className="fas fa-chevron-left" />
                        </CarouselBtn>
                        <CarouselBtn
                          $side="right" type="button"
                          onClick={(e) => { e.stopPropagation(); setCurrentImageIdx((i) => (i + 1) % imageCount); }}
                        >
                          <i className="fas fa-chevron-right" />
                        </CarouselBtn>
                      </>
                    )}
                  </>
                ) : (
                  <ImagePlaceholder>
                    <i className="fas fa-image" style={{ fontSize: 40 }} />
                    <span>No image</span>
                  </ImagePlaceholder>
                )}
              </ImageBox>

              {/* Thumbnail strip */}
              {imageCount > 1 && (
                <ThumbnailRow>
                  {images.map((url, idx) => (
                    <Thumb key={idx} $active={idx === safeIdx} onClick={() => setCurrentImageIdx(idx)}>
                      <img src={url} alt="" draggable={false} />
                    </Thumb>
                  ))}
                </ThumbnailRow>
              )}
            </ImageSection>

            {/* ── Info section ── */}
            <InfoSection>
              <ProductName
                $fontSize={nameFontSize} $color={nameColor}
                $lineHeight={nameLineHeight}
                $fontFamily={props.nameFontFamily}
                $fontStyle={props.nameFontStyle}
              >
                {product.name}
              </ProductName>

              <PriceRow>
                <PriceBadge
                  $fontSize={priceFontSize} $color={priceColor}
                  $lineHeight={priceLineHeight}
                  $fontFamily={props.priceFontFamily}
                  $fontStyle={props.priceFontStyle}
                >
                  <CurrencyLabel>{product.currency}</CurrencyLabel>
                  {formatPrice(displayPrice, product.currency)}
                </PriceBadge>
              </PriceRow>

              {product.description && (
                <Description
                  $fontSize={descriptionFontSize} $color={descriptionColor}
                  $lineHeight={descriptionLineHeight}
                  $fontFamily={props.descriptionFontFamily}
                  $fontStyle={props.descriptionFontStyle}
                >
                  {product.description}
                </Description>
              )}

              {options.length > 0 && (
                <OptionsSection>
                  {options.map((option) => (
                    <OptionGroup key={option.id}>
                      <OptionGroupLabel>{option.name}</OptionGroupLabel>
                      <PillsRow>
                        {option.values.map((value) => (
                          <Pill
                            key={value} type="button"
                            $selected={selectedOptions[option.id] === value}
                            $color={props.pillColor}
                            $selectedColor={props.pillSelectedColor}
                            $borderColor={props.pillBorderColor}
                            $selectedBorderColor={props.pillSelectedBorderColor}
                            onClick={() => handleOptionSelect(option.id, value)}
                          >
                            {value}
                          </Pill>
                        ))}
                      </PillsRow>
                    </OptionGroup>
                  ))}
                </OptionsSection>
              )}

              {(props.showQuantity ?? true) && (
                <QuantityRow>
                  <QuantityLabel>Quantity</QuantityLabel>
                  <QuantityControl>
                    <QtyButton type="button" onClick={() => handleQtyChange(-1)} disabled={quantity <= 1}>−</QtyButton>
                    <QtyValue>{quantity}</QtyValue>
                    <QtyButton type="button" onClick={() => handleQtyChange(1)}>+</QtyButton>
                  </QuantityControl>
                </QuantityRow>
              )}
            </InfoSection>
          </Container>

          {/* Zoom lightbox — only in render mode */}
          {zoomIdx !== null && !enabled && (
            <ImageZoomModal
              images={images}
              initialIdx={zoomIdx}
              onClose={() => setZoomIdx(null)}
            />
          )}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

PhysicalProduct.craft = {
  props: { ...DEFAULT_STYLES.physicalProduct },
  related: { settings: PhysicalProductSettings },
  displayName: "PhysicalProduct",
};
