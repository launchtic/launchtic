import React from "react";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  UploadIcon
} from "../common/SettingsUI";
import IconSelector from '../common/IconSelector';

// Default popular icons - can be overridden from the outside
const DEFAULT_POPULAR_ICONS = [
  'fas fa-check',
  'fas fa-check-double',
  'far fa-square',
  'fas fa-square-check',
  'fas fa-circle-check',
  'fas fa-circle',
  'fas fa-arrow-right',
  'fas fa-lightbulb',
  'fas fa-circle-exclamation',
  'fas fa-chevron-right',
  'fas fa-angle-right',
  'bi bi-check-circle',
  'bi bi-check-square'
];

type IconSelectorSettingsProps = {
  iconClass?: string;
  setIconClass: (iconClassName: string) => void;
  label?: string;
  popularIcons?: string[];
};

export const IconSelectorSettings: React.FC<IconSelectorSettingsProps> = ({
  iconClass = '',
  setIconClass,
  label = 'Icon selector',
  popularIcons = DEFAULT_POPULAR_ICONS
}) => {
  // Custom button content for IconSelector
  const renderIconSelectorButton = (toggleModal: () => void) => (
    <InputWrapper onClick={toggleModal}>
      <Input
        type="text"
        placeholder="Select an icon"
        value={iconClass}
        readOnly={true}
      />
      {iconClass && (
        <UploadIcon title="Icon preview">
          <i className={iconClass}></i>
        </UploadIcon>
      )}
      {iconClass && (
        <UploadIcon 
          onClick={(e) => {
            e.stopPropagation();
            setIconClass('');
          }} 
          title="Remove icon"
        >
          <i className="fas fa-ban"></i>
        </UploadIcon>
      )}
    </InputWrapper>
  );

  return (
    <SettingsGroup>
      <Label>{label}</Label>
      <IconSelector
        currentIconType={iconClass}
        onSelectIcon={setIconClass}
        popularIcons={popularIcons}
        renderButton={renderIconSelectorButton}
      />
    </SettingsGroup>
  );
};

export default IconSelectorSettings;