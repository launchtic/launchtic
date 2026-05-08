import React, { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import BaseEditor from '../common/BaseEditor';
import { ButtonGroup, ToolbarButton } from '../../editor/common/ElementToolBarUI';

// Define heading font size and line height mappings
const HEADING_STYLES = {
  h1: { fontSize: 40, lineHeight: 48, mobileFontSize: 30, mobileLineHeight: 36 },
  h2: { fontSize: 32, lineHeight: 38, mobileFontSize: 24, mobileLineHeight: 28 },
  h3: { fontSize: 28, lineHeight: 33, mobileFontSize: 22, mobileLineHeight: 26 },
  h4: { fontSize: 24, lineHeight: 28, mobileFontSize: 20, mobileLineHeight: 24 },
  h5: { fontSize: 20, lineHeight: 25, mobileFontSize: 16, mobileLineHeight: 19 },
  h6: { fontSize: 16, lineHeight: 19, mobileFontSize: 14, mobileLineHeight: 16 },
};

// Default content
const DEFAULT_CONTENT = '<h2>Call to Action Headline.</h2>';

interface HeadlineContentProps {
  rawContentState?: string;
}

const HeadlineContent: React.FC<HeadlineContentProps> = ({ rawContentState }) => {
  const [currentHeadingLevel, setCurrentHeadingLevel] = useState<number>(2); // Default to H2

  // Function to update fontSize, lineHeight, mobileFontSize, mobileLineHeight
  const updateHeadingStyles = useCallback((level: number, setProp: any) => {
    const headingKey = `h${level}` as keyof typeof HEADING_STYLES;
    const styles = HEADING_STYLES[headingKey];
    
    setProp((props: any) => {
      props.fontSize = styles.fontSize;
      props.lineHeight = styles.lineHeight;
      props.mobileFontSize = styles.mobileFontSize;
      props.mobileLineHeight = styles.mobileLineHeight;
    });
  }, []);


  // Handle heading changes
  const toggleHeading = useCallback((level: number, editor: Editor, setProp: any) => {
    if (!editor) return;
    
    // TypeScript needs level to be explicitly typed as 1|2|3|4|5|6
    const headingLevel = level as 1|2|3|4|5|6;
    editor.chain().focus().toggleHeading({ level: headingLevel }).run();
    
    // Update the heading level state and properties
    if (editor.isActive('heading', { level: headingLevel })) {
      setCurrentHeadingLevel(level);
      updateHeadingStyles(level, setProp);
    } else if (!editor.isActive('heading')) {
      // If no heading is active, revert to default (H2)
      setCurrentHeadingLevel(2);
      updateHeadingStyles(2, setProp);
    }
  }, [updateHeadingStyles]);

  // Render custom heading buttons for the toolbar
  const renderHeadingButtons = (editor: Editor | null, setProp: any) => {
    if (!editor) return null;
    
    return (
      <ButtonGroup>
        {Array.from({length: 6}, (_, i) => i + 1).map(level => (
          <ToolbarButton 
            key={`heading-${level}`}
            onClick={() => toggleHeading(level, editor, setProp)}
            $active={editor.isActive('heading', { level })}
            title={`Heading ${level}`}
          >
            H{level}
          </ToolbarButton>
        ))}
      </ButtonGroup>
    );
  };

  return (
    <BaseEditor
      rawContentState={rawContentState}
      defaultContent={DEFAULT_CONTENT}
      displayName="Headline"
      renderToolbarCustomButtons={renderHeadingButtons}
    />
  );
};

export default HeadlineContent;