import React from "react";
import { useEditor, Element } from "@launchtic/editor-core";
import { useEditorContext } from "./EditorContext";
import {
  Field,
  Checkbox,
  Button,
  Text,
  Headline,
  BulletedList,
  Image,
  Icon,
  Video,
  Section,
  Row,
  Column,
  FAQ,
  Countdown,
  Menu,
  Coupon,
  OfferPrice,
  OrderBump,
  PhysicalProduct,
  PaymentButton,
  PaymentMethod,
  AcceptOfferButton,
  DeclineOfferButton,
  DEFAULT_STYLES,
  getIconPath,
} from "../../index";

import {
  SidebarContainer,
  ToolboxItem,
  ToolboxGrid,
  ToolboxSection,
  ToolboxSectionTitle,
  ToolboxItemContent,
  IconWrapper,
  CustomIconWrapper,
  ColumnBar,
  ItemLabel,
} from "./layout/EditorUI";


// Which sections to show per step type
const SECTION_RULES = {
  payment: ["CHECKOUT"],
  offer:   ["UPSELL", "DOWNSELL"],
} as const;

function allowed(section: keyof typeof SECTION_RULES, stepType: string) {
  return (SECTION_RULES[section] as readonly string[]).includes(stepType);
}

export const Toolbox: React.FC = () => {
  const { connectors } = useEditor();
  const { stepType } = useEditorContext();

  const createElement = (ref: HTMLDivElement | null, element: React.ReactElement) => {
    if (ref) connectors.create(ref, element);
  };

  return (
    <SidebarContainer>

      {allowed("payment", stepType) && (
      <ToolboxSection>
        <ToolboxSectionTitle>Payment Form</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem ref={(ref) => createElement(ref, <PaymentButton {...DEFAULT_STYLES.paymentButton} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-hand-holding-dollar"></i>
              </IconWrapper>
              <ItemLabel>Payment Button</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <PaymentMethod {...DEFAULT_STYLES.paymentMethod} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-credit-card"></i>
              </IconWrapper>
              <ItemLabel>Payment Method</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <Coupon {...DEFAULT_STYLES.coupon} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-ticket-alt"></i>
              </IconWrapper>
              <ItemLabel>Coupon</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <OfferPrice {...DEFAULT_STYLES.offerPrice} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-dollar-sign"></i>
              </IconWrapper>
              <ItemLabel>Offer Price</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <PhysicalProduct {...DEFAULT_STYLES.physicalProduct} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-box"></i>
              </IconWrapper>
              <ItemLabel>Physical Product</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref,
            <Row {...{
                ...DEFAULT_STYLES.row,
                backgroundColor: "#F4FDF8",
                border: {
                  radius: 5,
                  style: "dashed",
                  color: "#51DF8A",
                  width: 3,
                  type: "fullBorder"
                }
              }}>
                <Element canvas is={Column} size={12} index={0}>
                  <OrderBump {...DEFAULT_STYLES.orderBump} />
                  <Text {...{
                    ...DEFAULT_STYLES.text,
                    rawContentState: JSON.stringify({
                      html: "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Autem dolore, alias, numquam enim ab voluptate id quam harum ducimus cupiditate similique quisquam et deserunt, recusandae."
                    }),
                    fontSize: 16,
                    mobileFontSize: 14,
                    margin: { marginTop: 10, marginBottom: 0, marginLeft: 0, marginRight: 0 },
                    mobileMargin: { marginTop: 10, marginBottom: 0, marginLeft: 0, marginRight: 0 }
                  }} />
                </Element>
              </Row>
            )}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-cart-plus"></i>
              </IconWrapper>
              <ItemLabel>Order Bump</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>
      )}

      {allowed("offer", stepType) && (
      <ToolboxSection>
        <ToolboxSectionTitle>Offer</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem ref={(ref) => createElement(ref, <AcceptOfferButton {...DEFAULT_STYLES.button} text="Yes, add it to my order" />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-circle-check"></i>
              </IconWrapper>
              <ItemLabel>Accept offer button</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <DeclineOfferButton {...DEFAULT_STYLES.button} text="No thanks" backgroundColor="transparent" color="#6b7280" />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-circle-xmark"></i>
              </IconWrapper>
              <ItemLabel>Decline offer button</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          {/* OfferPrice + PhysicalProduct also live in the Payment Form section
              for CHECKOUT; we surface them here so designers can drop them onto
              UPSELL/DOWNSELL pages (needed for PHYSICAL upsell — visitor must
              be able to pick variant/qty on the offer page). */}
          <ToolboxItem ref={(ref) => createElement(ref, <OfferPrice {...DEFAULT_STYLES.offerPrice} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-dollar-sign"></i>
              </IconWrapper>
              <ItemLabel>Offer Price</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <PhysicalProduct {...DEFAULT_STYLES.physicalProduct} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fa-solid fa-box"></i>
              </IconWrapper>
              <ItemLabel>Physical Product</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>
      )}

      <ToolboxSection>
        <ToolboxSectionTitle>Text</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem ref={(ref) => createElement(ref, <Text {...DEFAULT_STYLES.text} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('text')} alt="" />
              </IconWrapper>
              <ItemLabel>Text</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <Headline {...DEFAULT_STYLES.headline} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('heading')} alt="" />
              </IconWrapper>
              <ItemLabel>Headline text</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <BulletedList {...DEFAULT_STYLES.bulletedList} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('list-bullet')} alt="" />
              </IconWrapper>
              <ItemLabel>Bulleted list</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <FAQ {...DEFAULT_STYLES.faq} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fas fa-question-circle"></i>
              </IconWrapper>
              <ItemLabel>FAQ</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <Countdown {...DEFAULT_STYLES.countdown} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fas fa-clock"></i>
              </IconWrapper>
              <ItemLabel>Countdown</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
          <ToolboxItem ref={(ref) => createElement(ref, <Menu {...DEFAULT_STYLES.menu} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fas fa-bars"></i>
              </IconWrapper>
              <ItemLabel>Menu</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>

      <ToolboxSection>
        <ToolboxSectionTitle>Column layout</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem
            ref={(ref) =>
              createElement(
                ref,
                <Row {...DEFAULT_STYLES.row}>
                  {[3, 3, 3, 3].map((size, index) => (
                    <Element canvas is={Column} key={index} size={size} index={index}></Element>
                  ))}
                </Row>
              )
            }
          >
            <ToolboxItemContent>
              <CustomIconWrapper>
                <ColumnBar $width="8px" $height="30px" />
                <ColumnBar $width="8px" $height="30px" />
                <ColumnBar $width="8px" $height="30px" />
                <ColumnBar $width="8px" $height="30px" />
              </CustomIconWrapper>
              <ItemLabel>4 columns</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem
            ref={(ref) =>
              createElement(
                ref,
                <Row {...DEFAULT_STYLES.row}>
                  {[4, 4, 4].map((size, index) => (
                    <Element canvas is={Column} key={index} size={size} index={index}></Element>
                  ))}
                </Row>
              )
            }
          >
            <ToolboxItemContent>
              <CustomIconWrapper>
                <ColumnBar $width="12px" $height="30px" />
                <ColumnBar $width="12px" $height="30px" />
                <ColumnBar $width="12px" $height="30px" />
              </CustomIconWrapper>
              <ItemLabel>3 columns</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem
            ref={(ref) =>
              createElement(
                ref,
                <Row {...DEFAULT_STYLES.row}>
                  {[6, 6].map((size, index) => (
                    <Element canvas is={Column} key={index} size={size} index={index}></Element>
                  ))}
                </Row>
              )
            }
          >
            <ToolboxItemContent>
              <CustomIconWrapper>
                <ColumnBar $width="20px" $height="30px" />
                <ColumnBar $width="20px" $height="30px" />
              </CustomIconWrapper>
              <ItemLabel>2 columns</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem
            ref={(ref) =>
              createElement(
                ref,
                <Row {...DEFAULT_STYLES.row}>
                  <Element canvas is={Column} size={12} index={0}></Element>
                </Row>
              )
            }
          >
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('row')} alt="" />
              </IconWrapper>
              <ItemLabel>Row</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem
            ref={(ref) =>
              createElement(
                ref,
                <Element canvas is={Section} {...DEFAULT_STYLES.section}>
                  <Row {...DEFAULT_STYLES.row}>
                    <Element canvas is={Column} size={12} index={0}></Element>
                  </Row>
                </Element>
              )
            }
          >
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('section')} alt="" />
              </IconWrapper>
              <ItemLabel>Section</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>

      <ToolboxSection>
        <ToolboxSectionTitle>Media</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem ref={(ref) => createElement(ref, <Image {...DEFAULT_STYLES.image} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('image')} alt="" />
              </IconWrapper>
              <ItemLabel>Image</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <Icon {...DEFAULT_STYLES.icon} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fas fa-icons" />
              </IconWrapper>
              <ItemLabel>Icon</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <Video {...DEFAULT_STYLES.video} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('video')} alt="" />
              </IconWrapper>
              <ItemLabel>Video</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>

      <ToolboxSection>
        <ToolboxSectionTitle>Form</ToolboxSectionTitle>
        <ToolboxGrid>
          <ToolboxItem ref={(ref) => createElement(ref, <Button {...DEFAULT_STYLES.button} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('button')} alt="" />
              </IconWrapper>
              <ItemLabel>Button</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <Field {...DEFAULT_STYLES.field} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <img src={getIconPath('input')} alt="" />
              </IconWrapper>
              <ItemLabel>Input</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>

          <ToolboxItem ref={(ref) => createElement(ref, <Checkbox {...DEFAULT_STYLES.checkbox} />)}>
            <ToolboxItemContent>
              <IconWrapper>
                <i className="fas fa-check-square"></i>
              </IconWrapper>
              <ItemLabel>Checkbox</ItemLabel>
            </ToolboxItemContent>
          </ToolboxItem>
        </ToolboxGrid>
      </ToolboxSection>

    </SidebarContainer>
  );
};
