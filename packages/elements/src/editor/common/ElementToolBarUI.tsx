import styled from 'styled-components';

// Editor container
export const EditorContainer = styled.div`
  .ProseMirror {
    min-height: 80px;
    height: auto;
    outline: none;

    &:focus {
      outline: none;
    }

    a {
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
    }
  }
`;

// Floating inline-text toolbar — rendered via React portal to <body> so it
// never overlaps the element being edited (or its neighbours). Stays pinned
// near the top of the canvas while the user types.
export const Toolbar = styled.div`
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1500;
    display: flex;
    padding: 6px 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px !important;
    text-align: left !important;
    line-height: normal !important;
    letter-spacing: normal !important;
    align-items: center;
    flex-wrap: nowrap;
    max-width: min(720px, calc(100vw - 32px));
    gap: 2px;
    overflow-x: auto;
    overflow-y: visible;

    /* Keep buttons on one row; if total width exceeds max-width, scroll. */
    & > * { flex-shrink: 0; }

    /* Slim scrollbar */
    scrollbar-width: thin;
    &::-webkit-scrollbar { height: 4px; }
    &::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }

    @media (max-width: 800px) {
      top: auto;
      max-width: calc(100vw - 16px);
    }
`;


interface ToolbarButtonProps {
  $active?: boolean;
}

export const ToolbarButton = styled.button<ToolbarButtonProps>`
  background: ${props => props.$active ? '#e0e0e0' : 'transparent'};
  border: none;
  border-radius: 4px;
  padding: 6px 10px;
  margin: 0 3px;
  cursor: pointer;
  white-space: nowrap;
  font-family: Arial !important;
  font-weight: ${props => props.$active ? 'bold' : 'normal'};

  &:hover {
    background-color: #e0e0e0;
  }
`;

export const ButtonGroup = styled.div`
  margin-bottom: 5px;
`;

export const LinkInput = styled.input`
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  flex: 1;
  min-width: 100px;
  box-sizing: border-box;
`;

export const LinkModalRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
`;

export const LinkButton = styled.button`
  padding: 5px 8px;
  font-size: 16px;
  margin-right: 5px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  &:hover {
    background: #DDDDDD;
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export const ColorPickerContainer = styled.div`
  display: flex;
  gap: 5px;
  margin-right: 12px;
  align-items: center;
`;

export const ColorInput = styled.input`
  width: 30px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #ccc;
  cursor: pointer;
  padding: 0;
  margin: 0 4px;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
  }
`;

export const TextColorLabel = styled.span`
  margin-right: 8px;
  font-size: 14px;
  font-weight: bold;
`;
