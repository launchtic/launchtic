import styled from 'styled-components';
// Styled Components
export const IconSelectorContainer = styled.div`
  position: relative;
`;

export const IconModal = styled.div`
  position: fixed;
  z-index: 35;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  width: 350px;
  overflow-y: auto;
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
`;

export const SectionTitle = styled.div`
  font-weight: 500;
  margin-bottom: 10px;
  font-size: 14px;
  color: #333;
`;

export const IconGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
`;

export const ScrollableIconGrid = styled(IconGrid)`
  max-height: 200px;
  overflow-y: auto;
`;

export const IconButton = styled.div<{ $active: boolean }>`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background-color: ${props => props.$active ? '#f0f0f0' : 'transparent'};
  border-radius: 4px;
  border: ${props => props.$active ? '1px solid #ccc' : '1px solid transparent'};
  
  &:hover {
    background-color: #f5f5f5;
  }
  
  i {
    font-size: 16px;
    color: #2d3748;
  }
`;

export const Section = styled.div`
  padding: 10px;
`;

export const Divider = styled.div`
  height: 1px;
  background-color: #eee;
  margin: 5px 10px;
`;

export const LibrarySelector = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  margin-top: 8px;
  outline: none;
`;
