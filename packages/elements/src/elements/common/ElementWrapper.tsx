import styled, { css } from "styled-components";

interface ElementWrapperProps {
  $isHover: boolean;
  $isActive: boolean;
  $enabled: boolean;
  $margin?: { marginTop: number; marginRight: number; marginBottom: number; marginLeft: number };
  $mobileMargin?: { marginTop: number; marginRight: number; marginBottom: number; marginLeft: number };
  $appearance?: { desktop: boolean; mobile: boolean };
  $cssDefault?: string;
}

export const ElementWrapper = styled.div<ElementWrapperProps>`
  position: relative;

  ${({ $cssDefault }) => $cssDefault && css`${$cssDefault}`}

  ${({ $enabled }) =>
    $enabled &&
    css`
      min-height: 20px;
  `}
  ${({ $isHover, $isActive, $enabled }) =>
    $enabled &&
    ($isHover || $isActive) &&
    css`
      outline: #2196F3 solid 2px;
    `}

  ${({ $margin }) =>
    $margin &&
    css`
      margin: ${$margin.marginTop}px ${$margin.marginRight}px ${$margin.marginBottom}px ${$margin.marginLeft}px;
    `}

  @media only screen and (min-width: 801px) {
    ${({ $appearance }) => $appearance && !$appearance.desktop && `display: none;`}
  }

  @media only screen and (max-width: 801px) {
    ${({ $appearance }) => $appearance && !$appearance.mobile && `display: none;`}
    ${({ $mobileMargin }) =>
      $mobileMargin &&
      css`
        margin: ${$mobileMargin.marginTop}px ${$mobileMargin.marginRight}px ${$mobileMargin.marginBottom}px ${$mobileMargin.marginLeft}px;
      `}
  }
`;
