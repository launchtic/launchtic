import React from 'react';
import BaseEditor from '../common/BaseEditor';

// Default content for CheckboxContent
const DEFAULT_CONTENT = '<p>I agree to the terms and conditions</p>';

interface CheckboxContentProps {
  rawContentState?: string;
}

const CheckboxContent: React.FC<CheckboxContentProps> = ({ rawContentState }) => {
  return (
    <BaseEditor
      rawContentState={rawContentState}
      defaultContent={DEFAULT_CONTENT}
      displayName="Checkbox"
    />
  );
};

export default CheckboxContent;