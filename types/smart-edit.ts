export type AiSmartEditMessage =
  | { type: 'AI_SMART_EDIT:ENABLE'; payload: Record<string, never> }
  | { type: 'AI_SMART_EDIT:DISABLE'; payload: Record<string, never> }
  | { type: 'AI_SMART_EDIT:SELECTED'; payload: ElementContext }
  | { type: 'AI_SMART_EDIT:PING' }
  | { type: 'AI_SMART_EDIT:PONG' }
  | { type: 'AI_SMART_EDIT:SCROLL_UPDATE'; payload: { isBottom: boolean } }
  // Edit mode messages
  | { type: 'AI_SMART_EDIT:EDIT_MODE_ENABLE' }
  | { type: 'AI_SMART_EDIT:EDIT_MODE_DISABLE' }
  | { type: 'AI_SMART_EDIT:IMAGE_CLICK'; payload: ImageClickContext }
  | { type: 'AI_SMART_EDIT:LINK_CLICK'; payload: LinkClickContext }
  | { type: 'AI_SMART_EDIT:UPDATE_IMAGE'; payload: { selector: string; src: string } }
  | { type: 'AI_SMART_EDIT:UPDATE_ATTR'; payload: { srcId: string; attrName: string; value: string } }
  | { type: 'AI_SMART_EDIT:UPDATE_LINK'; payload: { selector: string; href: string; text?: string } }
  | { type: 'AI_SMART_EDIT:SAVE_PAGE' }
  | { type: 'AI_SMART_EDIT:UPDATE_ELEMENT'; payload: { srcId: string; newHtml: string } }
  | { type: 'AI_SMART_EDIT:PAGE_CONTENT'; payload: { html: string; route: string; filePath?: string; changes?: any[] } }
  | { type: 'AI_SMART_EDIT:SAVE_RESULT'; payload: { success: boolean; error?: string } }
  | { type: 'AI_SMART_EDIT:READY' }
  | { type: 'AI_SMART_EDIT:SET_SOURCE_BASELINE'; payload: { srcId: string; fragment: string } };

export interface ImageClickContext {
  selector: string;
  srcId?: string | null;
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface LinkClickContext {
  selector: string;
  srcId?: string | null;
  href: string;
  text: string;
  hasChildren: boolean;
}

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
  srcId?: string | null;
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
  attributes?: {
    href?: string | null;
    src?: string | null;
    alt?: string | null;
    title?: string | null;
    value?: string | null;
  };
}
