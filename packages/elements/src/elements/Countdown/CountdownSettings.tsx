import React from "react";
import { useNode } from "@launchtic/editor-core";
import { CountdownProps, CountdownType, CountdownAction } from "../ElementProps";
import { 
  SettingsGroup, 
  SettingsGroupLarge, 
  Label, 
  SliderControl, 
  Select,
  TwoColumnGrid,
  CompactInputGroup,
  InputGroup,
  Input,
} from "../../editor/common/SettingsUI";
import { AlignSelfSettings } from "../../editor/toolbar/AlignSelfSettings";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";

import { useAppContext } from "../../contexts/AppContext";
import styled from "styled-components";

export const CountdownSettings: React.FC = () => {
  const { viewMode } = useAppContext();
  const {
    actions: { setProp },
    countdownType,
    targetDate,
    targetTime,
    days,
    hours,
    minutes,
    seconds,
    dailyTime,
    actionWhenExpires,
    redirectionUrl,
    daysLabel,
    hoursLabel,
    minutesLabel,
    secondsLabel,
    timeFontSize,
    mobileTimeFontSize,
    textFontSize,
    mobileTextFontSize,
    fontType,
    fontFamily,
    fontStyle,
    timeColor,
    mobileTimeColor,
    labelColor,
    mobileLabelColor,
    appearance,
    delay,
    margin,
    mobileMargin,
    alignSelf,
    mobileAlignSelf,
    spacing,
    mobileSpacing
  } = useNode<CountdownProps>((node) => ({
    countdownType: node.data.props.countdownType,
    targetDate: node.data.props.targetDate,
    targetTime: node.data.props.targetTime,
    days: node.data.props.days,
    hours: node.data.props.hours,
    minutes: node.data.props.minutes,
    seconds: node.data.props.seconds,
    dailyTime: node.data.props.dailyTime,
    actionWhenExpires: node.data.props.actionWhenExpires,
    redirectionUrl: node.data.props.redirectionUrl,
    spacing: node.data.props.spacing,
    mobileSpacing: node.data.props.mobileSpacing,
    daysLabel: node.data.props.daysLabel,
    hoursLabel: node.data.props.hoursLabel,
    minutesLabel: node.data.props.minutesLabel,
    secondsLabel: node.data.props.secondsLabel,
    timeFontSize: node.data.props.timeFontSize,
    mobileTimeFontSize: node.data.props.mobileTimeFontSize,
    textFontSize: node.data.props.textFontSize,
    mobileTextFontSize: node.data.props.mobileTextFontSize,
    fontType: node.data.props.fontType,
    fontFamily: node.data.props.fontFamily,
    fontStyle: node.data.props.fontStyle,
    timeColor: node.data.props.timeColor,
    mobileTimeColor: node.data.props.mobileTimeColor,
    labelColor: node.data.props.labelColor,
    mobileLabelColor: node.data.props.mobileLabelColor,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    alignSelf: node.data.props.alignSelf,
    mobileAlignSelf: node.data.props.mobileAlignSelf,
  }));

  const updateProp = <K extends keyof CountdownProps>(key: K) => (value: CountdownProps[K]) => {
    setProp((props: CountdownProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Countdown Type Settings */}
      <SettingsGroupLarge>
        <Label>Countdown type</Label>
        
        <Select
          value={countdownType || 'fixed'}
          onChange={(e) => updateProp("countdownType")(e.target.value as CountdownType)}
        >
          <option value="fixed">Fixed time and date</option>
          <option value="delay">Delay</option>
          <option value="daily">Daily</option>
        </Select>

        {/* Fixed Date Settings */}
        {countdownType === 'fixed' && (
          <>
            <InputGroup>
              <Input
                type="date"
                value={targetDate || new Date().toISOString().split('T')[0]}
                onChange={(e) => updateProp("targetDate")(e.target.value)}
              />
            </InputGroup>
            <InputGroup>
              <Input
                type="time"
                value={targetTime || "23:59"}
                onChange={(e) => updateProp("targetTime")(e.target.value)}
              />
            </InputGroup>
          </>
        )}

        {/* Delay Settings */}
        {countdownType === 'delay' && (
          <>
            <Label $small>Days</Label>
            <SliderControl
              value={days || 0}
              min={0}
              max={365}
              onChange={updateProp("days")}
            />
            
            <Label $small>Hours</Label>
            <SliderControl
              value={hours || 1}
              min={0}
              max={23}
              onChange={updateProp("hours")}
            />
            
            <Label $small>Minutes</Label>
            <SliderControl
              value={minutes || 0}
              min={0}
              max={59}
              onChange={updateProp("minutes")}
            />
            
            <Label $small>Seconds</Label>
            <SliderControl
              value={seconds || 0}
              min={0}
              max={59}
              onChange={updateProp("seconds")}
            />
          </>
        )}

        {/* Daily Settings */}
        {countdownType === 'daily' && (
          <InputGroup>
            <Input
              type="time"
              value={dailyTime || "18:00"}
              onChange={(e) => updateProp("dailyTime")(e.target.value)}
            />
          </InputGroup>
        )}
      </SettingsGroupLarge>

      {/* Action When Expires */}
      <SettingsGroupLarge>
        <Label>Action when countdown expires?</Label>
        
        <Select
          value={actionWhenExpires || 'nothing'}
          onChange={(e) => updateProp("actionWhenExpires")(e.target.value as CountdownAction)}
        >
          <option value="nothing">Do nothing</option>
          <option value="redirect">Redirect to URL</option>
        </Select>

        {actionWhenExpires === 'redirect' && (
          <InputGroup>
            <Label $small>Redirection URL</Label>
            <Input
              type="url"
              value={redirectionUrl || ''}
              onChange={(e) => updateProp("redirectionUrl")(e.target.value)}
              placeholder="Enter a URL"
            />
          </InputGroup>
        )}
      </SettingsGroupLarge>
      
      <SettingsGroupLarge>
        <Label>Spacing</Label>
        
        <FontSizeSettings
          fontSize={{ mobile: mobileSpacing, desktop: spacing }}
          setFontSize={(value) => {
            updateProp("spacing")(value.desktop);
            updateProp("mobileSpacing")(value.mobile);
          }}
          label="Space between units"
          min={1}
          max={50}
          step={2}
        />
      </SettingsGroupLarge>
      {/* Labels Settings */}
      <SettingsGroupLarge>
        <Label>Labels</Label>
        
        <TwoColumnGrid>
          <CompactInputGroup>
            <Label $small>Days</Label>
            <Input
              value={daysLabel || 'DAYS'}
              onChange={(e) => updateProp("daysLabel")(e.target.value)}
              placeholder="DAYS"
            />
          </CompactInputGroup>
          
          <CompactInputGroup>
            <Label $small>Hours</Label>
            <Input
              value={hoursLabel || 'HOURS'}
              onChange={(e) => updateProp("hoursLabel")(e.target.value)}
              placeholder="HOURS"
            />
          </CompactInputGroup>
          
          <CompactInputGroup>
            <Label $small>Minutes</Label>
            <Input
              value={minutesLabel || 'MINUTES'}
              onChange={(e) => updateProp("minutesLabel")(e.target.value)}
              placeholder="MINUTES"
            />
          </CompactInputGroup>
          
          <CompactInputGroup>
            <Label $small>Seconds</Label>
            <Input
              value={secondsLabel || 'SECONDS'}
              onChange={(e) => updateProp("secondsLabel")(e.target.value)}
              placeholder="SECONDS"
            />
          </CompactInputGroup>
        </TwoColumnGrid>
      </SettingsGroupLarge>

      {/* Typography Settings */}
      <SettingsGroupLarge>
        <Label>Typography</Label>
        
        <FontSizeSettings
          fontSize={{ mobile: mobileTimeFontSize, desktop: timeFontSize }}
          setFontSize={(value) => {
            updateProp("timeFontSize")(value.desktop);
            updateProp("mobileTimeFontSize")(value.mobile);
          }}
          label="Time font size"
        />

        <FontSizeSettings
          fontSize={{ mobile: mobileTextFontSize, desktop: textFontSize }}
          setFontSize={(value) => {
            updateProp("textFontSize")(value.desktop);
            updateProp("mobileTextFontSize")(value.mobile);
          }}
          label="Text font size"
        />
        <FontTypeSettings
          fontType={fontType}
          setFontType={updateProp("fontType")}
          fontFamily={fontFamily}
          setFontFamily={updateProp("fontFamily")}
          fontStyle={fontStyle}
          setFontStyle={updateProp("fontStyle")}
        />
      </SettingsGroupLarge>

      {/* Color Settings */}
      <SettingsGroupLarge>
        <Label>Color</Label>
        
        <TextColorSettings
          color={{ mobile: mobileTimeColor, desktop: timeColor }}
          defaultColor="#dc3545"
          setColor={(value) => {
            updateProp("timeColor")(value.desktop);
            updateProp("mobileTimeColor")(value.mobile);
          }}
          label="Time color"
        />

        <TextColorSettings
          color={{ mobile: mobileLabelColor, desktop: labelColor }}
          defaultColor="#6c757d"
          setColor={(value) => {
            updateProp("labelColor")(value.desktop);
            updateProp("mobileLabelColor")(value.mobile);
          }}
          label="Label color"
        />
      </SettingsGroupLarge>

      {/* Alignment (left / center / right) */}
      <AlignSelfSettings
        alignSelf={{ desktop: alignSelf, mobile: mobileAlignSelf }}
        setAlignSelf={(value) => {
          updateProp("alignSelf")(value.desktop);
          updateProp("mobileAlignSelf")(value.mobile);
        }}
      />

      {/* Size and Position */}
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* Advanced Settings */}
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />
      
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />
      
      <IDAttributeSettings/>
    </>
  );
};