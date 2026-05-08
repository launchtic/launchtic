import React, { useState, useEffect } from "react";
import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { CountdownProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { CountdownSettings } from "./CountdownSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { Indicator } from "../../editor/common/Indicator";

// alignSelf is set on Countdown via AlignSelfProps; the values used in
// settings are CSS justify-content keywords ("flex-start" / "center" /
// "flex-end") so the same prop drives both ElementWrapper align-self AND
// internal layout alignment of the time-units row.
const CountdownContainer = styled.div<{
  $margin?: CountdownProps["margin"];
  $mobileMargin?: CountdownProps["mobileMargin"];
  $alignSelf?: string;
  $mobileAlignSelf?: string;
}>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $alignSelf }) => $alignSelf || "center"};
  justify-content: center;
  text-align: ${({ $alignSelf }) =>
    $alignSelf === "flex-start" ? "left" :
    $alignSelf === "flex-end"   ? "right" : "center"};

  ${({ $margin }) => css`
    ${$margin &&
    `margin: ${$margin.marginTop}px ${$margin.marginRight}px ${$margin.marginBottom}px ${$margin.marginLeft}px;`}
  `}

  @media (max-width: 800px) {
    align-items: ${({ $mobileAlignSelf, $alignSelf }) => $mobileAlignSelf || $alignSelf || "center"};
    text-align: ${({ $mobileAlignSelf, $alignSelf }) => {
      const v = $mobileAlignSelf || $alignSelf;
      return v === "flex-start" ? "left" : v === "flex-end" ? "right" : "center";
    }};

    ${({ $mobileMargin }) => css`
      ${$mobileMargin &&
      `margin: ${$mobileMargin.marginTop}px ${$mobileMargin.marginRight}px ${$mobileMargin.marginBottom}px ${$mobileMargin.marginLeft}px;`}
    `}
  }
`;

const TimeDisplay = styled.div<{
  $spacing?: number;
  $mobileSpacing?: number;
  $alignSelf?: string;
  $mobileAlignSelf?: string;
}>`
  display: flex;
  align-items: center;
  justify-content: ${({ $alignSelf }) => $alignSelf || "center"};
  gap: ${({ $spacing }) => $spacing || 20}px;
  flex-wrap: wrap;

  @media (max-width: 800px) {
    justify-content: ${({ $mobileAlignSelf, $alignSelf }) => $mobileAlignSelf || $alignSelf || "center"};
    gap: ${({ $mobileSpacing }) => $mobileSpacing || 15}px;
  }
`;

const TimeUnit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const TimeNumber = styled.span<{
  $timeFontSize?: number;
  $mobileTimeFontSize?: number;
  $timeColor?: string;
  $mobileTimeColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  font-size: ${({ $timeFontSize }) => $timeFontSize || 32}px;
  color: ${({ $timeColor }) => $timeColor || '#dc3545'};
  font-weight: bold;
  line-height: 1.2;
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "").trim()};` : ""}
  
  @media (max-width: 800px) {
    ${({ $mobileTimeFontSize }) => $mobileTimeFontSize && `font-size: ${$mobileTimeFontSize}px;`}
    ${({ $mobileTimeColor }) => $mobileTimeColor && `color: ${$mobileTimeColor};`}
  }
`;

const Separator = styled.span<{
  $timeFontSize?: number;
  $mobileTimeFontSize?: number;
  $timeColor?: string;
  $mobileTimeColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  font-size: ${({ $timeFontSize }) => $timeFontSize || 32}px;
  color: ${({ $timeColor }) => $timeColor || '#dc3545'};
  font-weight: bold;
  line-height: 1.2;
  align-self: flex-start;
  margin-top: 0;
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "").trim()};` : ""}
  
  @media (max-width: 800px) {
    ${({ $mobileTimeFontSize }) => $mobileTimeFontSize && `font-size: ${$mobileTimeFontSize}px;`}
    ${({ $mobileTimeColor }) => $mobileTimeColor && `color: ${$mobileTimeColor};`}
  }
