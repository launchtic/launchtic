import React from "react";
import { useNode } from "@launchtic/editor-core";
import { FAQProps, FAQItemProps } from "../ElementProps";
import {
  SettingsGroupLarge,
  Label,
  SliderControl,
  CheckboxWrapper,
  CheckboxInput,
  LightButton,
} from "../../editor/common/SettingsUI";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { IconSelectorSettings } from "../../editor/toolbar/IconSelectorSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { IconColorSettings } from "../../editor/toolbar/IconColorSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";

import styled from "styled-components";

const FAQItemContainer = styled.div<{ $isVisible: boolean }>`
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 10px;
  transition: all 0.2s ease;
`;

const FAQItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: #f8f9fa;
  border-radius: 8px;
  gap: 10px;

  .question-text {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
    font-size: 14px;
  }

  .controls {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
`;

export const FAQSettings: React.FC = () => {
  const {
    actions: { setProp },
    items,
    spaceBetweenItems,
    borderRadius,
    itemBorder,
    mobileItemBorder,
    itemPadding,
    mobileItemPadding,
    displayDropdownIcons,
    iconOpenState,
    iconClosedState,
    questionFontSize,
    mobileQuestionFontSize,
    questionColor,
    mobileQuestionColor,
    questionFontType,
    questionFontFamily,
    questionFontStyle,
    questionBackgroundColor,
    mobileQuestionBackgroundColor,
    answerBackgroundColor,
    mobileAnswerBackgroundColor,
    answerFontSize,
    mobileAnswerFontSize,
    answerColor,
    mobileAnswerColor,
    answerFontFamily,
    answerFontStyle,
    iconColor,
    mobileIconColor,
    appearance,
    delay,
    margin,
    mobileMargin,
    padding,
    mobilePadding,
    boxShadow,
    mobileBoxShadow,
  } = useNode<FAQProps>((node) => ({
    items: node.data.props.items,
    spaceBetweenItems: node.data.props.spaceBetweenItems,
    borderRadius: node.data.props.borderRadius,
    itemBorder: node.data.props.itemBorder,
    mobileItemBorder: node.data.props.mobileItemBorder,
    itemPadding: node.data.props.itemPadding,
    mobileItemPadding: node.data.props.mobileItemPadding,
    displayDropdownIcons: node.data.props.displayDropdownIcons,
    iconOpenState: node.data.props.iconOpenState,
    iconClosedState: node.data.props.iconClosedState,
    questionFontSize: node.data.props.questionFontSize,
    mobileQuestionFontSize: node.data.props.mobileQuestionFontSize,
    questionColor: node.data.props.questionColor,
    mobileQuestionColor: node.data.props.mobileQuestionColor,
    questionFontType: node.data.props.questionFontType,
    questionFontFamily: node.data.props.questionFontFamily,
    questionFontStyle: node.data.props.questionFontStyle,
    questionBackgroundColor: node.data.props.questionBackgroundColor,
    mobileQuestionBackgroundColor: node.data.props.mobileQuestionBackgroundColor,
    answerBackgroundColor: node.data.props.answerBackgroundColor,
    mobileAnswerBackgroundColor: node.data.props.mobileAnswerBackgroundColor,
    answerFontSize: node.data.props.answerFontSize,
    mobileAnswerFontSize: node.data.props.mobileAnswerFontSize,
    answerColor: node.data.props.answerColor,
    mobileAnswerColor: node.data.props.mobileAnswerColor,
    answerFontFamily: node.data.props.answerFontFamily,
    answerFontStyle: node.data.props.answerFontStyle,
    iconColor: node.data.props.iconColor,
    mobileIconColor: node.data.props.mobileIconColor,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
  }));

  // Popular icons for FAQ - the 12 most common icons
  const FAQ_POPULAR_ICONS = [
    'fas fa-chevron-down',
    'fas fa-chevron-up',
    'fas fa-chevron-right',
    'fas fa-angle-down',
    'fas fa-angle-up', 
    'fas fa-angle-right',
    'fas fa-plus',
    'fas fa-minus',
    'fas fa-plus-circle',
    'fas fa-minus-circle',
    'fas fa-caret-down',
    'fas fa-caret-up'
  ];
  const updateProp = <K extends keyof FAQProps>(key: K) => (value: FAQProps[K]) => {
    setProp((props: FAQProps) => {
      props[key] = value;
    });
  };

  const addFAQItem = () => {
    const newItem: FAQItemProps = {
      id: `faq-${Date.now()}`,
      questionHtml: "<p>New question</p>",
      answerHtml: "<p>Your answer goes here.</p>",
      isOpen: false,
    };
    updateProp("items")([...items, newItem]);
  };

  const toggleItemIsOpen = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], isOpen: !newItems[index].isOpen };
    updateProp("items")(newItems);
  };

  const deleteFAQItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    updateProp("items")(newItems);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newItems.length) {
      [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
      updateProp("items")(newItems);
    }
  };

  return (
    <>
      {/* FAQ Items Management - Only question editing now */}
      <SettingsGroupLarge>
        <Label>FAQ Items</Label>
        
        {items.map((item, index) => {
          // Strip tags from rich question for the preview label.
          const preview = (item.questionHtml || "").replace(/<[^>]*>/g, "") || "(empty)";
          return (
            <FAQItemContainer key={item.id} $isVisible={true}>
              <FAQItemHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <span style={{ flexShrink: 0 }}>{index + 1}</span>
                  <span className="question-text" style={{ fontWeight: 'bold' }}>{preview}</span>
                </div>
                <div className="controls">
                  <i
                    className={item.isOpen ? "fas fa-toggle-on" : "fas fa-toggle-off"}
                    onClick={() => toggleItemIsOpen(index)}
                    title="Open by default on page"
                    style={{ cursor: 'pointer', color: item.isOpen ? '#10b981' : '#9ca3af' }}
                  />
                  <i
                    className="fas fa-chevron-up"
                    onClick={() => moveItem(index, 'up')}
                    style={{ cursor: 'pointer', opacity: index === 0 ? 0.3 : 1 }}
                  />
                  <i
                    className="fas fa-chevron-down"
                    onClick={() => moveItem(index, 'down')}
                    style={{ cursor: 'pointer', opacity: index === items.length - 1 ? 0.3 : 1 }}
                  />
                  <i
                    className="fas fa-trash"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this FAQ item?')) {
                        deleteFAQItem(index);
                      }
                    }}
                    style={{ cursor: 'pointer', color: '#dc3545' }}
                  />
                </div>
              </FAQItemHeader>
            </FAQItemContainer>
          );
        })}
        <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>
          💡 Click the question or answer in the canvas to edit content (supports bold, italic, color, links).
        </p>
        
        <LightButton onClick={addFAQItem} style={{ width: '100%', marginTop: '10px' }}>
          <i className="fas fa-plus" style={{ marginRight: '8px' }}></i>
          ADD FAQ ITEM
        </LightButton>
      </SettingsGroupLarge>
  
      {/* Spacing Settings */}
      <SettingsGroupLarge>
        <SliderControl
          label="Space between items"
          value={spaceBetweenItems ?? 16}
          min={0}
          max={50}
          onChange={updateProp("spaceBetweenItems")}
        />
        
        <SliderControl
          label="Border rounded corners"
          value={borderRadius ?? 15}
          min={0}
          max={50}
          onChange={updateProp("borderRadius")}
        />
        
        <PaddingSettings
          padding={itemPadding}
          mobilePadding={mobileItemPadding}
          setPadding={updateProp("itemPadding")}
          setMobilePadding={updateProp("mobileItemPadding")}
        />
      </SettingsGroupLarge>
  
      {/* Icon Settings */}
      <SettingsGroupLarge>
        <CheckboxWrapper>
          <Label>Display dropdown icons</Label>
          <CheckboxInput
            checked={displayDropdownIcons || false}
            onChange={(e) => updateProp("displayDropdownIcons")(e.target.checked)}
          />
        </CheckboxWrapper>
  
        {displayDropdownIcons && (
          <>
            <IconSelectorSettings
              iconClass={iconOpenState}
              setIconClass={updateProp("iconOpenState")}
              label="Icon selector (opened state)"
              popularIcons={FAQ_POPULAR_ICONS}
            />

            <IconSelectorSettings
              iconClass={iconClosedState}
              setIconClass={updateProp("iconClosedState")}
              label="Icon selector (closed state)"
              popularIcons={FAQ_POPULAR_ICONS}
            />
            
            <IconColorSettings
              iconColor={{ mobile: mobileIconColor, desktop: iconColor }}
              setIconColor={(value) => {
                updateProp("iconColor")(value.desktop);
                updateProp("mobileIconColor")(value.mobile);
              }}
            />
          </>
        )}
      </SettingsGroupLarge>
  
      {/* Question Settings Group - Keep question styling */}
      <SettingsGroupLarge>
        <Label>Question Settings</Label>
        
        <FontSizeSettings
          fontSize={{ mobile: mobileQuestionFontSize, desktop: questionFontSize }}
          setFontSize={(value) => {
            updateProp("questionFontSize")(value.desktop);
            updateProp("mobileQuestionFontSize")(value.mobile);
          }}
        />
  
        <FontTypeSettings
          fontType={questionFontType}
          setFontType={updateProp("questionFontType")}
          fontFamily={questionFontFamily}
          setFontFamily={updateProp("questionFontFamily")}
          fontStyle={questionFontStyle}
          setFontStyle={updateProp("questionFontStyle")}
        />
  
        <TextColorSettings
          color={{ mobile: mobileQuestionColor, desktop: questionColor }}
          setColor={(value) => {
            updateProp("questionColor")(value.desktop);
            updateProp("mobileQuestionColor")(value.mobile);
          }}
          label="Question color"
        />
  
        <BackgroundColorSettings
          backgroundColor={{ mobile: mobileQuestionBackgroundColor, desktop: questionBackgroundColor }}
          setBackgroundColor={(value) => {
            updateProp("questionBackgroundColor")(value.desktop);
            updateProp("mobileQuestionBackgroundColor")(value.mobile);
          }}
        />
      </SettingsGroupLarge>
        
      <SettingsGroupLarge>
        <Label>Answer Settings</Label>

        <FontSizeSettings
          fontSize={{ mobile: mobileAnswerFontSize, desktop: answerFontSize }}
          setFontSize={(value) => {
            updateProp("answerFontSize")(value.desktop);
            updateProp("mobileAnswerFontSize")(value.mobile);
          }}
        />

        <FontTypeSettings
          fontType={undefined}
          setFontType={() => {}}
          fontFamily={answerFontFamily}
          setFontFamily={updateProp("answerFontFamily")}
          fontStyle={answerFontStyle}
          setFontStyle={updateProp("answerFontStyle")}
        />

        <TextColorSettings
          color={{ mobile: mobileAnswerColor, desktop: answerColor }}
          setColor={(value) => {
            updateProp("answerColor")(value.desktop);
            updateProp("mobileAnswerColor")(value.mobile);
          }}
          label="Answer color"
        />

        <BackgroundColorSettings
          backgroundColor={{ mobile: mobileAnswerBackgroundColor, desktop: answerBackgroundColor }}
          setBackgroundColor={(value) => {
            updateProp("answerBackgroundColor")(value.desktop);
            updateProp("mobileAnswerBackgroundColor")(value.mobile);
          }}
        />
      </SettingsGroupLarge>
  
      {/* Layout Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />
  
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />
  
      <BoxShadowSettings
        boxShadow={{ mobile: mobileBoxShadow, desktop: boxShadow }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop);
          updateProp("mobileBoxShadow")(value.mobile);
        }}
      />

      {/* Border for each FAQ item card */}
      <BorderSettings
        border={itemBorder}
        mobileBorder={mobileItemBorder}
        setBorder={updateProp("itemBorder")}
        setMobileBorder={updateProp("mobileItemBorder")}
      />

      {/* Advanced Settings */}
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />
      
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />
      
      <IDAttributeSettings />
    </>
  );
};
  