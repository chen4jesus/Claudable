export type AiSmartEditMessage =
  | { type: 'AI_SMART_EDIT:ENABLE'; payload: Record<string, never> }
  | { type: 'AI_SMART_EDIT:DISABLE'; payload: Record<string, never> }
  | { type: 'AI_SMART_EDIT:SELECTED'; payload: ElementContext }
  | { type: 'AI_SMART_EDIT:PING' }
  | { type: 'AI_SMART_EDIT:PONG' }
  | { type: 'AI_SMART_EDIT:SCROLL_UPDATE'; payload: { isBottom: boolean } };

export interface ElementContext {
  tagName: string;
  id: string;
  className: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles: {
    display: string;
    position: string;
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    margin: string;
    padding: string;
    border: string;
    borderRadius: string;
    zIndex: string;
    textAlign: string;
    opacity: string;
    visibility: string;
  };
  innerText: string;
  html: string;
  selector: string;
  parent: {
    tagName: string;
    id: string;
  } | null;
  url: string;
  route: string;
  viewport: {
    width: number;
    height: number;
  };
}
