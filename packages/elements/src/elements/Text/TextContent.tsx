import React from 'react';
import BaseEditor from '../common/BaseEditor';

// Default content for TextContent
const DEFAULT_CONTENT = '<p>Lorem ipsum dolor sit amet, consectetur adipisicing elit.</p>';

interface TextContentProps {
  rawContentState?: string;
}

const TextContent: React.FC<TextContentProps> = ({ rawContentState }) => {
  return (
    <BaseEditor
      rawContentState={rawContentState}
      defaultContent={DEFAULT_CONTENT}
      displayName="Text"
    />
  );
};

export default TextContent;