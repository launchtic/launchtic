// ImageUploadModal.styles.ts
import styled from "styled-components";

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

export const ModalContainer = styled.div`
  background: #fff;
  padding: 28px 32px;
  width: 740px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
  position: relative;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
`;

export const TabHeader = styled.div`
  display: flex;
`;

export const Tab = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 10px;
  color: ${({ $active }) => ($active ? "#2196F3" : "#666")};
  border: none;
  border-bottom: ${({ $active }) => ($active ? "4px solid #2196F3" : "none")};
  cursor: pointer;
  font-weight: bold;
  background: transparent;

  &:hover {
    color: #1976D2;
  }
`;

export const UploadContainer = styled.div`
  padding: 20px;
  text-align: center;
  border: 2px dashed #ccc;
  cursor: pointer;
  margin-top: 20px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border-radius: 8px;
  background: #fafafa;
`;

export const BrowserLayout = styled.div`
  display: flex;
  gap: 0;
  flex: 1;
  overflow: hidden;
  margin-top: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
`;

export const FolderSidebar = styled.div`
  width: 156px;
  flex-shrink: 0;
  border-right: 1px solid #e8e8e8;
  overflow-y: auto;
  padding: 8px 0;
  background: #fafafa;
  border-radius: 10px 0 0 10px;
`;

export const FolderItem = styled.button<{ $active: boolean }>`
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  border: none;
  background: ${({ $active }) => ($active ? "#e8f0fe" : "transparent")};
  color: ${({ $active }) => ($active ? "#1a73e8" : "#444")};
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
  &:hover { background: ${({ $active }) => ($active ? "#e8f0fe" : "#f0f0f0")}; }
`;

export const FolderInput = styled.input`
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid #1a73e8;
  border-radius: 4px;
  outline: none;
`;

export const NewFolderBtn = styled.button`
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: #1a73e8;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: #f0f4ff; }
`;

export const ImageGridWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0 10px 10px 0;
`;

export const ImageGrid = styled.div`
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 12px;
`;


export const ImageItem = styled.img`
  width: 100%;
  height: 84px;
  object-fit: cover;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.15s;
  /* Checkerboard behind the image so transparent / white logos stay visible
     instead of blending into the white tile. Opaque photos cover it. */
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #d9d9d9 25%, transparent 25%),
    linear-gradient(-45deg, #d9d9d9 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d9d9d9 75%),
    linear-gradient(-45deg, transparent 75%, #d9d9d9 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  &:hover { opacity: 0.85; }
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 25px;
  cursor: pointer;
  position: absolute;
  top: 15px;
  right: 20px;
`;

export const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  flex-direction: column;
  color: #666;
`;

export const ErrorContainer = styled.div`
  padding: 20px;
  text-align: center;
  color: #d32f2f;
  background: #ffebee;
  border-radius: 5px;
  margin-top: 20px;
`;

export const BottomContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid #e8e8e8;
  background: #fafafa;
  border-radius: 0 0 10px 0;
`;

export const LoadMoreButton = styled.button`
  padding: 12px 24px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
  white-space: nowrap;

  &:hover {
    background: #1976D2;
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;



export const ImageStats = styled.div`
  color: #666;
  font-size: 14px;
  padding: 10px;
  flex: 1;
`;

export const ActionButton = styled.button<{ variant?: 'primary' | 'danger' }>`
  padding: 10px 20px;
  background: ${({ variant }) => 
    variant === 'danger' ? '#f44336' : '#2196F3'};
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
  min-width: 80px;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`;