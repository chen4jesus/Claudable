import type { LinkMLModel } from '../types/linkml';

function mapLinkMLTypeToJsonType(range?: string): string {
  switch (range?.toLowerCase()) {
    case 'integer':
    case 'int':
      return 'integer';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'float':
    case 'double':
    case 'number':
    case 'decimal':
      return 'number';
    case 'date':
    case 'datetime':
    case 'time':
      return 'string';
    default:
      return 'string';
  }
}

export function generateJsonSchema(model: LinkMLModel): any {
  const schema: any = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: model.name,
    type: 'object',
    definitions: {},
  };

  for (const [className, classDef] of Object.entries(model.classes)) {
    const classDefinition: any = {
      type: 'object',
      properties: {},
      description: classDef.description,
    };

    const required: string[] = [];

    for (const slotId of classDef.slots) {
      const slot = model.slots[slotId];
      if (!slot) continue;

      const property: any = {};
      const propertyName = slot.name || slotId; // Use display name if available

      if (slot.range) {
        if (model.classes[slot.range]) {
          property['$ref'] = `#/definitions/${slot.range}`;
        } else {
          property['type'] = mapLinkMLTypeToJsonType(slot.range);
        }
      } else {
        property['type'] = 'string';
      }

      if (slot.description) {
        property['description'] = slot.description;
      }

      if (slot.multivalued) {
        classDefinition.properties[propertyName] = {
          type: 'array',
          items: property,
        };
      } else {
        classDefinition.properties[propertyName] = property;
      }

      if (slot.required) {
        required.push(propertyName);
      }
    }

    if (required.length > 0) {
      classDefinition.required = required;
    }

    schema.definitions[className] = classDefinition;
  }

  return schema;
}