`;

const TimeLabel = styled.span<{
  $textFontSize?: number;
  $mobileTextFontSize?: number;
  $labelColor?: string;
  $mobileLabelColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  font-size: ${({ $textFontSize }) => $textFontSize || 14}px;
  color: ${({ $labelColor }) => $labelColor || '#6c757d'};
  margin-top: 5px;
  letter-spacing: 1px;
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $fontStyle }) => $fontStyle ? `font-weight: ${$fontStyle.replace("italic", "").trim()};` : ""}
  
  @media (max-width: 800px) {
    ${({ $mobileTextFontSize }) => $mobileTextFontSize && `font-size: ${$mobileTextFontSize}px;`}
    ${({ $mobileLabelColor }) => $mobileLabelColor && `color: ${$mobileLabelColor};`}
  }
`;

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const Countdown: UserComponent<CountdownProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("countdown", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [hasExpired, setHasExpired] = useState(false);

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    alignSelf: getValueByViewMode(viewMode, props.alignSelf, props.mobileAlignSelf),
    mobileAlignSelf: props.mobileAlignSelf,

    // Countdown specific props
    countdownType: props.countdownType || 'fixed',
    targetDate: props.targetDate,
    targetTime: props.targetTime,
    days: props.days || 0,
    hours: props.hours || 1,
    minutes: props.minutes || 0,
    seconds: props.seconds || 0,
    dailyTime: props.dailyTime || '18:00',
    actionWhenExpires: props.actionWhenExpires || 'nothing',
    redirectionUrl: props.redirectionUrl || '',
    
    spacing: getValueByViewMode(viewMode, props.spacing, props.mobileSpacing),
    mobileSpacing: props.mobileSpacing,

    // Labels
    daysLabel: props.daysLabel || 'DAYS',
    hoursLabel: props.hoursLabel || 'HOURS',
    minutesLabel: props.minutesLabel || 'MINUTES',
    secondsLabel: props.secondsLabel || 'SECONDS',
    
    // Typography
    timeFontSize: getValueByViewMode(viewMode, props.timeFontSize, props.mobileTimeFontSize),
    textFontSize: getValueByViewMode(viewMode, props.textFontSize, props.mobileTextFontSize),
    timeColor: getValueByViewMode(viewMode, props.timeColor, props.mobileTimeColor),
    labelColor: getValueByViewMode(viewMode, props.labelColor, props.mobileLabelColor),
    fontFamily: props.fontFamily,
    fontStyle: props.fontStyle,
    
    // Mobile props for wrapper
    mobileMargin: props.mobileMargin,
    mobileTimeFontSize: props.mobileTimeFontSize,
    mobileTextFontSize: props.mobileTextFontSize,
    mobileTimeColor: props.mobileTimeColor,
    mobileLabelColor: props.mobileLabelColor,
  };

  const calculateTargetTime = (): number => {
    switch (resolvedProps.countdownType) {
      case 'fixed':
        if (resolvedProps.targetDate && resolvedProps.targetTime) {
          return new Date(`${resolvedProps.targetDate}T${resolvedProps.targetTime}`).getTime();
        }
        return Date.now() + 24 * 60 * 60 * 1000; // Default to 1 day from now
        
      case 'delay':
        return Date.now() + 
          (resolvedProps.days * 24 * 60 * 60 * 1000) +
          (resolvedProps.hours * 60 * 60 * 1000) +
          (resolvedProps.minutes * 60 * 1000) +
          (resolvedProps.seconds * 1000);
        
      case 'daily':
        const [hours, minutes] = resolvedProps.dailyTime.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        
        // If the time has passed today, set for tomorrow
        if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 1);
        }
        
        return target.getTime();
        
      default:
        return Date.now() + 24 * 60 * 60 * 1000;
    }
  };

  useEffect(() => {
    const targetTime = calculateTargetTime();
    
    const timer = setInterval(() => {
      const now = Date.now();
      const difference = targetTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
        setHasExpired(false);
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        if (!hasExpired) {
          setHasExpired(true);
          // Handle expiration action
          if (!enabled && resolvedProps.actionWhenExpires === 'redirect' && resolvedProps.redirectionUrl) {
              window.location.href = resolvedProps.redirectionUrl;
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [resolvedProps.countdownType, resolvedProps.targetDate, resolvedProps.targetTime, 
      resolvedProps.days, resolvedProps.hours, resolvedProps.minutes, resolvedProps.seconds,
      resolvedProps.dailyTime, resolvedProps.actionWhenExpires, resolvedProps.redirectionUrl, hasExpired]);

  const formatNumber = (num: number): string => {
    return num.toString().padStart(2, '0');
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Countdown">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault=""
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Countdown"} /> : null}
          <CountdownContainer
            id={props.htmlAttrId || elementId}
            $margin={resolvedProps.margin}
            $mobileMargin={resolvedProps.mobileMargin}
            $alignSelf={resolvedProps.alignSelf}
            $mobileAlignSelf={resolvedProps.mobileAlignSelf}
          >
            <TimeDisplay
              $spacing={resolvedProps.spacing}
              $mobileSpacing={resolvedProps.mobileSpacing}
              $alignSelf={resolvedProps.alignSelf}
              $mobileAlignSelf={resolvedProps.mobileAlignSelf}
            >
              {/* Days - Only show if not daily mode */}
              {resolvedProps.countdownType !== 'daily' && (
                <>
                  <TimeUnit>
                    <TimeNumber
                      $timeFontSize={resolvedProps.timeFontSize}
                      $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                      $timeColor={resolvedProps.timeColor}
                      $mobileTimeColor={resolvedProps.mobileTimeColor}
                      $fontFamily={resolvedProps.fontFamily}
                      $fontStyle={resolvedProps.fontStyle}
                    >
                      {formatNumber(timeLeft.days)}
                    </TimeNumber>
                    <TimeLabel
                      $textFontSize={resolvedProps.textFontSize}
                      $mobileTextFontSize={resolvedProps.mobileTextFontSize}
                      $labelColor={resolvedProps.labelColor}
                      $mobileLabelColor={resolvedProps.mobileLabelColor}
                      $fontFamily={resolvedProps.fontFamily}
                      $fontStyle={resolvedProps.fontStyle}
                    >
                      {resolvedProps.daysLabel}
                    </TimeLabel>
                  </TimeUnit>

                  <Separator
                    $timeFontSize={resolvedProps.timeFontSize}
                    $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                    $timeColor={resolvedProps.timeColor}
                    $mobileTimeColor={resolvedProps.mobileTimeColor}
                    $fontFamily={resolvedProps.fontFamily}
                    $fontStyle={resolvedProps.fontStyle}
                  >
                    :
                  </Separator>
                </>
              )}

              <TimeUnit>
                <TimeNumber
                  $timeFontSize={resolvedProps.timeFontSize}
                  $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                  $timeColor={resolvedProps.timeColor}
                  $mobileTimeColor={resolvedProps.mobileTimeColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {formatNumber(timeLeft.hours)}
                </TimeNumber>
                <TimeLabel
                  $textFontSize={resolvedProps.textFontSize}
                  $mobileTextFontSize={resolvedProps.mobileTextFontSize}
                  $labelColor={resolvedProps.labelColor}
                  $mobileLabelColor={resolvedProps.mobileLabelColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {resolvedProps.hoursLabel}
                </TimeLabel>
              </TimeUnit>

              <Separator
                $timeFontSize={resolvedProps.timeFontSize}
                $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                $timeColor={resolvedProps.timeColor}
                $mobileTimeColor={resolvedProps.mobileTimeColor}
                $fontFamily={resolvedProps.fontFamily}
                $fontStyle={resolvedProps.fontStyle}
              >
                :
              </Separator>

              <TimeUnit>
                <TimeNumber
                  $timeFontSize={resolvedProps.timeFontSize}
                  $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                  $timeColor={resolvedProps.timeColor}
                  $mobileTimeColor={resolvedProps.mobileTimeColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {formatNumber(timeLeft.minutes)}
                </TimeNumber>
                <TimeLabel
                  $textFontSize={resolvedProps.textFontSize}
                  $mobileTextFontSize={resolvedProps.mobileTextFontSize}
                  $labelColor={resolvedProps.labelColor}
                  $mobileLabelColor={resolvedProps.mobileLabelColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {resolvedProps.minutesLabel}
                </TimeLabel>
              </TimeUnit>

              <Separator
                $timeFontSize={resolvedProps.timeFontSize}
                $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                $timeColor={resolvedProps.timeColor}
                $mobileTimeColor={resolvedProps.mobileTimeColor}
                $fontFamily={resolvedProps.fontFamily}
                $fontStyle={resolvedProps.fontStyle}
              >
                :
              </Separator>

              <TimeUnit>
                <TimeNumber
                  $timeFontSize={resolvedProps.timeFontSize}
                  $mobileTimeFontSize={resolvedProps.mobileTimeFontSize}
                  $timeColor={resolvedProps.timeColor}
                  $mobileTimeColor={resolvedProps.mobileTimeColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {formatNumber(timeLeft.seconds)}
                </TimeNumber>
                <TimeLabel
                  $textFontSize={resolvedProps.textFontSize}
                  $mobileTextFontSize={resolvedProps.mobileTextFontSize}
                  $labelColor={resolvedProps.labelColor}
                  $mobileLabelColor={resolvedProps.mobileLabelColor}
                  $fontFamily={resolvedProps.fontFamily}
                  $fontStyle={resolvedProps.fontStyle}
                >
                  {resolvedProps.secondsLabel}
                </TimeLabel>
              </TimeUnit>
            </TimeDisplay>
          </CountdownContainer>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Countdown.craft = {
  props: { ...DEFAULT_STYLES.countdown },
  related: { settings: CountdownSettings },
  displayName: "Countdown",
};