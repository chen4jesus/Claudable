export interface LinkMLSlot {
  name: string;
  range?: string;
  required?: boolean;
  multivalued?: boolean;
  description?: string;
  identifier?: boolean;
}

export interface LinkMLClass {
  name: string;
  description?: string;
  slots: string[];
  is_a?: string;
}

export interface LinkMLModel {
  name: string;
  classes: Record<string, LinkMLClass>;
  slots: Record<string, LinkMLSlot>;
}
